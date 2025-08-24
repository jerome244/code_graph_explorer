'use client';

import React, { useMemo, useState } from 'react';

/* ---------------- UI bits ---------------- */
const mono: React.CSSProperties = { fontFamily: 'ui-monospace, Menlo, monospace' };
const card: React.CSSProperties = { border:'1px solid #e5e7eb', borderRadius:12, padding:16, background:'#fff' };
const row: React.CSSProperties  = { display:'flex', gap:8, alignItems:'baseline' };
const label: React.CSSProperties= { width: 200, fontSize:12, color:'#6b7280' };
const inputCss: React.CSSProperties = { border:'1px solid #e5e7eb', borderRadius:8, padding:'10px 12px', width:'100%', font:'inherit' };
const taCss: React.CSSProperties = { ...inputCss, height: 100, resize:'vertical' as const };
const btn: React.CSSProperties = { border:'1px solid #e5e7eb', background:'#fff', padding:'8px 12px', borderRadius:8, cursor:'pointer' };
const btnPrimary: React.CSSProperties = { ...btn, borderColor:'#2563eb', background:'#eff6ff', color:'#1e40af' };
const badge = (ok: boolean) => ({
  display:'inline-block', padding:'2px 8px', borderRadius:999, fontSize:12,
  background: (ok ? '#16a34a22' : '#ef444422'), color: ok ? '#16a34a' : '#ef4444', border: '1px solid ' + (ok ? '#16a34a55' : '#ef444455')
});

/* ---------------- helpers ---------------- */
type Analysis = {
  ok: boolean;
  finalURL?: string;
  reasons: string[];
  normalizedInput: string;
  decodedSteps: string[];
  suggestions: string[];
};

function tryDecodeURIOnce(s: string) {
  try { return decodeURIComponent(s); } catch { return s; }
}
function multiDecode(s: string, passes = 3) {
  const steps = [s];
  let cur = s;
  for (let i = 0; i < passes; i++) {
    const next = tryDecodeURIOnce(cur);
    if (next === cur) break;
    steps.push(next);
    cur = next;
  }
  return { value: cur, steps };
}

function isIPAddress(host: string) {
  // IPv4
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    const parts = host.split('.').map(Number);
    if (parts.some(p => p > 255)) return false;
    return true;
  }
  // bracketless IPv6 quick check (URL will give [::1] in host)
  return host.includes(':');
}
function isPrivate(host: string) {
  // Only for IPv4 private ranges and localhost names; treat IPv6 with ":" as private-ish unless resolved (simplified)
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false;
  const [a,b] = host.split('.').map(Number);
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}
function looksLikeProtocolAbuse(s: string) {
  const lower = s.trim().toLowerCase();
  return lower.startsWith('javascript:') || lower.startsWith('data:') || lower.startsWith('file:') || lower.startsWith('vbscript:');
}
function startsWithSchemeRelative(s: string) {
  // begins with // (possibly after spaces)
  return /^\s*\/\//.test(s);
}
function startsWithBackslashTrick(s: string) {
  // \evil.com or \\evil.com (browsers may normalize)
  return /^\s*\\\\?/.test(s);
}
function normalizeBackslashes(s: string) {
  return s.replace(/\\/g, '/');
}
function cleanLeadingSpaces(s: string) {
  return s.replace(/^\s+/, '');
}
function parseCSV(input: string) {
  return input.split(',').map(s=>s.trim()).filter(Boolean);
}
function hostMatchesAllowlist(host: string, allowlist: string[]) {
  if (allowlist.length === 0) return true;
  const h = host.toLowerCase();
  for (const entry of allowlist) {
    const e = entry.toLowerCase();
    if (e.startsWith('.')) {
      if (h === e.slice(1) || h.endsWith(e)) return true; // .example.com matches example.com and subdomains
    } else {
      if (h === e) return true;
    }
  }
  return false;
}

/* ---------------- core analyzer ---------------- */
type Options = {
  baseURL: string;            // your redirect endpoint origin for resolving relatives
  requireSameOrigin: boolean; // prefer same-origin only
  allowRelative: boolean;     // allow relative paths
  allowHttp: boolean;         // allow redirect to http (downgrade)
  blockPrivate: boolean;      // block localhost/private IPs
  blockProtocols: string[];   // e.g., javascript,data,file
  blockSchemeRelative: boolean;
  decodePasses: number;       // recursively decode %xx
  allowlistHosts: string[];   // optional host allowlist; .example.com for subdomains
};

