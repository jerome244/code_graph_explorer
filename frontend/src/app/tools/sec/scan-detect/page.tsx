'use client';

import React, { useMemo, useState } from 'react';

/* ---------- UI bits ---------- */
type Level = 'low'|'medium'|'high';
const COLORS: Record<Level,string> = { low:'#2563eb', medium:'#f59e0b', high:'#ef4444' };
const mono: React.CSSProperties = { fontFamily:'ui-monospace, Menlo, monospace' };
const card: React.CSSProperties = { border:'1px solid #e5e7eb', borderRadius:12, padding:16, background:'#fff' };
const btn: React.CSSProperties  = { border:'1px solid #e5e7eb', background:'#fff', padding:'8px 12px', borderRadius:8, cursor:'pointer' };
const inputCss: React.CSSProperties = { border:'1px solid #e5e7eb', borderRadius:8, padding:'10px 12px', width:'100%', font:'inherit' };
const taCss: React.CSSProperties = { ...inputCss, height:180, resize:'vertical' as const };
const badge = (lvl: Level) => ({
  display:'inline-block', padding:'2px 8px', borderRadius:999, fontSize:12,
  background: COLORS[lvl]+'22', color: COLORS[lvl], border:'1px solid '+COLORS[lvl]+'55'
});

/* ---------- types ---------- */
type Row = {
  ts?: number;               // epoch ms if parsed
  rawTime?: string;
  src?: string;
  dst?: string;
  dport?: number;
  sport?: number;
  proto?: string;
  action?: string;           // allow/deny/drop/etc
};

type Finding = {
  level: Level;
  type: 'vertical-scan'|'horizontal-scan'|'bruteforce'|'suspicious-port'|'top-blocked';
  who: string;
  info: string;
  count: number;
  sample?: string;
};

