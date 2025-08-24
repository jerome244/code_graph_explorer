'use client';

import React, { useMemo, useState } from 'react';

/* ---------- tiny UI ---------- */
type Level = 'low'|'medium'|'high';
const COLORS: Record<Level,string> = { low:'#2563eb', medium:'#f59e0b', high:'#ef4444' };
const mono: React.CSSProperties = { fontFamily:'ui-monospace, Menlo, monospace' };
const card: React.CSSProperties = { border:'1px solid #e5e7eb', borderRadius:12, padding:16, background:'#fff' };
const btn: React.CSSProperties  = { border:'1px solid #e5e7eb', background:'#fff', padding:'8px 12px', borderRadius:8, cursor:'pointer' };
const badge = (lvl: Level) => ({
  display:'inline-block', padding:'2px 8px', borderRadius:999, fontSize:12,
  background:COLORS[lvl]+'22', color:COLORS[lvl], border:'1px solid '+COLORS[lvl]+'55'
});

/* ---------- patterns ---------- */
type Sig = {
  id: string;
  label: string;
  re: RegExp;
  level: Level;
  hint: string;
  example?: string;
};

const SIGS: Sig[] = [
  { id:'aws-akid', label:'AWS Access Key ID', re:/\b(AKIA|ASIA)[0-9A-Z]{16}\b/g, level:'high', hint:'Rotate in IAM; switch to IAM roles where possible.' },
  { id:'aws-secret', label:'AWS Secret Access Key (heuristic)', re:/\b(?=[A-Za-z0-9\/+=]{40}\b)[A-Za-z0-9\/+=]{40}\b/g, level:'high', hint:'If near AWS vars, treat as exposed; rotate immediately.' },
  { id:'gh-pat', label:'GitHub token (gh[pousr]_... or github_pat_)', re:/\b(gh[pousr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{22,255})\b/g, level:'high', hint:'Revoke PAT; create least-privileged replacement.' },
  { id:'google-api', label:'Google API key', re:/\bAIza[0-9A-Za-z\-_]{35}\b/g, level:'high', hint:'Restrict by HTTP referrer / IP / usage.' },
  { id:'slack', label:'Slack token (xox*)', re:/\bxox[baprs]-\d+-\d+-[a-zA-Z0-9]{24,}\b/g, level:'high', hint:'Regenerate in Slack; tighten app scopes.' },
  { id:'stripe', label:'Stripe secret key', re:/\bsk_(live|test)_[0-9a-zA-Z]{24}\b/g, level:'high', hint:'Rotate in Stripe dashboard; use restricted keys.' },
  { id:'twilio', label:'Twilio SID/Key', re:/\b(AK|SK|AC)[0-9a-fA-F]{32}\b/g, level:'high', hint:'Rotate in Twilio console.' },
  { id:'private-key', label:'Private key block', re:/-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g, level:'high', hint:'Never commit private keys; replace & revoke.' },
  { id:'gcp-sa', label:'GCP service account JSON', re:/"type"\s*:\s*"service_account"|"private_key_id"\s*:\s*"[0-9a-f]+"\s*,/gi, level:'high', hint:'Recreate service account key; scope narrowly.' },
  { id:'mongodb', label:'MongoDB URI', re:/\bmongodb(\+srv)?:\/\/[^\s"']+/gi, level:'medium', hint:'Use secrets manager; restrict network.' },
  { id:'postgres', label:'Postgres URI', re:/\bpostgres(?:ql)?:\/\/[^\s"']+/gi, level:'medium', hint:'Use secrets manager; avoid embedding creds in URIs.' },
  { id:'basic-auth-url', label:'URL with embedded username:password', re:/:\/\/[^\/\s:@]+:[^\/\s:@]+@/g, level:'medium', hint:'Remove credentials from URLs; use env vars.' },
  { id:'jwt', label:'JWT token (looks like header.payload.sig)', re:/\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g, level:'low', hint:'Avoid logging raw JWTs; rotate if leaked.' },
  { id:'npmrc', label:'npm auth token', re:/^_authToken\s*=\s*.+$/gmi, level:'high', hint:'Revoke and use per-scope tokens.' },
  { id:'azure-conn', label:'Azure Storage connection string', re:/\bDefaultEndpointsProtocol=.+;AccountName=.+;AccountKey=.+/g, level:'high', hint:'Rotate account keys; prefer SAS tokens.' },
  { id:'env-secret', label:'.env secret', re:/^\s*[A-Z0-9_]*(SECRET|TOKEN|PASSWORD|KEY)\s*=\s*.+$/gmi, level:'medium', hint:'Store in a secret manager; don’t commit .env files.' },
];

const HIGH_ENTROPY_RE = /[A-Za-z0-9+/_-]{32,}/g;

/* ---------- utils ---------- */
function shannonEntropy(s: string) {
  const m = new Map<string, number>();
  for (const ch of s) m.set(ch, (m.get(ch) || 0) + 1);
  const n = s.length || 1;
  let H = 0;
  for (const [, c] of m) {
    const p = c / n;
    H -= p * Math.log2(p);
  }
  return H;
}

function contextIsSensitive(line: string) {
  return /(secret|token|password|passwd|apikey|key|authorization|bearer|aws|gcp|azure|twilio|stripe)/i.test(line);
}

type Hit = {
  file: string; line: number; column: number;
  level: Level; kind: string; value: string;
  hint: string;
};

function scanText(name: string, text: string): Hit[] {
  const hits: Hit[] = [];
  const lines = text.split(/\r?\n/);

  // exact signatures
  for (const sig of SIGS) {
    sig.re.lastIndex = 0;
    let m;
    while ((m = sig.re.exec(text))) {
      const idx = m.index;
      // compute line/col
      let lineNo = 1, col = 1, pos = 0;
      for (let i=0;i<lines.length;i++) {
        const l = lines[i];
        if (pos + l.length + 1 > idx) { lineNo = i+1; col = idx - pos + 1; break; }
        pos += l.length + 1;
      }
      hits.push({ file: name, line: lineNo, column: col, level: sig.level, kind: sig.label, value: m[0], hint: sig.hint });
    }
  }

  // high-entropy heuristics (flag only if looks like sensitive context OR very long)
  let m: RegExpExecArray | null;
  HIGH_ENTROPY_RE.lastIndex = 0;
  while ((m = HIGH_ENTROPY_RE.exec(text))) {
    const token = m[0];
    if (token.length < 40 && !contextIsSensitive(text.slice(Math.max(0, m.index-80), m.index+80))) continue;
    const H = shannonEntropy(token);
    if (H >= 3.3) {
      // compute line/col
      const idx = m.index;
      let lineNo = 1, col = 1, pos = 0;
      for (let i=0;i<lines.length;i++) {
        const l = lines[i];
        if (pos + l.length + 1 > idx) { lineNo = i+1; col = idx - pos + 1; break; }
        pos += l.length + 1;
      }
      hits.push({
        file: name, line: lineNo, column: col,
        level: token.length >= 50 ? 'high' : 'medium',
        kind: 'High-entropy secret (heuristic)',
        value: token,
        hint: 'Likely secret/token. Store in a secrets manager and rotate.'
      });
    }
  }

  return hits;
}

/* ---------- page ---------- */
export default function SecretsScanner() {
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<Hit[]>([]);
  const [mask, setMask] = useState(true);
  const [busy, setBusy] = useState(false);

  const grouped = useMemo(() => {
    const map = new Map<string, Hit[]>();
    for (const h of results) {
      (map.get(h.file) || map.set(h.file, []).get(h.file)!).push(h);
    }
    return Array.from(map.entries()).sort((a,b)=>a[0].localeCompare(b[0]));
  }, [results]);

  async function scanPasted() {
    setBusy(true);
    const out = scanText('(pasted)', text);
    setResults(out);
    setBusy(false);
  }

  async function onPick(fl: FileList | null) {
    if (!fl) return;
    setBusy(true);
    const arr = Array.from(fl).slice(0, 32);
    setFiles(arr);
    const outs: Hit[] = [];
    for (const f of arr) {
      const ab = await f.arrayBuffer();
      let t = '';
      try { t = new TextDecoder().decode(new Uint8Array(ab)); }
      catch { t = ''; }
      outs.push(...scanText(f.name, t));
    }
    setResults(outs);
    setBusy(false);
  }

  function display(val: string) {
    if (!mask) return val;
    if (val.length <= 8) return '••••••';
    return val.slice(0, 3) + '••••••' + val.slice(-3);
  }

  return (
    <div style={{ display:'grid', gap:16 }}>
      <h1 style={{ margin:0 }}>Secrets & Keys Scanner</h1>
      <p style={{ margin:0, color:'#555' }}>
        Scan pasted text or files for leaked API keys, tokens, DB URIs, private keys, and high-entropy secrets. All local — nothing is uploaded.
      </p>

      {/* Paste area */}
      <div style={card}>
        <div style={{ fontWeight:700, marginBottom:8 }}>Paste text or .env content</div>
        <textarea value={text} onChange={e=>setText(e.target.value)} placeholder={`# example
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
DATABASE_URL=postgresql://user:pass@host:5432/db`} style={{ width:'100%', height:160, border:'1px solid #e5e7eb', borderRadius:8, padding:12, font:'inherit' }} />
        <div style={{ display:'flex', gap:8, marginTop:8 }}>
          <button onClick={scanPasted} style={btn}>Scan text</button>
          <button onClick={()=>{ setText(''); setResults([]); }} style={btn}>Clear</button>
          <label style={{ display:'flex', alignItems:'center', gap:8 }}>
            <input type="checkbox" checked={mask} onChange={e=>setMask(e.target.checked)} />
            Mask secrets in UI
          </label>
        </div>
      </div>

      {/* File picker */}
      <div style={card}>
        <div style={{ fontWeight:700, marginBottom:8 }}>Or drop files / pick a folder</div>
        <input type="file" multiple onChange={e=>onPick(e.target.files)} />
        <div style={{ fontSize:12, color:'#6b7280', marginTop:6 }}>Tip: select your repo folder (browser will prompt to choose many files).</div>
      </div>

      {busy && <div>Scanning…</div>}

      {/* Results */}
      {results.length > 0 ? (
        <div style={{ display:'grid', gap:12 }}>
          {grouped.map(([file, hits]) => (
            <div key={file} style={card}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline' }}>
                <div style={{ fontWeight:700 }}>{file}</div>
                <span style={badge(hits.some(h=>h.level==='high') ? 'high' : hits.some(h=>h.level==='medium') ? 'medium' : 'low')}>
                  {hits.length} finding{hits.length>1?'s':''}
                </span>
              </div>
              <div style={{ overflowX:'auto', marginTop:8 }}>
                <table style={{ width:'100%', borderCollapse:'separate', borderSpacing:0 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign:'left' }}>Line</th>
                      <th style={{ textAlign:'left' }}>Type</th>
                      <th style={{ textAlign:'left' }}>Secret (masked)</th>
                      <th style={{ textAlign:'left' }}>Advice</th>
                      <th style={{ textAlign:'left' }}>Severity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hits.map((h, i) => (
                      <tr key={i}>
                        <td style={{ padding:'4px 6px' }}>{h.line}:{h.column}</td>
                        <td style={{ padding:'4px 6px', color:'#111827' }}>{h.kind}</td>
                        <td style={{ padding:'4px 6px' }}>
                          <code style={{ ...mono, wordBreak:'break-all' }}>{display(h.value)}</code>
                        </td>
                        <td style={{ padding:'4px 6px', color:'#374151' }}>{h.hint}</td>
                        <td style={{ padding:'4px 6px' }}>
                          <span style={badge(h.level)}>{h.level.toUpperCase()}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ fontSize:12, color:'#6b7280', marginTop:6 }}>
                Next steps: rotate & revoke exposed credentials, remove from history (e.g., <code style={mono}>git filter-repo</code>), and move secrets to a manager (AWS Secrets Manager, Vault, 1Password, etc.).
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ color:'#6b7280' }}>No findings yet. Paste or drop files to scan.</div>
      )}
    </div>
  );
}
