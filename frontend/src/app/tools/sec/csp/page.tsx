'use client';

import React, { useMemo, useState } from 'react';

/** ------------------- UI bits ------------------- */
type Level = 'low' | 'medium' | 'high';
const COLORS: Record<Level, string> = { low: '#2563eb', medium: '#f59e0b', high: '#ef4444' };

const mono: React.CSSProperties = { fontFamily: 'ui-monospace, Menlo, monospace' };
const card: React.CSSProperties = {
  border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
};
const row: React.CSSProperties = { display: 'flex', gap: 8, alignItems: 'baseline' };
const label: React.CSSProperties = { width: 210, fontSize: 12, color: '#6b7280' };
const inputCss: React.CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 12px', width: '100%', font: 'inherit' };
const taCss: React.CSSProperties = { ...inputCss, height: 220, resize: 'vertical' as const };
const btn: React.CSSProperties = { border:'1px solid #e5e7eb', background:'#fff', padding:'8px 12px', borderRadius:8, cursor:'pointer' };
const btnPrimary: React.CSSProperties = { ...btn, borderColor:'#2563eb', background:'#eff6ff', color:'#1e40af' };
const badge = (lvl: Level) => ({
  display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 12,
  background: COLORS[lvl] + '22', color: COLORS[lvl], border: '1px solid ' + COLORS[lvl] + '55'
});

/** ------------------- parsing helpers ------------------- */
type ParsedHeaders = { map: Record<string, string[]>; raw: string };

function parseHeaders(raw: string): ParsedHeaders {
  const map: Record<string, string[]> = {};
  // support simple folding: lines starting with space/tab continue previous
  const lines = raw.replace(/\r/g, '').split('\n');
  const merged: string[] = [];
  for (const line of lines) {
    if (!line.trim() && merged.length === 0) continue;
    if (/^\s/.test(line) && merged.length) merged[merged.length - 1] += ' ' + line.trim();
    else merged.push(line);
  }
  for (const l of merged) {
    const m = l.match(/^([^:]+):\s*(.+)$/);
    if (!m) continue;
    const k = m[1].toLowerCase();
    const v = m[2].trim();
    (map[k] ||= []).push(v);
  }
  return { map, raw };
}

function getOne(h: ParsedHeaders, name: string) {
  return h.map[name.toLowerCase()]?.[0];
}

function splitDirectives(csp: string) {
  // returns { name -> value string }
  const out: Record<string, string> = {};
  csp.split(';').map(s => s.trim()).filter(Boolean).forEach(part => {
    const sp = part.split(/\s+/);
    const name = sp.shift()?.toLowerCase() || '';
    out[name] = sp.join(' ');
  });
  return out;
}

/** ------------------- analysis core ------------------- */
type Finding = { level: Level; text: string };

type Analysis = {
  grade: 'A'|'B'|'C'|'D'|'F';
  score: number; // 0-100
  findings: Finding[];
  clickjacking: { protected: boolean; how: string[] };
  details: {
    csp?: string;
    cspDirectives?: Record<string,string>;
    xfo?: string;
    hsts?: string;
    referrer?: string;
    xcto?: string;
    pp?: string;
    coop?: string;
    coep?: string;
    corp?: string;
    rp?: string; // permissions-policy (alias)
    acao?: string;
  };
  recommended: string;
};

