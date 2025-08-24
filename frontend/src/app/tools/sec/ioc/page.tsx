'use client';

import React, { useMemo, useState } from 'react';

/* ---------------- UI bits ---------------- */
const mono: React.CSSProperties = { fontFamily: 'ui-monospace, Menlo, monospace' };
const card: React.CSSProperties = { border:'1px solid #e5e7eb', borderRadius:12, padding:16, background:'#fff' };
const btn: React.CSSProperties  = { border:'1px solid #e5e7eb', background:'#fff', padding:'8px 12px', borderRadius:8, cursor:'pointer' };
const inputCss: React.CSSProperties = { border:'1px solid #e5e7eb', borderRadius:8, padding:'10px 12px', width:'100%', font:'inherit' };
const taCss: React.CSSProperties = { ...inputCss, height:200, resize:'vertical' as const };
const pill = (c: string) => ({ display:'inline-block', padding:'2px 8px', borderRadius:999, fontSize:12, background: c+'22', color: c, border: '1px solid '+c+'55' });

/* --------------- helpers --------------- */
type IOCType = 'ipv4'|'ipv6'|'domain'|'url'|'email'|'md5'|'sha1'|'sha256'|'sha512'|'cve';
type IOC = { type: IOCType; value: string; normalized?: string; source: string; line: number; notes?: string[] };

const IPV4_RE = /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g;
const IPV6_RE = /\b(?:(?:[A-F0-9]{1,4}:){2,7}[A-F0-9]{0,4}|::(?:[A-F0-9]{1,4}:){0,6}[A-F0-9]{0,4})\b/gi;
const URL_RE  = /\b(?:https?|hxxps?):\/\/[^\s"'<>]+/gi;
const DOMAIN_RE = /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}\b/gi;
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,63}\b/gi;
const MD5_RE = /\b[a-f0-9]{32}\b/gi;
const SHA1_RE = /\b[a-f0-9]{40}\b/gi;
const SHA256_RE = /\b[a-f0-9]{64}\b/gi;
const SHA512_RE = /\b[a-f0-9]{128}\b/gi;
const CVE_RE = /\bCVE-\d{4}-\d{4,7}\b/gi;

function isPrivateIPv4(ip: string) {
  const p = ip.split('.').map(Number);
  if (p[0] === 10) return true;
  if (p[0] === 127) return true;
  if (p[0] === 169 && p[1] === 254) return true;
  if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
  if (p[0] === 192 && p[1] === 168) return true;
  return false;
}
function isReservedIPv4(ip: string) {
  const p = ip.split('.').map(Number);
  if (p[0] >= 224) return true; // multicast/broadcast
  if (p[0] === 0) return true;
  return false;
}

function refang(s: string) {
  let out = s;
  // hxxp(s) -> http(s)
  out = out.replace(/^hxxp(s?):\/\//i, (_m, g1) => `http${g1}://`);
  // [.] (.) {.} -> .
  out = out.replace(/\[\.\]|\(\.\)|\{\.\}/g, '.');
  // [:] -> :
  out = out.replace(/\[\:\]|\(\:\)|\{\:\}/g, ':');
  // defanged slashes (like hxxp:\/\// or ://
  out = out.replace(/:\\\/\\\//g, '://').replace(/:\/\//g, '://');
  // stray brackets around dots/colons
  out = out.replace(/\[(\.)\]/g, '$1').replace(/\[(\:)\]/g, '$1');
  // spaces around dots like "example . com"
  out = out.replace(/\s*\.\s*/g, '.');
  return out;
}

function lineNumberForIndex(text: string, index: number) {
  // count \n before index
  let count = 1;
  for (let i=0;i<index;i++){ if (text.charCodeAt(i) === 10) count++; }
  return count;
}

function pushMatches(arr: IOC[], type: IOCType, name: string, text: string, re: RegExp, transform?: (m: RegExpExecArray)=>IOC | null) {
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const idx = m.index;
    const line = lineNumberForIndex(text, idx);
    if (transform) {
      const item = transform(m);
      if (item) arr.push({ ...item, type, source: name, line });
    } else {
      arr.push({ type, value: m[0], source: name, line });
    }
  }
}

function normalizeURL(u: string) {
  try {
    const url = new URL(u);
    // strip trailing punctuation commonly found in logs
    url.hash = '';
    return url.toString().replace(/[),.;]+$/, '');
  } catch {
    // try refang then parse
    try { return new URL(refang(u)).toString(); } catch { return u; }
  }
}

