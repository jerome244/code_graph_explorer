'use client';

import React, { useMemo, useState } from 'react';

/* ---------- tiny UI ---------- */
type Level = 'low'|'medium'|'high';
const COLORS: Record<Level,string> = { low:'#2563eb', medium:'#f59e0b', high:'#ef4444' };
const mono: React.CSSProperties = { fontFamily:'ui-monospace, Menlo, monospace' };
const card: React.CSSProperties = { border:'1px solid #e5e7eb', borderRadius:12, padding:16, background:'#fff' };
const btn: React.CSSProperties  = { borderWidth:1, borderStyle:'solid', borderColor:'#e5e7eb', backgroundColor:'#fff', padding:'8px 12px', borderRadius:8, cursor:'pointer' };
const inputCss: React.CSSProperties = { border:'1px solid #e5e7eb', borderRadius:8, padding:'10px 12px', width:'100%', font:'inherit' };
const taCss: React.CSSProperties = { ...inputCss, height:160, resize:'vertical' as const };
const badge = (lvl: Level) => ({
  display:'inline-block', padding:'2px 8px', borderRadius:999, fontSize:12,
  background: COLORS[lvl]+'22', color: COLORS[lvl], border:'1px solid '+COLORS[lvl]+'55'
});

/* ---------- types ---------- */
type Finding = {
  level: Level;
  area: 'Headers'|'Client (HTML/JS)'|'Server (Node/PHP)';
  line?: number;
  rule: string;
  message: string;
  fix: string;
};