function analyze(raw: string): Analysis {
  const h = parseHeaders(raw);

  const findings: Finding[] = [];
  let score = 100;

  const csp = getOne(h, 'content-security-policy') || '';
  const xfo = getOne(h, 'x-frame-options') || '';
  const hsts = getOne(h, 'strict-transport-security') || '';
  const xcto = getOne(h, 'x-content-type-options') || '';
  const refPol = getOne(h, 'referrer-policy') || '';
  const permPol = getOne(h, 'permissions-policy') || getOne(h, 'permission-policy') || '';
  const coop = getOne(h, 'cross-origin-opener-policy') || '';
  const coep = getOne(h, 'cross-origin-embedder-policy') || '';
  const corp = getOne(h, 'cross-origin-resource-policy') || '';
  const acao = getOne(h, 'access-control-allow-origin') || '';

  const cspDir = csp ? splitDirectives(csp) : undefined;

  // --- Clickjacking protection ---
  let protectedCJ = false;
  const howCJ: string[] = [];
  if (cspDir?.['frame-ancestors']) {
    protectedCJ = true;
    howCJ.push(`CSP frame-ancestors: ${cspDir['frame-ancestors']}`);
    // Good values: 'none', 'self', specific origins, or https:
    const fa = cspDir['frame-ancestors'].toLowerCase();
    if (/\*|\shttp:/.test(fa)) {
      findings.push({ level: 'high', text: 'CSP `frame-ancestors` is too permissive (uses `*` or `http:`).' });
      score -= 30;
    }
  }
  if (xfo) {
    protectedCJ = true;
    howCJ.push(`X-Frame-Options: ${xfo}`);
    if (!/^(DENY|SAMEORIGIN)$/i.test(xfo)) {
      findings.push({ level: 'medium', text: 'X-Frame-Options should be `DENY` or `SAMEORIGIN`.' });
      score -= 10;
    }
  }
  if (!protectedCJ) {
    findings.push({ level: 'high', text: 'No clickjacking protection. Add CSP `frame-ancestors` (preferred) or `X-Frame-Options`.' });
    score -= 40;
  }

  // --- CSP sanity checks ---
  if (!csp) {
    findings.push({ level: 'medium', text: 'Missing Content-Security-Policy. Add a restrictive CSP.' });
    score -= 20;
  } else {
    // default-src
    const def = cspDir?.['default-src'];
    if (!def) {
      findings.push({ level: 'low', text: 'CSP is missing `default-src` (not mandatory, but useful default).' });
      score -= 4;
    } else if (/\*/.test(def)) {
      findings.push({ level: 'medium', text: '`default-src` uses wildcard `*`. Prefer explicit origins and `https:`.' });
      score -= 10;
    }

    // script-src
    const scr = cspDir?.['script-src'] || def || '';
    if (scr) {
      const hasUnsafeInline = /'unsafe-inline'/.test(scr);
      const hasNonceOrHash = /'nonce-|sha(256|384|512)-/.test(scr);
      if (hasUnsafeInline && !hasNonceOrHash) {
        findings.push({ level: 'high', text: '`script-src` contains `\'unsafe-inline\'` without nonces/hashes.' });
        score -= 25;
      }
      if (/'unsafe-eval'/.test(scr)) {
        findings.push({ level: 'medium', text: '`script-src` contains `\'unsafe-eval\'`.' });
        score -= 12;
      }
      if (/\*/.test(scr)) {
        findings.push({ level: 'medium', text: '`script-src` uses wildcard `*`.' });
        score -= 10;
      }
      if (/data:/.test(scr)) {
        findings.push({ level: 'low', text: '`script-src` allows `data:` — avoid if possible.' });
        score -= 5;
      }
    }

    // style-src
    const sty = cspDir?.['style-src'] || def || '';
    if (sty) {
      if (/'unsafe-inline'/.test(sty) && !/nonce-|sha(256|384|512)-/.test(sty)) {
        findings.push({ level: 'medium', text: '`style-src` allows inline styles without nonces/hashes.' });
        score -= 10;
      }
      if (/\*/.test(sty)) {
        findings.push({ level: 'low', text: '`style-src` uses wildcard `*`.' });
        score -= 5;
      }
    }

    // object-src
    const obj = cspDir?.['object-src'];
    if (!obj || !/\b'none'\b/.test(obj)) {
      findings.push({ level: 'medium', text: 'Add `object-src \'none\'` to disable plug-ins (Flash, etc.).' });
      score -= 10;
    }

    // base-uri
    const base = cspDir?.['base-uri'];
    if (!base) {
      findings.push({ level: 'medium', text: 'Add `base-uri \'self\'` to prevent base URL abuse.' });
      score -= 10;
    }

    // frame-ancestors already checked

    // form-action
    const form = cspDir?.['form-action'];
    if (!form) {
      findings.push({ level: 'low', text: 'Consider `form-action \'self\'` to restrict form submissions.' });
      score -= 5;
    }

    // mixed content
    if (!csp.includes('upgrade-insecure-requests') && !csp.includes('block-all-mixed-content')) {
      findings.push({ level: 'low', text: 'Consider `upgrade-insecure-requests` (and/or `block-all-mixed-content`).' });
      score -= 3;
    }
  }

  // --- Other headers ---
  if (!xcto || !/nosniff/i.test(xcto)) {
    findings.push({ level: 'medium', text: 'Add `X-Content-Type-Options: nosniff`.' });
    score -= 10;
  }
  if (!refPol) {
    findings.push({ level: 'low', text: 'Add a `Referrer-Policy` (e.g., `no-referrer` or `strict-origin-when-cross-origin`).' });
    score -= 5;
  } else if (/unsafe-url|no-referrer-when-downgrade/i.test(refPol)) {
    findings.push({ level: 'low', text: 'Referrer-Policy is permissive; prefer `strict-origin-when-cross-origin` or `no-referrer`.' });
    score -= 3;
  }

  if (!hsts) {
    findings.push({ level: 'medium', text: 'Add HSTS: `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload` (HTTPS only).' });
    score -= 10;
  } else {
    const m = hsts.match(/max-age=(\d+)/i);
    const age = m ? Number(m[1]) : 0;
    if (!m || age < 15552000) {
      findings.push({ level: 'medium', text: 'HSTS `max-age` is low; use ≥ 15552000 (180d), ideally ≥ 31536000 (1y).' });
      score -= 6;
    }
    if (!/includeSubDomains/i.test(hsts)) {
      findings.push({ level: 'low', text: 'Consider `includeSubDomains` in HSTS.' });
      score -= 2;
    }
  }

  // COOP/COEP/CORP
  if (!coop) findings.push({ level: 'low', text: 'Consider `Cross-Origin-Opener-Policy: same-origin` for isolation.' });
  if (!coep) findings.push({ level: 'low', text: 'Consider `Cross-Origin-Embedder-Policy: require-corp` for stronger isolation (may break embeds).' });
  if (!corp) findings.push({ level: 'low', text: 'Consider `Cross-Origin-Resource-Policy: same-site` (or tighter) to protect resources.' });

  // Permissions-Policy
  if (!permPol) findings.push({ level: 'low', text: 'Add `Permissions-Policy` to limit powerful APIs (camera, geolocation, etc.).' });
  else if (/= \*|=\*/.test(permPol)) {
    findings.push({ level: 'medium', text: 'Permissions-Policy allows `*` for some features; restrict to `()` or specific origins.' });
    score -= 6;
  }

  // CORS
  if (acao && /\*/.test(acao)) {
    findings.push({ level: 'low', text: 'CORS `Access-Control-Allow-Origin: *` exposes responses cross-origin (OK for public assets).' });
  }

  // Bound score and grade
  score = Math.max(0, Math.min(100, score));
  const grade: Analysis['grade'] =
    score >= 90 ? 'A' :
    score >= 80 ? 'B' :
    score >= 65 ? 'C' :
    score >= 50 ? 'D' : 'F';

  const recommended =
`Content-Security-Policy: default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; form-action 'self'; upgrade-insecure-requests
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Resource-Policy: same-site`;

  return {
    grade,
    score,
    findings,
    clickjacking: { protected: protectedCJ, how: howCJ },
    details: {
      csp, cspDirectives: cspDir, xfo, hsts, referrer: refPol, xcto, pp: permPol, rp: permPol, coop, coep, corp, acao
    },
    recommended
  };
}