function analyzeRedirect(userValue: string, opts: Options): Analysis {
  const reasons: string[] = [];
  const suggestions: string[] = [];

  let input = cleanLeadingSpaces(userValue || '');
  if (startsWithBackslashTrick(input)) {
    reasons.push('Value starts with backslashes (can become // after normalization).');
    input = normalizeBackslashes(input);
  }

  // decode multiple times to catch %2F%2F tricks
  const decoded = multiDecode(input, opts.decodePasses);
  const normalizedInput = decoded.value;

  if (startsWithSchemeRelative(normalizedInput)) {
    if (opts.blockSchemeRelative) {
      reasons.push('Scheme-relative URL (starts with //) — often used for open redirects.');
    }
  }

  if (looksLikeProtocolAbuse(normalizedInput) || opts.blockProtocols.some(p => normalizedInput.toLowerCase().startsWith(p.toLowerCase() + ':'))) {
    reasons.push('Blocked protocol used (javascript:, data:, file:, ...).');
  }

  // Resolve against base
  let final: URL | null = null;
  try {
    const base = new URL(opts.baseURL);
    final = new URL(normalizedInput, base);
    // Compare origins
    if (opts.requireSameOrigin && final.origin !== base.origin) {
      reasons.push(`Destination origin differs: ${final.origin} (expected ${base.origin}).`);
    }
    // Scheme downgrade
    if (!opts.allowHttp && base.protocol === 'https:' && final.protocol !== 'https:') {
      reasons.push(`Protocol downgrade to ${final.protocol.replace(':','')} is not allowed.`);
    }
    // Private/localhost
    const host = final.hostname;
    if (opts.blockPrivate && (isPrivate(host) || host === 'localhost' || isIPAddress(host) && isPrivate(host))) {
      reasons.push('Destination host is private/localhost — blocked.');
    }
    // Allowlist
    if (!hostMatchesAllowlist(final.hostname, opts.allowlistHosts)) {
      reasons.push(`Host "${final.hostname}" not in allowlist.`);
    }
  } catch {
    reasons.push('Value could not be resolved to a URL/path.');
  }

  const ok = reasons.length === 0;
  if (!ok) {
    suggestions.push('Prefer validating and allowing only relative paths you control.');
    if (opts.allowlistHosts.length === 0) suggestions.push('If you must support external redirects, use a strict host allowlist (exact domains).');
    suggestions.push('Reject values starting with "//" or containing a protocol ("://").');
    suggestions.push('Decode once and re-check; then reject if still external.');
    suggestions.push('Fallback to a safe default (e.g., "/").');
  } else {
    suggestions.push('Looks safe under current policy.');
  }

  return {
    ok,
    finalURL: final?.href,
    reasons,
    normalizedInput,
    decodedSteps: decoded.steps,
    suggestions
  };
}

/* ---------------- page ---------------- */
const DEFAULT_PARAMS = 'url,next,redirect,redir,dest,destination,return,returnUrl,continue,target,u,go,r';