function idxToLine(text: string, idx: number) {
  let line = 1;
  for (let i=0;i<idx;i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

/* ---------- HEADERS ANALYZER ---------- */
function parseHeaders(raw: string) {
  const map = new Map<string,string[]>();
  for (const line of raw.replace(/\r/g,'').split('\n')) {
    const m = line.match(/^\s*([^:\s]+)\s*:\s*(.+)\s*$/);
    if (!m) continue;
    const k = m[1].toLowerCase();
    const v = m[2];
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(v);
  }
  return map;
}

function gradeHeaders(raw: string): Finding[] {
  const H = parseHeaders(raw);
  const out: Finding[] = [];
  const get = (k: string) => H.get(k.toLowerCase())?.[0] ?? '';
  const has = (k: string) => H.has(k.toLowerCase());

  // Strict-Transport-Security
  if (has('strict-transport-security')) {
    const v = get('strict-transport-security');
    const max = /max-age=(\d+)/i.exec(v)?.[1];
    const incSubs = /includesubdomains/i.test(v);
    if (!max || Number(max) < 15552000) {
      out.push({ level:'medium', area:'Headers', rule:'HSTS max-age', message:`Strict-Transport-Security max-age is low or missing (value: "${v}")`, fix:'Use HSTS with max-age ≥ 15552000 and includeSubDomains; preload if appropriate.' });
    }
    if (!incSubs) {
      out.push({ level:'low', area:'Headers', rule:'HSTS includeSubDomains', message:'HSTS missing includeSubDomains', fix:'Append ; includeSubDomains to HSTS unless you have subdomains that must remain over HTTP.' });
    }
  } else {
    out.push({ level:'high', area:'Headers', rule:'HSTS missing', message:'Strict-Transport-Security header not set', fix:'Serve over HTTPS and set HSTS: max-age=31536000; includeSubDomains; preload (optional).' });
  }

  // CSP
  if (has('content-security-policy')) {
    const v = get('content-security-policy');
    if (/unsafe-inline/.test(v) || /unsafe-eval/.test(v)) {
      out.push({ level:'medium', area:'Headers', rule:'CSP unsafe', message:'CSP allows unsafe-inline or unsafe-eval', fix:'Replace with nonces/hashes; avoid eval-like constructs.' });
    }
    if (!/object-src\s+['"]?none['"]?/.test(v)) {
      out.push({ level:'low', area:'Headers', rule:'CSP object-src', message:'CSP should include object-src \'none\'', fix:'Add object-src \'none\' to reduce plugin attack surface.' });
    }
    if (!/(default-src|script-src|style-src)/.test(v)) {
      out.push({ level:'low', area:'Headers', rule:'CSP minimal', message:'CSP lacks common directives', fix:'Provide default-src and narrow script-src/style-src.' });
    }
  } else {
    out.push({ level:'medium', area:'Headers', rule:'CSP missing', message:'Content-Security-Policy header not set', fix:'Set a CSP with nonces/hashes for scripts and styles; object-src \'none\'.' });
  }

  // X-Frame-Options
  if (!has('x-frame-options')) {
    out.push({ level:'low', area:'Headers', rule:'X-Frame-Options', message:'Missing X-Frame-Options (clickjacking risk)', fix:'Add X-Frame-Options: DENY (or SAMEORIGIN).' });
  }

  // X-Content-Type-Options
  if (!/nosniff/i.test(get('x-content-type-options'))) {
    out.push({ level:'low', area:'Headers', rule:'X-Content-Type-Options', message:'Missing or incorrect X-Content-Type-Options', fix:'Set X-Content-Type-Options: nosniff.' });
  }

  // Referrer-Policy
  if (!has('referrer-policy')) {
    out.push({ level:'low', area:'Headers', rule:'Referrer-Policy', message:'Missing Referrer-Policy', fix:'Use Referrer-Policy: no-referrer or strict-origin-when-cross-origin.' });
  }

  // Permissions-Policy
  if (!has('permissions-policy') && !has('feature-policy')) {
    out.push({ level:'low', area:'Headers', rule:'Permissions-Policy', message:'Missing Permissions-Policy', fix:'Deny unneeded features: camera=(), microphone=(), geolocation=(), etc.' });
  }

  // COOP/COEP/CORP (isolation)
  if (!has('cross-origin-opener-policy')) {
    out.push({ level:'low', area:'Headers', rule:'COOP', message:'Missing Cross-Origin-Opener-Policy', fix:'Set COOP: same-origin for better isolation.' });
  }
  if (!has('cross-origin-embedder-policy')) {
    out.push({ level:'low', area:'Headers', rule:'COEP', message:'Missing Cross-Origin-Embedder-Policy', fix:'Set COEP: require-corp if you need isolated realms.' });
  }
  if (!has('cross-origin-resource-policy')) {
    out.push({ level:'low', area:'Headers', rule:'CORP', message:'Missing Cross-Origin-Resource-Policy', fix:'Set CORP: same-origin or same-site to limit cross-origin leaks.' });
  }

  // Cookies
  const cookies = H.get('set-cookie') || [];
  for (const sc of cookies) {
    const hasSecure = /;\s*Secure/i.test(sc);
    const hasHttpOnly = /;\s*HttpOnly/i.test(sc);
    const sameSite = /;\s*SameSite=(\w+)/i.exec(sc)?.[1]?.toLowerCase();
    if (!hasSecure) out.push({ level:'medium', area:'Headers', rule:'Cookie Secure', message:`Set-Cookie without Secure: ${sc.split(';')[0]}`, fix:'Add ; Secure to all session cookies.' });
    if (!hasHttpOnly) out.push({ level:'medium', area:'Headers', rule:'Cookie HttpOnly', message:`Set-Cookie without HttpOnly: ${sc.split(';')[0]}`, fix:'Add ; HttpOnly to session cookies.' });
    if (sameSite === 'none' && !hasSecure) {
      out.push({ level:'high', area:'Headers', rule:'Cookie SameSite=None', message:'SameSite=None cookie must be Secure', fix:'Add ; Secure or change SameSite to Lax/Strict.' });
    }
  }

  // Info leakage
  if (has('server') || has('x-powered-by') || has('x-aspnet-version')) {
    out.push({ level:'low', area:'Headers', rule:'Version disclosure', message:'Server/X-Powered-By headers present (may leak stack/version)', fix:'Remove or neutralize version-disclosing headers.' });
  }

  return out;
}

/* ---------- CLIENT (HTML/JS) ANALYZER ---------- */
function analyzeClient(html: string): Finding[] {
  const out: Finding[] = [];

  // Inline handlers (onclick= etc.)
  for (const m of html.matchAll(/on[a-z]+\s*=/gi)) {
    out.push({ level:'medium', area:'Client (HTML/JS)', line: idxToLine(html, m.index||0), rule:'Inline event handler', message:`Found "${html.slice(m.index!, m.index!+20)}..."`, fix:'Move to addEventListener and avoid inline JS (CSP-friendly).' });
  }

  // Dangerous sinks
  const sinks = [
    { re:/\binnerHTML\b/g, rule:'innerHTML', fix:'Use textContent or safe templating.' },
    { re:/\bouterHTML\b/g, rule:'outerHTML', fix:'Avoid replacing whole DOM with untrusted content.' },
    { re:/\binsertAdjacentHTML\b/g, rule:'insertAdjacentHTML', fix:'Sanitize or use DOMPurify.' },
    { re:/\bdocument\.write\b/g, rule:'document.write', fix:'Avoid; manipulate DOM safely instead.' },
    { re:/\beval\s*\(/g, rule:'eval()', fix:'Do not eval strings; refactor logic.' },
    { re:/\bnew\s+Function\s*\(/g, rule:'new Function()', fix:'Avoid dynamic code construction.' },
    { re:/\bset(Time|Inter)val\s*\(\s*['"`]/g, rule:'setTimeout/setInterval string', fix:'Pass a function, not a string.' },
    { re:/\bhref\s*=\s*["']\s*javascript:/gi, rule:'javascript: URL', fix:'Avoid javascript: URLs.' },
  ];
  for (const s of sinks) {
    for (const m of html.matchAll(s.re)) {
      out.push({ level:'high', area:'Client (HTML/JS)', line: idxToLine(html, m.index||0), rule:s.rule, message:`Dangerous sink detected`, fix:s.fix });
    }
  }

  // target=_blank without rel=noopener
  for (const m of html.matchAll(/<a\b[^>]*target=["']_blank["'][^>]*>/gi)) {
    const tag = m[0];
    if (!/rel=["'][^"']*noopener/i.test(tag)) {
      out.push({ level:'low', area:'Client (HTML/JS)', line: idxToLine(html, m.index||0), rule:'_blank w/o noopener', message:'Anchor opens new tab without rel=noopener', fix:'Add rel="noopener noreferrer".' });
    }
  }

  // Forms without obvious CSRF token (heuristic)
  for (const m of html.matchAll(/<form\b[^>]*method=["']?post["']?[^>]*>([\s\S]*?)<\/form>/gi)) {
    const body = m[1] || '';
    if (!/name=["']?(csrf|__requestverificationtoken|_csrf)/i.test(body)) {
      out.push({ level:'medium', area:'Client (HTML/JS)', line: idxToLine(html, m.index||0), rule:'CSRF token (heuristic)', message:'POST form without visible CSRF token input', fix:'Include a server-generated CSRF token input and validate it.' });
    }
  }

  return out;
}

/* ---------- SERVER (NODE/PHP) ANALYZER ---------- */
function analyzeServer(code: string): Finding[] {
  const out: Finding[] = [];

  // Node/Express patterns
  const patternsNode = [
    // SQL concat / template using req.*
    { re: /(query|execute)\s*\([\s\S]{0,200}[`'"]([\s\S]*?(SELECT|INSERT|UPDATE|DELETE)[\s\S]*?)[`'"][\s\S]{0,50}(\+|\${)[\s\S]{0,80}req\.(query|body|params)/gi,
      level:'high', rule:'SQL injection (concat)', fix:'Use parameterized queries (placeholders); never concat req.* into SQL.' as const },
    // Mongo / NoSQL injection
    { re: /\.(find|findOne|aggregate)\s*\(\s*req\.(query|body|params)/gi,
      level:'high', rule:'NoSQL injection (unvalidated query object)', fix:'Whitelist fields; build query objects explicitly, not from req.*.' as const },
    // Path traversal
    { re: /(fs\.(readFile|createReadStream|writeFile)|res\.sendFile)\s*\([\s\S]{0,40}req\.(params|query|body)/gi,
      level:'high', rule:'Path traversal', fix:'Resolve against a fixed base and validate filenames; never pass user input directly to fs/sendFile.' as const },
    // Command injection
    { re: /(exec|execSync|spawn|spawnSync)\s*\([\s\S]{0,80}req\.(params|query|body)/gi,
      level:'high', rule:'Command injection', fix:'Avoid shelling out with user input; use safe APIs or strict allowlists.' as const },
    // SSRF
    { re: /\b(fetch|axios\.\w+|request)\s*\(\s*req\.(query|body|params)[\s\S]*https?:\/\//gi,
      level:'medium', rule:'SSRF (user-controlled URL)', fix:'Validate/allowlist outbound destinations; block private IP ranges.' as const },
    // Weak JWT verify
    { re: /jwt\.verify\([\s\S]*ignoreExpiration\s*:\s*true/gi,
      level:'medium', rule:'JWT ignoreExpiration', fix:'Do not ignore expiration; rotate tokens if needed.' as const },
  ] as const;

  for (const p of patternsNode) {
    for (const m of code.matchAll(p.re)) {
      out.push({ level: p.level, area:'Server (Node/PHP)', line: idxToLine(code, m.index||0), rule: p.rule, message:'Suspicious pattern found', fix: p.fix });
    }
  }

  // PHP patterns
  const patternsPhp = [
    // SQL injection in mysqli_query / PDO->query
    { re: /(mysqli_query|->query)\s*\([\s\S]*\$_(GET|POST|REQUEST)/gi,
      level:'high', rule:'SQL injection (concat)', fix:'Use prepared statements with bound parameters; never pass $_GET/$_POST directly.' as const },
    // Command execution
    { re: /\b(exec|shell_exec|system|passthru|popen)\s*\([\s\S]*\$_(GET|POST|REQUEST)/gi,
      level:'high', rule:'Command injection', fix:'Do not pass user input to command execution; use safe libraries / allowlists.' as const },
    // File inclusion / traversal
    { re: /\b(include|require|include_once|require_once)\s*\(\s*\$_(GET|POST|REQUEST)/gi,
      level:'high', rule:'Remote/Local File Inclusion', fix:'Include fixed paths; never include using user input.' as const },
    { re: /file_(get|put)_contents\s*\([\s\S]*\$_(GET|POST|REQUEST)/gi,
      level:'high', rule:'SSRF/Path traversal', fix:'Validate URLs; disallow file:// and internal ranges; use allowlists.' as const },
  ] as const;

  for (const p of patternsPhp) {
    for (const m of code.matchAll(p.re)) {
      out.push({ level: p.level, area:'Server (Node/PHP)', line: idxToLine(code, m.index||0), rule: p.rule, message:'Suspicious pattern found', fix: p.fix });
    }
  }

  return out;
}

/* ---------- page ---------- */
export default function WebAuditPage() {
  const [headers, setHeaders] = useState('');
  const [clientSrc, setClientSrc] = useState('');
  const [serverSrc, setServerSrc] = useState('');

  const [findings, setFindings] = useState<Finding[]>([]);
  const [busy, setBusy] = useState(false);

  function run(area?: 'Headers'|'Client'|'Server') {
    setBusy(true);
    const outs: Finding[] = [];

    if (!area || area === 'Headers') outs.push(...gradeHeaders(headers));
    if (!area || area === 'Client') outs.push(...analyzeClient(clientSrc));
    if (!area || area === 'Server') outs.push(...analyzeServer(serverSrc));

    // Sort by severity then area then line
    outs.sort((a,b)=>{
      const sev = (x: Level) => ({high:0, medium:1, low:2}[x]);
      if (sev(a.level) !== sev(b.level)) return sev(a.level) - sev(b.level);
      if (a.area !== b.area) return a.area.localeCompare(b.area);
      return (a.line||0) - (b.line||0);
    });

    setFindings(outs);
    setBusy(false);
  }

  function copyChecklist() {
    const lines = findings.map(f => `- [${f.level.toUpperCase()}] ${f.area}: ${f.rule} — ${f.fix}`);
    navigator.clipboard.writeText(lines.join('\n')).catch(()=>{});
  }

  const counts = useMemo(()=>({
    high: findings.filter(f=>f.level==='high').length,
    med: findings.filter(f=>f.level==='medium').length,
    low: findings.filter(f=>f.level==='low').length,
  }), [findings]);

  return (
    <div style={{ display:'grid', gap:16 }}>
      <h1 style={{ margin:0 }}>Web App Security Auditor</h1>
      <p style={{ margin:0, color:'#555' }}>
        Paste <b>HTTP response headers</b>, <b>HTML/JS</b>, and/or <b>server code (Node/Express or PHP)</b>.  
        The analyzer flags common risks and suggests safe fixes. Everything runs in your browser.
      </p>

      {/* HEADERS */}
      <div style={card}>
        <div style={{ fontWeight:700, marginBottom:8 }}>HTTP Response Headers</div>
        <textarea value={headers} onChange={e=>setHeaders(e.target.value)} placeholder={`Example:
Content-Security-Policy: default-src 'self'; object-src 'none'
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Set-Cookie: session=abc; Path=/; Secure; HttpOnly; SameSite=Lax
`} style={taCss} />
        <div style={{ display:'flex', gap:8, marginTop:8, flexWrap:'wrap' }}>
          <button onClick={()=>run('Headers')} style={btn}>Analyze headers</button>
          <button onClick={()=>setHeaders('')} style={btn}>Clear</button>
          <span style={{ fontSize:12, color:'#6b7280' }}>Tip: paste raw output from <code style={mono}>curl -I https://example.com</code></span>
        </div>
      </div>

      {/* CLIENT */}
      <div style={card}>
        <div style={{ fontWeight:700, marginBottom:8 }}>Client code (HTML/JS)</div>
        <textarea value={clientSrc} onChange={e=>setClientSrc(e.target.value)} placeholder={`Paste HTML/JS here. We'll flag inline handlers, innerHTML/eval/document.write, javascript: URLs, target=_blank without rel, and POST forms lacking CSRF hints.`} style={taCss} />
        <div style={{ display:'flex', gap:8, marginTop:8, flexWrap:'wrap' }}>
          <button onClick={()=>run('Client')} style={btn}>Analyze client</button>
          <button onClick={()=>setClientSrc('')} style={btn}>Clear</button>
        </div>
      </div>

      {/* SERVER */}
      <div style={card}>
        <div style={{ fontWeight:700, marginBottom:8 }}>Server code (Node/Express or PHP)</div>
        <textarea value={serverSrc} onChange={e=>setServerSrc(e.target.value)} placeholder={`Paste backend code (Node/Express or PHP). We'll look for SQL/NoSQL injection, path traversal, command injection, SSRF, and weak JWT verify.`} style={{ ...taCss, height:200 }} />
        <div style={{ display:'flex', gap:8, marginTop:8, flexWrap:'wrap' }}>
          <button onClick={()=>run('Server')} style={btn}>Analyze server</button>
          <button onClick={()=>setServerSrc('')} style={btn}>Clear</button>
        </div>
      </div>

      {/* RESULTS */}
      <div style={card}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
          <div style={{ fontWeight:700 }}>Findings</div>
          <div style={{ display:'flex', gap:8 }}>
            <span style={badge('high')}>High: {counts.high}</span>
            <span style={badge('medium')}>Medium: {counts.med}</span>
            <span style={badge('low')}>Low: {counts.low}</span>
          </div>
        </div>
        {busy ? (
          <div>Analyzing…</div>
        ) : findings.length === 0 ? (
          <div style={{ color:'#6b7280' }}>No findings yet. Paste something and run an analysis.</div>
        ) : (
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'separate', borderSpacing:0 }}>
              <thead>
                <tr>
                  <th style={{ textAlign:'left' }}>Severity</th>
                  <th style={{ textAlign:'left' }}>Area</th>
                  <th style={{ textAlign:'left' }}>Rule</th>
                  <th style={{ textAlign:'left' }}>Message</th>
                  <th style={{ textAlign:'left' }}>Line</th>
                  <th style={{ textAlign:'left' }}>Fix</th>
                </tr>
              </thead>
              <tbody>
                {findings.map((f, i) => (
                  <tr key={i}>
                    <td style={{ padding:'4px 6px' }}><span style={badge(f.level)}>{f.level.toUpperCase()}</span></td>
                    <td style={{ padding:'4px 6px' }}>{f.area}</td>
                    <td style={{ padding:'4px 6px' }}>{f.rule}</td>
                    <td style={{ padding:'4px 6px' }}>{f.message}</td>
                    <td style={{ padding:'4px 6px' }}>{f.line ?? '—'}</td>
                    <td style={{ padding:'4px 6px', color:'#2563eb' }}>{f.fix}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {findings.length > 0 && (
          <div style={{ display:'flex', gap:8, marginTop:8 }}>
            <button onClick={copyChecklist} style={btn}>Copy fix checklist</button>
            <button onClick={()=>setFindings([])} style={btn}>Clear results</button>
          </div>
        )}
      </div>

      <div style={{ fontSize:12, color:'#6b7280' }}>
        Note: This is a heuristic/static checker for education and triage — not a substitute for a full security review or dynamic testing.
      </div>
    </div>
  );
}