/* ---------- CSV parsing (simple) ---------- */
function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.replace(/\r/g,'').split('\n').filter(l=>l.trim().length);
  if (lines.length === 0) return { headers: [], rows: [] };
  const parseLine = (line: string) => {
    const out: string[] = [];
    let cur = '';
    let inQ = false;
    for (let i=0;i<line.length;i++){
      const c = line[i];
      if (c === '"') {
        if (inQ && line[i+1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (c === ',' && !inQ) {
        out.push(cur); cur = '';
      } else cur += c;
    }
    out.push(cur);
    return out;
  };
  const head = parseLine(lines[0]).map(h=>h.trim());
  const rows = lines.slice(1).map(parseLine);
  return { headers: head, rows };
}

function firstMatch(headers: string[], names: string[]) {
  const lower = headers.map(h=>h.toLowerCase());
  for (const n of names) {
    const idx = lower.indexOf(n);
    if (idx !== -1) return idx;
  }
  return -1;
}

function toEpochMs(s?: string) {
  if (!s) return undefined;
  // try epoch seconds/ms
  if (/^\d{10,13}$/.test(s.trim())) {
    const n = Number(s.trim());
    return n < 1e12 ? n*1000 : n;
  }
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : undefined;
}

function ipLike(s?: string) {
  return !!s && /^([0-9]{1,3}\.){3}[0-9]{1,3}$/.test(s);
}

/* ---------- analyzer ---------- */
const BRUTE_PORTS = new Set([22, 3389, 5900, 445, 389, 636, 21, 23, 25, 110, 143]); // SSH, RDP, VNC, SMB, LDAP*, FTP, Telnet, SMTP/POP3/IMAP
const SUSP_PORTS = new Set([31337, 4444, 5555, 6969, 1337, 1338, 2222, 9001, 4443, 8081, 27017]); // common odd/backdoor/dev ports
const FAIL_WORDS = /(deny|drop|blocked|fail|invalid|reset|refused|unauth|forbid)/i;

type Settings = {
  vertThreshold: number;   // unique dports from one src->dst
  horizThreshold: number;  // unique dst hosts on same dport from one src
  bruteThreshold: number;  // failed hits to a sensitive port
};

function analyze(rows: Row[], cfg: Settings): Finding[] {
  // Maps
  const vertical = new Map<string, Set<number>>();      // key: src|dst -> set dports
  const horizontal = new Map<string, Set<string>>();    // key: src|port -> set dsts
  const brute = new Map<string, number>();              // key: src|dst|port -> fails
  const topBlocked = new Map<string, number>();         // key: src -> blocked count
  const susp = new Map<string, number>();               // key: src -> susp ports hits

  for (const r of rows) {
    if (!r.src || !r.dst || !r.dport) continue;
    const keyV = `${r.src}|${r.dst}`;
    const keyH = `${r.src}|${r.dport}`;
    (vertical.get(keyV) || vertical.set(keyV,new Set()).get(keyV)!).add(r.dport);
    (horizontal.get(keyH) || horizontal.set(keyH,new Set()).get(keyH)!).add(r.dst);

    const isFail = r.action ? FAIL_WORDS.test(r.action) : true; // if unknown, consider as fail for triage
    if (isFail && BRUTE_PORTS.has(r.dport)) {
      const k = `${r.src}|${r.dst}|${r.dport}`;
      brute.set(k, (brute.get(k)||0) + 1);
    }
    if (isFail) topBlocked.set(r.src!, (topBlocked.get(r.src!)||0) + 1);
    if (SUSP_PORTS.has(r.dport)) susp.set(r.src!, (susp.get(r.src!)||0) + 1);
  }

  const findings: Finding[] = [];

  // Vertical scans
  for (const [k, ports] of vertical) {
    if (ports.size >= cfg.vertThreshold) {
      const [src, dst] = k.split('|');
      findings.push({
        level:'high', type:'vertical-scan', who: src,
        info:`→ ${dst} probed ${ports.size} distinct destination ports`,
        count: ports.size
      });
    }
  }

  // Horizontal scans
  for (const [k, dsts] of horizontal) {
    if (dsts.size >= cfg.horizThreshold) {
      const [src, portStr] = k.split('|');
      findings.push({
        level:'high', type:'horizontal-scan', who: src,
        info:`→ ${dsts.size} hosts on port ${portStr}`,
        count: dsts.size
      });
    }
  }

  // Brute-force
  for (const [k, n] of brute) {
    if (n >= cfg.bruteThreshold) {
      const [src, dst, port] = k.split('|');
      findings.push({
        level:'medium', type:'bruteforce', who: src,
        info:`→ ${dst} on port ${port}: ${n} failed hits`,
        count: n
      });
    }
  }

  // Suspicious ports
  for (const [src, n] of susp) {
    if (n >= 5) {
      findings.push({
        level:'medium', type:'suspicious-port', who: src,
        info:`hits to uncommon/backdoor ports: ${n}`,
        count: n
      });
    }
  }

  // Top blocked (context)
  const top = [...topBlocked.entries()].sort((a,b)=>b[1]-a[1]).slice(0,10);
  for (const [src, n] of top) {
    findings.push({ level: n>500?'high': n>100?'medium':'low', type:'top-blocked', who: src, info:`blocked events: ${n}`, count: n });
  }

  // Sort by severity & count
  findings.sort((a,b)=>{
    const order: Record<Level,number> = { high:0, medium:1, low:2 };
    if (order[a.level] !== order[b.level]) return order[a.level]-order[b.level];
    return b.count - a.count;
  });
  return findings;
}

/* ---------- mapping & ingestion ---------- */
function ingestCSV(text: string): Row[] {
  const { headers, rows } = parseCSV(text);
  if (!headers.length) return [];
  const H = headers.map(h=>h.toLowerCase());

  const idxTime = firstMatch(H, ['timestamp','time','ts','date','datetime','logtime']);
  const idxSrc  = firstMatch(H, ['src','src_ip','srcip','saddr','source','client','client_ip']);
  const idxDst  = firstMatch(H, ['dst','dst_ip','dstip','daddr','destination','server','server_ip']);
  const idxDpt  = firstMatch(H, ['dport','dst_port','dest_port','destination_port','port']);
  const idxSpt  = firstMatch(H, ['sport','src_port','source_port']);
  const idxProto= firstMatch(H, ['proto','protocol']);
  const idxAct  = firstMatch(H, ['action','verdict','decision','result','event','disposition','status']);

  const out: Row[] = [];
  for (const r of rows) {
    const src = r[idxSrc]?.trim();
    const dst = r[idxDst]?.trim();
    const dport = Number(r[idxDpt]);
    const sport = idxSpt>=0 ? Number(r[idxSpt]) : undefined;
    const proto = idxProto>=0 ? r[idxProto]?.trim().toUpperCase() : undefined;
    const action = idxAct>=0 ? r[idxAct]?.trim().toLowerCase() : undefined;
    const rawTime = idxTime>=0 ? r[idxTime] : undefined;
    const ts = toEpochMs(rawTime);
    if (!src && !dst && !dport) continue;
    out.push({ src, dst, dport: Number.isFinite(dport)? dport : undefined, sport, proto, action, ts, rawTime });
  }
  return out.filter(r => ipLike(r.src) && ipLike(r.dst) && Number.isFinite(r.dport));
}

/* ---------- page ---------- */
export default function ScanDetectPage() {
  const [text, setText] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);

  const [vert, setVert] = useState(15);
  const [horiz, setHoriz] = useState(10);
  const [brute, setBrute] = useState(20);

  const findings = useMemo(() => analyze(rows, { vertThreshold: vert, horizThreshold: horiz, bruteThreshold: brute }), [rows, vert, horiz, brute]);

  async function parsePasted() {
    setBusy(true);
    const out = ingestCSV(text);
    setRows(out);
    setBusy(false);
  }

  async function onPick(fl: FileList | null) {
    if (!fl) return;
    setBusy(true);
    const arr = Array.from(fl).slice(0, 12);
    const all: Row[] = [];
    for (const f of arr) {
      const t = await f.text();
      all.push(...ingestCSV(t));
    }
    setRows(all);
    setBusy(false);
  }

  const sampleCSV = `timestamp,src,dst,dport,proto,action
2025-08-01T09:12:00Z,185.203.116.5,192.168.1.10,22,TCP,deny
2025-08-01T09:12:02Z,185.203.116.5,192.168.1.10,2222,TCP,deny
2025-08-01T09:12:04Z,185.203.116.5,192.168.1.10,2200,TCP,deny
2025-08-01T09:12:05Z,185.203.116.5,192.168.1.10,3389,TCP,deny
2025-08-01T09:12:06Z,185.203.116.5,192.168.1.10,445,TCP,deny
2025-08-01T10:00:00Z,45.83.1.9,192.168.1.11,22,TCP,deny
2025-08-01T10:00:03Z,45.83.1.9,192.168.1.12,22,TCP,deny
2025-08-01T10:00:05Z,45.83.1.9,192.168.1.13,22,TCP,deny
2025-08-01T10:00:06Z,45.83.1.9,192.168.1.14,22,TCP,deny`;

  return (
    <div style={{ display:'grid', gap:16 }}>
      <h1 style={{ margin:0 }}>Port-Scan & Brute-Force Detector</h1>
      <p style={{ margin:0, color:'#555' }}>
        Paste firewall/IDS CSV logs (headers like <code style={mono}>timestamp, src, dst, dport, proto, action</code>), or drop CSV files.
        We’ll flag <b>vertical scans</b> (many ports to one host), <b>horizontal scans</b> (one port to many hosts), and <b>brute-force</b> bursts.
      </p>

      {/* Input */}
      <div style={card}>
        <div style={{ fontWeight:700, marginBottom:8 }}>Paste CSV</div>
        <textarea value={text} onChange={e=>setText(e.target.value)} placeholder={sampleCSV} style={taCss} />
        <div style={{ display:'flex', gap:8, marginTop:8 }}>
          <button onClick={parsePasted} style={btn}>Analyze text</button>
          <button onClick={()=>{ setText(''); setRows([]); }} style={btn}>Clear</button>
        </div>
        <div style={{ fontSize:12, color:'#6b7280', marginTop:6 }}>
          Supported headers (any synonym): <code style={mono}>timestamp/time/ts</code>, <code style={mono}>src/srcip/saddr</code>, <code style={mono}>dst/dstip/daddr</code>, <code style={mono}>dport/port</code>, <code style={mono}>proto</code>, <code style={mono}>action</code>.
        </div>
      </div>

      <div style={card}>
        <div style={{ fontWeight:700, marginBottom:8 }}>Or drop files</div>
        <input type="file" multiple onChange={e=>onPick(e.target.files)} />
        <div style={{ fontSize:12, color:'#6b7280', marginTop:6 }}>We read locally in your browser; nothing is uploaded.</div>
      </div>

      {/* Settings */}
      <div style={card}>
        <div style={{ fontWeight:700, marginBottom:8 }}>Detection thresholds</div>
        <div style={{ display:'grid', gap:8, gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <label>Vertical scan (unique ports to one host) ≥ <input type="number" value={vert} onChange={e=>setVert(Number(e.target.value)||0)} style={{...inputCss, width:100}} /></label>
          <label>Horizontal scan (hosts at same port) ≥ <input type="number" value={horiz} onChange={e=>setHoriz(Number(e.target.value)||0)} style={{...inputCss, width:100}} /></label>
          <label>Brute-force (failed hits on sensitive ports) ≥ <input type="number" value={brute} onChange={e=>setBrute(Number(e.target.value)||0)} style={{...inputCss, width:100}} /></label>
        </div>
        <div style={{ fontSize:12, color:'#6b7280', marginTop:6 }}>
          Sensitive ports: 22, 3389, 5900, 445, 389, 636, 21, 23, 25, 110, 143. Suspicious ports include 31337, 4444, 5555, etc.
        </div>
      </div>

      {/* Results */}
      {busy && <div>Analyzing…</div>}

      <div style={card}>
        <div style={{ fontWeight:700, marginBottom:8 }}>Findings</div>
        {rows.length === 0 ? (
          <div style={{ color:'#6b7280' }}>No data yet. Paste a CSV or drop files.</div>
        ) : findings.length === 0 ? (
          <div style={{ color:'#16a34a' }}>No suspicious patterns found 🎉</div>
        ) : (
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'separate', borderSpacing:0 }}>
              <thead>
                <tr>
                  <th style={{ textAlign:'left' }}>Severity</th>
                  <th style={{ textAlign:'left' }}>Type</th>
                  <th style={{ textAlign:'left' }}>Source</th>
                  <th style={{ textAlign:'left' }}>Details</th>
                  <th style={{ textAlign:'left' }}>Count</th>
                </tr>
              </thead>
              <tbody>
                {findings.map((f, i) => (
                  <tr key={i}>
                    <td style={{ padding:'4px 6px' }}><span style={badge(f.level)}>{f.level.toUpperCase()}</span></td>
                    <td style={{ padding:'4px 6px' }}>{f.type}</td>
                    <td style={{ padding:'4px 6px' }}>{f.who}</td>
                    <td style={{ padding:'4px 6px' }}>{f.info}</td>
                    <td style={{ padding:'4px 6px' }}>{f.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Tips */}
      <div style={{ fontSize:12, color:'#6b7280' }}>
        Tips: if a source IP appears in multiple vertical/horizontal scans, consider temporary blocks, Geo/IP reputation checks, and tightening perimeter rules.
        For repeated brute-force on SSH/RDP, enable MFA, move to VPN-gated access, and restrict by IP allowlists.
      </div>
    </div>
  );
}