const SUSP_TLDS = new Set(['xyz','top','gq','cf','tk','work','click','fit','link','party','kim','download','country','stream','xin','rest','review','fit','cn','ru']);

function extractIocs(name: string, text: string, options: { autoRefang: boolean }): IOC[] {
  const out: IOC[] = [];

  // URLs (including defanged)
  pushMatches(out, 'url', name, text, URL_RE, (m) => {
    const raw = m[0];
    const norm = normalizeURL(options.autoRefang ? refang(raw) : raw);
    return { type:'url', value: raw, normalized: norm, source: name, line: 1 };
  });

  // Domains (also catch defanged like example[.]com)
  pushMatches(out, 'domain', name, text.replace(/\[\.\]|\(\.\)|\{\.\}/g,'.'), DOMAIN_RE, (m) => {
    const d = m[0].toLowerCase();
    const tld = d.split('.').pop() || '';
    const notes = [];
    if (d.startsWith('xn--')) notes.push('punycode (IDN)');
    if (SUSP_TLDS.has(tld)) notes.push('suspicious/rare TLD');
    return { type:'domain', value: d, normalized: d, source: name, line: 1, notes };
  });

  // IPv4
  pushMatches(out, 'ipv4', name, text, IPV4_RE, (m) => {
    const ip = m[0];
    const notes: string[] = [];
    if (isPrivateIPv4(ip)) notes.push('private range');
    else if (isReservedIPv4(ip)) notes.push('reserved/broadcast');
    return { type:'ipv4', value: ip, source: name, line: 1, notes };
  });

  // IPv6 (simple)
  pushMatches(out, 'ipv6', name, text, IPV6_RE);

  // Email
  pushMatches(out, 'email', name, text, EMAIL_RE);

  // Hashes
  pushMatches(out, 'md5', name, text, MD5_RE);
  pushMatches(out, 'sha1', name, text, SHA1_RE);
  pushMatches(out, 'sha256', name, text, SHA256_RE);
  pushMatches(out, 'sha512', name, text, SHA512_RE);

  // CVE IDs
  pushMatches(out, 'cve', name, text, CVE_RE);

  // Fill accurate line numbers post-hoc (we used 1 above in transforms)
  // Re-run simple index->line for items missing it because transform may have set 1
  function setLines(re: RegExp, valueGetter: (ioc: IOC) => string) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const idx = m.index;
      const line = lineNumberForIndex(text, idx);
      const v = m[0];
      const hit = out.find(h => h.value === v && h.line === 1 && valueGetter(h) === v);
      if (hit) hit.line = line;
    }
  }
  setLines(URL_RE, i=>i.value);
  setLines(DOMAIN_RE, i=>i.value);
  setLines(IPV4_RE, i=>i.value);
  setLines(IPV6_RE, i=>i.value);
  setLines(EMAIL_RE, i=>i.value);
  setLines(MD5_RE, i=>i.value);
  setLines(SHA1_RE, i=>i.value);
  setLines(SHA256_RE, i=>i.value);
  setLines(SHA512_RE, i=>i.value);
  setLines(CVE_RE, i=>i.value);

  return out;
}