export default function OpenRedirectDetector() {
  const [endpoint, setEndpoint] = useState('https://app.example.com/redirect');
  const [paramNames, setParamNames] = useState(DEFAULT_PARAMS);
  const [allowlist, setAllowlist] = useState('.example.com');
  const [requireSameOrigin, setRequireSameOrigin] = useState(true);
  const [allowRelative, setAllowRelative] = useState(true);
  const [allowHttp, setAllowHttp] = useState(false);
  const [blockPrivate, setBlockPrivate] = useState(true);
  const [blockSchemeRelative, setBlockSchemeRelative] = useState(true);
  const [decodePasses, setDecodePasses] = useState(3);
  const [blockedProtocols, setBlockedProtocols] = useState('javascript,data,file,vbscript');

  // testing area
  const [testValue, setTestValue] = useState('/dashboard');
  const params = useMemo(() => parseCSV(paramNames), [paramNames]);

  const opts: Options = useMemo(() => ({
    baseURL: endpoint,
    requireSameOrigin,
    allowRelative,
    allowHttp,
    blockPrivate,
    blockProtocols: parseCSV(blockedProtocols),
    blockSchemeRelative,
    decodePasses: Math.max(0, Math.min(6, Number(decodePasses) || 0)),
    allowlistHosts: parseCSV(allowlist)
  }), [endpoint, requireSameOrigin, allowRelative, allowHttp, blockPrivate, blockedProtocols, blockSchemeRelative, decodePasses, allowlist]);

  const result = useMemo(() => analyzeRedirect(testValue, opts), [testValue, opts]);

  function loadExample(kind: 'safe-relative'|'open-scheme-relative'|'open-double-encoded'|'open-protocol') {
    if (kind === 'safe-relative') {
      setTestValue('/profile?tab=security');
    } else if (kind === 'open-scheme-relative') {
      setTestValue('//evil.com/login');
    } else if (kind === 'open-double-encoded') {
      setTestValue('%252F%252Fevil.com'); // decodes to //evil.com
    } else {
      setTestValue('javascript:alert(1)');
    }
  }

  const exampleQuery = useMemo(() => {
    // Show what the vulnerable URL might look like with the chosen param
    const first = params[0] || 'next';
    try {
      const u = new URL(endpoint);
      u.searchParams.set(first, testValue);
      return u.href;
    } catch {
      return '';
    }
  }, [endpoint, params, testValue]);

  const safeSnippet = `
/** Server-side safe redirect (Node/Express example) */
import { URL } from 'node:url';

const ALLOWLIST = ${JSON.stringify(opts.allowlistHosts)};
const BASE_ORIGIN = new URL('${endpoint}').origin;

function isAllowedTarget(input) {
  if (!input) return false;
  // normalize & decode once
  input = input.replace(/^\\s+/, '').replace(/\\\\/g, '/');
  try { input = decodeURIComponent(input); } catch {}
  if (/^\\/\\//.test(input)) return false;               // no scheme-relative
  if (/^[a-z]+:/i.test(input)) return false;              // no protocols
  // resolve against your site
  const resolved = new URL(input, BASE_ORIGIN);
  // same-origin only?
  if (${requireSameOrigin}) {
    if (resolved.origin !== BASE_ORIGIN) return false;
  }
  // allowlist external hosts (if any)
  if (ALLOWLIST.length) {
    const host = resolved.hostname.toLowerCase();
    const allowed = ALLOWLIST.some(e => e.startsWith('.') ? (host === e.slice(1) || host.endsWith(e)) : host === e.toLowerCase());
    if (!allowed) return false;
  }
  // https-only?
  if (!${allowHttp} && resolved.protocol !== 'https:') return false;
  // block localhost/private (defense-in-depth)
  if (${blockPrivate}) {
    if (/(^|\\.)localhost$/i.test(resolved.hostname)) return false;
    if (/^(10\\.|127\\.|192\\.168\\.|172\\.(1[6-9]|2\\d|3[0-1])\\.|169\\.254\\.)/.test(resolved.hostname)) return false;
  }
  return true;
}

app.get('/redirect', (req, res) => {
  const candidates = ${JSON.stringify(params)}.map(k => req.query[k]).filter(Boolean);
  const dest = (candidates[0] as string) || '/';
  if (!isAllowedTarget(dest)) return res.redirect(302, '/');
  res.redirect(302, new URL(dest, BASE_ORIGIN).href);
});`.trim();

  return (
    <div style={{ display:'grid', gap:16 }}>
      <h1 style={{ margin:0 }}>Open Redirect Detector</h1>
      <p style={{ margin:0, color:'#555' }}>
        Test your redirect endpoint. Try values attackers use (<code style={mono}>//evil.com</code>, double-encoded, <code style={mono}>javascript:</code>).
        Get a pass/fail verdict and secure validation snippet.
      </p>

      {/* Config */}
      <div style={card}>
        <div style={{ fontWeight:700, marginBottom:8 }}>Endpoint configuration</div>
        <div style={row}>
          <div style={label}>Redirect endpoint URL</div>
          <input value={endpoint} onChange={e=>setEndpoint(e.target.value)} style={inputCss} />
        </div>
        <div style={row}>
          <div style={label}>Parameter names (comma-sep)</div>
          <input value={paramNames} onChange={e=>setParamNames(e.target.value)} style={inputCss} />
        </div>
        <div style={{ display:'flex', gap:16, flexWrap:'wrap', marginTop:8 }}>
          <label style={{ display:'flex', alignItems:'center', gap:8 }}>
            <input type="checkbox" checked={requireSameOrigin} onChange={e=>setRequireSameOrigin(e.target.checked)} />
            <span>Require same-origin</span>
          </label>
          <label style={{ display:'flex', alignItems:'center', gap:8 }}>
            <input type="checkbox" checked={allowRelative} onChange={e=>setAllowRelative(e.target.checked)} />
            <span>Allow relative paths</span>
          </label>
          <label style={{ display:'flex', alignItems:'center', gap:8 }}>
            <input type="checkbox" checked={blockSchemeRelative} onChange={e=>setBlockSchemeRelative(e.target.checked)} />
            <span>Block <code style={mono}>//host</code> (scheme-relative)</span>
          </label>
          <label style={{ display:'flex', alignItems:'center', gap:8 }}>
            <input type="checkbox" checked={blockPrivate} onChange={e=>setBlockPrivate(e.target.checked)} />
            <span>Block localhost/private IPs</span>
          </label>
          <label style={{ display:'flex', alignItems:'center', gap:8 }}>
            <input type="checkbox" checked={!allowHttp} onChange={e=>setAllowHttp(!e.target.checked)} />
            <span>HTTPS-only</span>
          </label>
        </div>
        <div style={{ display:'grid', gap:8, marginTop:8 }}>
          <div style={row}>
            <div style={label}>Blocked protocols</div>
            <input value={blockedProtocols} onChange={e=>setBlockedProtocols(e.target.value)} style={inputCss} />
          </div>
          <div style={row}>
            <div style={label}>Allowlist hosts (optional)</div>
            <input value={allowlist} onChange={e=>setAllowlist(e.target.value)} placeholder=".example.com, login.partner.com" style={inputCss} />
          </div>
          <div style={row}>
            <div style={label}>Decode %xx passes</div>
            <input type="number" value={decodePasses} min={0} max={6} onChange={e=>setDecodePasses(Number(e.target.value)||0)} style={{ ...inputCss, width: 120 }} />
          </div>
        </div>
      </div>

      {/* Tester */}
      <div style={card}>
        <div style={{ fontWeight:700, marginBottom:8 }}>Try a user value</div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <input value={testValue} onChange={e=>setTestValue(e.target.value)} placeholder="/dashboard or //evil.com or %252F%252Fevil.com" style={inputCss} />
          <button onClick={()=>loadExample('safe-relative')} style={btn}>Example: safe</button>
          <button onClick={()=>loadExample('open-scheme-relative')} style={btn}>Example: //host</button>
          <button onClick={()=>loadExample('open-double-encoded')} style={btn}>Example: double-encoded</button>
          <button onClick={()=>loadExample('open-protocol')} style={btn}>Example: javascript:</button>
        </div>

        <div style={{ display:'flex', alignItems:'center', gap:12, marginTop:12, flexWrap:'wrap' }}>
          <div><span style={badge(result.ok)}>Redirect {result.ok ? 'SAFE under policy' : 'OPEN (blocked by policy)'}</span></div>
          {exampleQuery && (
            <div style={{ fontSize:12, color:'#6b7280' }}>
              Example request: <code style={mono}>{exampleQuery}</code>
            </div>
          )}
        </div>

        <div style={{ display:'grid', gap:8, marginTop:10 }}>
          <div style={row}><div style={label}>Normalized input</div><div><code style={mono}>{result.normalizedInput || '—'}</code></div></div>
          {result.decodedSteps.length > 1 && (
            <div style={row}>
              <div style={label}>Decode steps</div>
              <div>
                <ol style={{ margin: 0, paddingLeft: 18 }}>
                  {result.decodedSteps.map((s, i) => <li key={i}><code style={mono}>{s || '""'}</code></li>)}
                </ol>
              </div>
            </div>
          )}
          <div style={row}><div style={label}>Resolved final URL</div><div><code style={mono}>{result.finalURL || '—'}</code></div></div>
        </div>

        {result.reasons.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontWeight:600, marginBottom:6 }}>Why it’s unsafe</div>
            <ul style={{ margin:0, paddingLeft:18 }}>
              {result.reasons.map((r,i)=><li key={i} style={{ color:'#ef4444' }}>{r}</li>)}
            </ul>
          </div>
        )}

        {result.suggestions.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontWeight:600, marginBottom:6 }}>Suggestions</div>
            <ul style={{ margin:0, paddingLeft:18 }}>
              {result.suggestions.map((s,i)=><li key={i} style={{ color:'#2563eb' }}>{s}</li>)}
            </ul>
          </div>
        )}
      </div>

      {/* Copyable server snippet */}
      <div style={card}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontWeight:700 }}>Server-side fix snippet</div>
          <button onClick={()=>navigator.clipboard.writeText(safeSnippet)} style={btnPrimary}>Copy</button>
        </div>
        <pre style={{ ...mono, background:'#f8fafc', border:'1px solid #eef2f7', padding:10, borderRadius:8, overflow:'auto' }}>
{safeSnippet}
        </pre>
        <div style={{ fontSize:12, color:'#6b7280' }}>
          Tip: Prefer returning relative paths you control. If you need cross-site redirects, allowlist exact hosts and always resolve against your origin before redirecting.
        </div>
      </div>
    </div>
  );
}