/** ------------------- small helpers ------------------- */
function copy(text: string) {
  return navigator.clipboard?.writeText(text).catch(() => {});
}

/** ------------------- Page ------------------- */
export default function CSPCheckerPage() {
  const [raw, setRaw] = useState<string>('');
  const [showRec, setShowRec] = useState<boolean>(false);

  const res = useMemo(() => raw.trim() ? analyze(raw) : null, [raw]);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <h1 style={{ margin: 0 }}>CSP & Clickjacking Checker</h1>
      <p style={{ margin: 0, color: '#555' }}>
        Paste HTTP response headers. This tool grades your <b>Content-Security-Policy</b>, clickjacking protections
        (<code style={mono}>frame-ancestors</code> / <code style={mono}>X-Frame-Options</code>), and key security headers — all locally.
      </p>

      <div style={card}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Headers</div>
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder={`HTTP/1.1 200 OK
Content-Security-Policy: default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; script-src 'self'
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
Permissions-Policy: camera=(), microphone=(), geolocation=()
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Resource-Policy: same-site`}
          style={taCss}
        />
        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 6 }}>
          Tip: paste the headers from your browser DevTools (Network tab → Response headers).
        </div>
      </div>

      {res && (
        <>
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 700 }}>Grade</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{res.grade} <span style={{ fontSize: 14, color: '#6b7280' }}>({res.score}/100)</span></div>
            </div>

            <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
              <div style={row}>
                <div style={label}>Clickjacking</div>
                <div>
                  {res.clickjacking.protected
                    ? <span style={badge('low')}>Protected</span>
                    : <span style={badge('high')}>Unprotected</span>}
                  {res.clickjacking.how.length > 0 && (
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {res.clickjacking.how.map((h, i) => <li key={i}><code style={mono}>{h}</code></li>)}
                    </ul>
                  )}
                </div>
              </div>

              <div style={row}><div style={label}>Content-Security-Policy</div><div><code style={mono}>{res.details.csp || '—'}</code></div></div>
              <div style={row}><div style={label}>X-Frame-Options</div><div><code style={mono}>{res.details.xfo || '—'}</code></div></div>
              <div style={row}><div style={label}>HSTS</div><div><code style={mono}>{res.details.hsts || '—'}</code></div></div>
              <div style={row}><div style={label}>X-Content-Type-Options</div><div><code style={mono}>{res.details.xcto || '—'}</code></div></div>
              <div style={row}><div style={label}>Referrer-Policy</div><div><code style={mono}>{res.details.referrer || '—'}</code></div></div>
              <div style={row}><div style={label}>Permissions-Policy</div><div><code style={mono}>{res.details.pp || '—'}</code></div></div>
              <div style={row}><div style={label}>COOP / COEP / CORP</div><div>
                <code style={mono}>{res.details.coop || '—'}</code> · <code style={mono}>{res.details.coep || '—'}</code> · <code style={mono}>{res.details.corp || '—'}</code>
              </div></div>
            </div>

            {res.details.cspDirectives && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>CSP directives</div>
                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
                  <thead>
                    <tr><th style={{ textAlign:'left' }}>Directive</th><th style={{ textAlign:'left' }}>Value</th></tr>
                  </thead>
                  <tbody>
                    {Object.entries(res.details.cspDirectives).map(([k, v]) => (
                      <tr key={k}>
                        <td style={{ padding: '4px 6px', width: 220, color: '#374151' }}>{k}</td>
                        <td style={{ padding: '4px 6px' }}><code style={mono}>{v || '(none)'}</code></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {res.findings.length > 0 && (
            <div style={card}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Findings</div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {res.findings.map((f, i) => (
                  <li key={i} style={{ color: COLORS[f.level] }}>{f.text}</li>
                ))}
              </ul>
            </div>
          )}

          <div style={card}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 6 }}>
              <div style={{ fontWeight: 700 }}>Recommended baseline headers</div>
              <div>
                <button onClick={() => { copy(res.recommended); setShowRec(true); }} style={btnPrimary}>Copy</button>
              </div>
            </div>
            <pre style={{ ...mono, background: '#f8fafc', border: '1px solid #eef2f7', padding: 10, borderRadius: 8, overflow: 'auto' }}>
{res.recommended}
            </pre>
            <div style={{ fontSize: 12, color: '#6b7280' }}>
              Notes: set <code style={mono}>frame-ancestors</code> to specific origins if your site must be embedded. For inline scripts/styles, prefer nonces/hashes over <code style={mono}>'unsafe-inline'</code>.
            </div>
          </div>
        </>
      )}
    </div>
  );
}