function dedupeIOCs(list: IOC[]) {
  const key = (x: IOC) => `${x.type}|${(x.normalized || x.value).toLowerCase()}`;
  const seen = new Set<string>();
  const out: IOC[] = [];
  for (const i of list) {
    const k = key(i);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(i);
  }
  return out;
}

function toCSV(rows: Array<Record<string, any>>) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const esc = (v: any) => {
    const s = v == null ? '' : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  return [headers.join(','), ...rows.map(r => headers.map(h => esc(r[h])).join(','))].join('\n');
}

function download(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href), 2000);
}

/* --------------- Page --------------- */
type Bucket = { title: string; type: IOCType; color: string };

const BUCKETS: Bucket[] = [
  { title:'URLs', type:'url', color:'#2563eb' },
  { title:'Domains', type:'domain', color:'#0ea5e9' },
  { title:'IPv4', type:'ipv4', color:'#22c55e' },
  { title:'IPv6', type:'ipv6', color:'#16a34a' },
  { title:'Emails', type:'email', color:'#f59e0b' },
  { title:'MD5', type:'md5', color:'#ef4444' },
  { title:'SHA1', type:'sha1', color:'#ef4444' },
  { title:'SHA256', type:'sha256', color:'#ef4444' },
  { title:'SHA512', type:'sha512', color:'#ef4444' },
  { title:'CVE IDs', type:'cve', color:'#9333ea' },
];

export default function IOCExtractor() {
  const [text, setText] = useState('');
  const [autoRefang, setAutoRefang] = useState(true);
  const [results, setResults] = useState<IOC[]>([]);
  const [busy, setBusy] = useState(false);

  const summary = useMemo(() => {
    const dd = dedupeIOCs(results);
    const byType = new Map<IOCType, IOC[]>();
    for (const b of BUCKETS) byType.set(b.type, []);
    for (const i of dd) (byType.get(i.type) || []).push(i);
    return { all: dd, byType };
  }, [results]);

  async function scanPasted() {
    setBusy(true);
    const iocs = extractIocs('(pasted)', text, { autoRefang });
    setResults(iocs);
    setBusy(false);
  }

  async function onPick(fl: FileList | null) {
    if (!fl) return;
    setBusy(true);
    const outs: IOC[] = [];
    for (const f of Array.from(fl).slice(0, 32)) {
      let t = '';
      try { t = await f.text(); } catch { t = ''; }
      outs.push(...extractIocs(f.name, t, { autoRefang }));
    }
    setResults(outs);
    setBusy(false);
  }

  function copyList(type: IOCType) {
    const list = (summary.byType.get(type) || []).map(i => i.normalized || i.value).join('\n');
    navigator.clipboard.writeText(list);
  }

  function exportCSV(type?: IOCType) {
    const rows = (type ? (summary.byType.get(type) || []) : summary.all).map(i => ({
      type: i.type,
      value: i.value,
      normalized: i.normalized || '',
      source: i.source,
      line: i.line,
      notes: (i.notes || []).join('; ')
    }));
    download(type ? `iocs_${type}.csv` : 'iocs_all.csv', toCSV(rows));
  }

  function clearAll() {
    setText(''); setResults([]);
  }

  return (
    <div style={{ display:'grid', gap:16 }}>
      <h1 style={{ margin:0 }}>IOC Extractor</h1>
      <p style={{ margin:0, color:'#555' }}>
        Paste logs, emails, or indicators — we’ll extract IPs, domains, URLs, emails, hashes, and CVE IDs.
        Everything runs in your browser. Toggle <b>auto-refang</b> to convert <code style={mono}>hxxps://example[.]com</code> → <code style={mono}>https://example.com</code>.
      </p>

      {/* Input */}
      <div style={card}>
        <div style={{ fontWeight:700, marginBottom:8 }}>Paste text</div>
        <textarea value={text} onChange={e=>setText(e.target.value)} placeholder={`Example:
Blocked outbound to hxxps://malicious[.]site/payload
Email: phishing@example.com
IP: 185.203.116.5
Hash: 44d88612fea8a8f36de82e1278abb02f (MD5)
CVE-2024-3094`} style={taCss} />
        <div style={{ display:'flex', gap:12, marginTop:8, alignItems:'center', flexWrap:'wrap' }}>
          <button onClick={scanPasted} style={btn}>Extract IOCs</button>
          <button onClick={clearAll} style={btn}>Clear</button>
          <label style={{ display:'flex', alignItems:'center', gap:8 }}>
            <input type="checkbox" checked={autoRefang} onChange={e=>setAutoRefang(e.target.checked)} />
            Auto-refang defanged IOCs
          </label>
        </div>
      </div>

      {/* File picker */}
      <div style={card}>
        <div style={{ fontWeight:700, marginBottom:8 }}>Or drop files</div>
        <input type="file" multiple onChange={e=>onPick(e.target.files)} />
        <div style={{ fontSize:12, color:'#6b7280', marginTop:6 }}>
          Text-like files (.txt, .log, .eml, .json) work best. We read locally; nothing is uploaded.
        </div>
      </div>

      {busy && <div>Scanning…</div>}

      {/* Summary */}
      <div style={card}>
        <div style={{ fontWeight:700, marginBottom:8 }}>Summary</div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          {BUCKETS.map(b => {
            const count = (summary.byType.get(b.type) || []).length;
            return (
              <div key={b.type} style={{ ...pill(b.color) as React.CSSProperties }}>
                {b.title}: {count}
              </div>
            );
          })}
          <div style={{ ...pill('#111827'), background:'#11182711', color:'#111827', border:'1px solid #11182733' }}>
            Total unique: {summary.all.length}
          </div>
        </div>
        <div style={{ marginTop:8, display:'flex', gap:8, flexWrap:'wrap' }}>
          <button onClick={()=>exportCSV()} style={btn}>Export ALL as CSV</button>
        </div>
      </div>

      {/* Buckets */}
      {BUCKETS.map(b => {
        const list = (summary.byType.get(b.type) || []);
        if (!list.length) return null;
        return (
          <div key={b.type} style={card}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ fontWeight:700 }}>{b.title}</div>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={()=>copyList(b.type)} style={btn}>Copy list</button>
                <button onClick={()=>exportCSV(b.type)} style={btn}>Export CSV</button>
              </div>
            </div>
            <div style={{ overflowX:'auto', marginTop:8 }}>
              <table style={{ width:'100%', borderCollapse:'separate', borderSpacing:0 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign:'left' }}>Value</th>
                    <th style={{ textAlign:'left' }}>Normalized</th>
                    <th style={{ textAlign:'left' }}>Source</th>
                    <th style={{ textAlign:'left' }}>Line</th>
                    <th style={{ textAlign:'left' }}>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((i, idx) => (
                    <tr key={idx}>
                      <td style={{ padding:'4px 6px' }}><code style={{ ...mono, wordBreak:'break-all' }}>{i.value}</code></td>
                      <td style={{ padding:'4px 6px' }}><code style={{ ...mono, wordBreak:'break-all' }}>{i.normalized || '—'}</code></td>
                      <td style={{ padding:'4px 6px' }}>{i.source}</td>
                      <td style={{ padding:'4px 6px' }}>{i.line}</td>
                      <td style={{ padding:'4px 6px', color:'#374151' }}>{(i.notes||[]).join(', ') || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize:12, color:'#6b7280', marginTop:6 }}>
              Tip: use the normalized column when importing into blocklists or SIEMs (it refangs <code style={mono}>hxxp</code> and <code style={mono}>[.]</code>).
            </div>
          </div>
        );
      })}

      <div style={{ fontSize:12, color:'#6b7280' }}>
        Note: This is a lightweight extractor. Always validate IOCs before blocking. For bulk enrichment, pipe the CSV into your intel platform.
      </div>
    </div>
  );
}
