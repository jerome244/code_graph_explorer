'use client';

import React, { useMemo, useState } from 'react';

/* ----------------- UI bits ----------------- */
const mono: React.CSSProperties = { fontFamily: 'ui-monospace, Menlo, monospace' };
const card: React.CSSProperties = { border:'1px solid #e5e7eb', borderRadius:12, padding:16, background:'#fff' };
const row: React.CSSProperties  = { display:'flex', gap:8, alignItems:'baseline' };
const label: React.CSSProperties= { width: 180, fontSize:12, color:'#6b7280' };
const inputCss: React.CSSProperties = { border:'1px solid #e5e7eb', borderRadius:8, padding:'10px 12px', width:'100%', font:'inherit' };
const taCss: React.CSSProperties = { ...inputCss, height:140, resize:'vertical' as const };
const btn: React.CSSProperties = { border:'1px solid #e5e7eb', background:'#fff', padding:'8px 12px', borderRadius:8, cursor:'pointer' };
const btnPrimary: React.CSSProperties = { ...btn, borderColor:'#2563eb', background:'#eff6ff', color:'#1e40af' };
const badge = (ok: boolean) => ({
  display:'inline-block', padding:'2px 8px', borderRadius:999, fontSize:12,
  background: (ok ? '#16a34a22' : '#ef444422'), color: ok ? '#16a34a' : '#ef4444', border: '1px solid ' + (ok ? '#16a34a55' : '#ef444455')
});

/* ----------------- helpers ----------------- */
function parseHeaderBlock(raw: string): Record<string, string> {
  const map: Record<string, string> = {};
  const lines = raw.replace(/\r/g,'').split('\n');
  for (const line of lines) {
    const m = line.match(/^\s*([^:]+):\s*(.+)\s*$/);
    if (!m) continue;
    map[m[1].toLowerCase()] = m[2];
  }
  return map;
}

function splitCommaList(v?: string) {
  if (!v) return [];
  return v.split(',').map(s=>s.trim()).filter(Boolean);
}

function hasToken(list: string[] | string | undefined, token: string) {
  if (!list) return false;
  const arr = Array.isArray(list) ? list : splitCommaList(list);
  return arr.map(s => s.toLowerCase()).includes(token.toLowerCase());
}

function normalizeOrigin(v: string) {
  try { return new URL(v).origin; } catch { return v; }
}

const SIMPLE_METHODS = new Set(['GET','HEAD','POST']);
const SIMPLE_HEADERS = new Set(['accept','accept-language','content-language','content-type']);
const SIMPLE_CT = new Set([
  'application/x-www-form-urlencoded',
  'multipart/form-data',
  'text/plain'
]);

function isSimpleRequest(method: string, reqHeaders: Record<string,string>) {
  if (!SIMPLE_METHODS.has(method.toUpperCase())) return false;
  // Allowed headers only, and simple content-type if present
  for (const k of Object.keys(reqHeaders)) {
    const lk = k.toLowerCase();
    if (!SIMPLE_HEADERS.has(lk)) return false;
    if (lk === 'content-type') {
      const v = reqHeaders[k].toLowerCase().split(';')[0].trim();
      if (!SIMPLE_CT.has(v)) return false;
    }
  }
  return true;
}

/* ----------------- analysis ----------------- */
type Inputs = {
  origin: string;
  method: string;
  url: string;
  reqHeadersText: string;
  withCreds: boolean;
  respHeadersText: string;
};

type Verdict = {
  preflightNeeded: boolean;
  preflight: { ok: boolean; reasons: string[] };
  actual: { ok: boolean; reasons: string[] };
  tips: string[];
};

function analyzeCors(i: Inputs): Verdict {
  const origin = i.origin.trim();
  const method = i.method.trim().toUpperCase() || 'GET';
  const reqH = parseHeaderBlock(i.reqHeadersText);
  const respH = parseHeaderBlock(i.respHeadersText);

  // Normalize key response headers
  const ACAO = respH['access-control-allow-origin'];              // * or echoed origin
  const ACAC = respH['access-control-allow-credentials'];         // 'true' when sending cookies/auth
  const ACAM = respH['access-control-allow-methods'];             // comma list, includes method
  const ACAH = respH['access-control-allow-headers'];             // comma list, includes requested headers
  const ACMA = respH['access-control-max-age'];                   // optional caching
  const Vary = respH['vary'];

  const reqHeaderNames = Object.keys(reqH).map(h => h.toLowerCase());

  const simple = isSimpleRequest(method, reqH);
  const preflightNeeded = !simple || i.withCreds && !SIMPLE_METHODS.has(method) ? true : (!simple);

  const reasonsPF: string[] = [];
  const reasonsActual: string[] = [];
  const tips: string[] = [];

  const originNorm = normalizeOrigin(origin);
  const acaoMatches =
    ACAO === '*' ? !i.withCreds : (ACAO && ACAO.toLowerCase() === originNorm.toLowerCase());

  // --------- Preflight phase ---------
  let pfOK = true;
  if (preflightNeeded) {
    // Method must be allowed
    const allowMethods = splitCommaList(ACAM).map(s=>s.toUpperCase());
    if (!allowMethods.length) {
      pfOK = false;
      reasonsPF.push('Missing Access-Control-Allow-Methods on preflight response.');
      tips.push('Return Access-Control-Allow-Methods including the target method (e.g., "GET, POST, PUT").');
    } else if (!(allowMethods.includes(method) || allowMethods.includes('*'))) {
      pfOK = false;
      reasonsPF.push(`Method ${method} not listed in Access-Control-Allow-Methods.`);
      tips.push(`Include "${method}" in Access-Control-Allow-Methods.`);
    }

    // Non-simple request headers must be allowed
    const nonSimpleReqHeaders = reqHeaderNames.filter(h => {
      if (SIMPLE_HEADERS.has(h)) {
        if (h === 'content-type') {
          const v = (reqH['content-type']||'').toLowerCase().split(';')[0].trim();
          return !SIMPLE_CT.has(v);
        }
        return false;
      }
      return true;
    });

    if (nonSimpleReqHeaders.length) {
      const allowedHdrs = splitCommaList(ACAH).map(s=>s.toLowerCase());
      if (!allowedHdrs.length) {
        pfOK = false;
        reasonsPF.push(`Missing Access-Control-Allow-Headers; need to allow: ${nonSimpleReqHeaders.join(', ')}.`);
        tips.push(`Return Access-Control-Allow-Headers including ${nonSimpleReqHeaders.join(', ')} (or a safe superset).`);
      } else {
        for (const h of nonSimpleReqHeaders) {
          if (!(allowedHdrs.includes(h) || allowedHdrs.includes('*'))) {
            pfOK = false;
            reasonsPF.push(`Header "${h}" not permitted in Access-Control-Allow-Headers.`);
            tips.push(`Add "${h}" to Access-Control-Allow-Headers.`);
          }
        }
      }
    }

    // ACAO must allow the origin on preflight too
    if (!ACAO) {
      pfOK = false;
      reasonsPF.push('Missing Access-Control-Allow-Origin.');
      tips.push('Return Access-Control-Allow-Origin set to the requesting origin or "*".');
    } else if (!acaoMatches) {
      pfOK = false;
      reasonsPF.push(i.withCreds ? 'ACAO cannot be "*" when credentials are sent.' : `ACAO does not match Origin (${originNorm}).`);
      tips.push(i.withCreds
        ? 'When credentials are sent, echo the exact Origin and include Access-Control-Allow-Credentials: true.'
        : 'Echo the Origin or use a permissive value if appropriate.');
    }

    // Credentials requirement on preflight response (browsers mainly enforce on actual, but many frameworks return it on both)
    if (i.withCreds) {
      if (!ACAC || !/^\s*true\s*$/i.test(ACAC)) {
        pfOK = false;
        reasonsPF.push('Missing Access-Control-Allow-Credentials: true for credentialed request.');
        tips.push('Add Access-Control-Allow-Credentials: true (and do not use ACAO="*").');
      }
      if (ACAO === '*') {
        pfOK = false;
        reasonsPF.push('ACAO="*" is invalid with credentials.');
      }
      if (!Vary || !/origin/i.test(Vary)) {
        tips.push('Add `Vary: Origin` when echoing ACAO to enable proper caching.');
      }
    }

    // Nice-to-have cache
    if (ACMA) {
      tips.push(`Preflight can be cached by the browser (Access-Control-Max-Age=${ACMA}).`);
    } else {
      tips.push('Optionally add Access-Control-Max-Age to cache preflights.');
    }
  }

  // --------- Actual response phase ---------
  let actualOK = true;

  if (!ACAO) {
    actualOK = false;
    reasonsActual.push('Missing Access-Control-Allow-Origin on the actual response.');
    tips.push('Include ACAO on the actual response (not just preflight).');
  } else if (!acaoMatches) {
    actualOK = false;
    reasonsActual.push(i.withCreds ? 'ACAO cannot be "*" with credentials.' : `ACAO does not match Origin (${originNorm}).`);
  }

  if (i.withCreds) {
    if (!ACAC || !/^\s*true\s*$/i.test(ACAC)) {
      actualOK = false;
      reasonsActual.push('Missing Access-Control-Allow-Credentials: true with credentials.');
    }
    if (ACAO === '*') {
      actualOK = false;
      reasonsActual.push('ACAO="*" is invalid when credentials are sent.');
    }
  }

  return {
    preflightNeeded,
    preflight: { ok: !preflightNeeded || pfOK, reasons: reasonsPF },
    actual: { ok: actualOK, reasons: reasonsActual },
    tips
  };
}

/* ----------------- page ----------------- */
export default function CORSExplainer() {
  const [origin, setOrigin] = useState('https://app.example.com');
  const [url, setUrl] = useState('https://api.example.com/resource');
  const [method, setMethod] = useState('GET');
  const [withCreds, setWithCreds] = useState(false);
  const [reqHeadersText, setReqHeadersText] = useState('');
  const [respHeadersText, setRespHeadersText] = useState('');

  const result = useMemo(() => analyzeCors({ origin, url, method, withCreds, reqHeadersText, respHeadersText }), [origin, url, method, withCreds, reqHeadersText, respHeadersText]);

  function loadExample(kind: 'simple-pass' | 'needs-preflight-pass' | 'fail-creds') {
    if (kind === 'simple-pass') {
      setOrigin('https://app.example.com');
      setUrl('https://api.example.com/data');
      setMethod('GET');
      setWithCreds(false);
      setReqHeadersText('');
      setRespHeadersText(
`Access-Control-Allow-Origin: https://app.example.com
Vary: Origin`
      );
    } else if (kind === 'needs-preflight-pass') {
      setOrigin('https://app.example.com');
      setUrl('https://api.example.com/submit');
      setMethod('PUT');
      setWithCreds(false);
      setReqHeadersText(
`Content-Type: application/json
X-Requested-With: fetch`
      );
      setRespHeadersText(
`Access-Control-Allow-Origin: https://app.example.com
Access-Control-Allow-Methods: GET, POST, PUT
Access-Control-Allow-Headers: content-type, x-requested-with
Access-Control-Max-Age: 600
Vary: Origin`
      );
    } else {
      setOrigin('https://app.example.com');
      setUrl('https://api.example.com/private');
      setMethod('GET');
      setWithCreds(true);
      setReqHeadersText('');
      setRespHeadersText(
`Access-Control-Allow-Origin: *
Access-Control-Allow-Credentials: true`
      );
    }
  }

  return (
    <div style={{ display:'grid', gap:16 }}>
      <h1 style={{ margin:0 }}>CORS Preflight Explainer</h1>
      <p style={{ margin:0, color:'#555' }}>
        Model how browsers decide CORS. Fill out your <b>request</b> and the server’s <b>response headers</b>; get pass/fail with reasons and fixes.
      </p>

      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
        <button onClick={()=>loadExample('simple-pass')} style={btn}>Load example: Simple GET (pass)</button>
        <button onClick={()=>loadExample('needs-preflight-pass')} style={btn}>Load example: PUT + headers (pass)</button>
        <button onClick={()=>loadExample('fail-creds')} style={btn}>Load example: Credentials with "*"(fail)</button>
      </div>

      <div style={{ display:'grid', gap:16, gridTemplateColumns:'repeat(auto-fit, minmax(320px, 1fr))' }}>
        {/* Request */}
        <div style={card}>
          <div style={{ fontWeight:700, marginBottom:8 }}>Request</div>
          <div style={row}>
            <div style={label}>Origin</div>
            <input value={origin} onChange={e=>setOrigin(e.target.value)} style={inputCss} />
          </div>
          <div style={row}>
            <div style={label}>URL (target)</div>
            <input value={url} onChange={e=>setUrl(e.target.value)} style={inputCss} />
          </div>
          <div style={row}>
            <div style={label}>Method</div>
            <select value={method} onChange={e=>setMethod(e.target.value)} style={{ ...inputCss, width:160 }}>
              {['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'].map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div style={row}>
            <div style={label}>Send credentials (cookies/auth)</div>
            <input type="checkbox" checked={withCreds} onChange={e=>setWithCreds(e.target.checked)} />
          </div>
          <div style={{ display:'grid', gap:6, marginTop:8 }}>
            <div style={{ fontSize:12, color:'#6b7280' }}>Request headers (one per line, e.g. <code style={mono}>Content-Type: application/json</code>)</div>
            <textarea value={reqHeadersText} onChange={e=>setReqHeadersText(e.target.value)} style={taCss} />
          </div>
        </div>

        {/* Response */}
        <div style={card}>
          <div style={{ fontWeight:700, marginBottom:8 }}>Server response headers</div>
          <textarea
            value={respHeadersText}
            onChange={e=>setRespHeadersText(e.target.value)}
            placeholder={`Access-Control-Allow-Origin: https://app.example.com
Access-Control-Allow-Methods: GET, POST, PUT
Access-Control-Allow-Headers: content-type, authorization
Access-Control-Allow-Credentials: true
Access-Control-Max-Age: 600
Vary: Origin`}
            style={{ ...taCss, height: 220 }}
          />
          <div style={{ fontSize:12, color:'#6b7280', marginTop:6 }}>
            Paste the headers your API returns (from your server logs or DevTools → Network → Response Headers).
          </div>
        </div>
      </div>

      {/* Results */}
      <div style={card}>
        <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
          <div><span style={badge(!result.preflightNeeded)}>Preflight {result.preflightNeeded ? 'required' : 'not required'}</span></div>
          <div><span style={badge(result.preflight.ok)}>Preflight {result.preflight.ok ? 'passes' : 'fails'}</span></div>
          <div><span style={badge(result.actual.ok)}>Actual response {result.actual.ok ? 'allowed' : 'blocked'}</span></div>
        </div>

        <div style={{ display:'grid', gap:10, marginTop:12 }}>
          {result.preflightNeeded && result.preflight.reasons.length > 0 && (
            <div>
              <div style={{ fontWeight:600, marginBottom:6 }}>Preflight issues</div>
              <ul style={{ margin:0, paddingLeft:18 }}>
                {result.preflight.reasons.map((r,i)=><li key={i} style={{ color:'#ef4444' }}>{r}</li>)}
              </ul>
            </div>
          )}
          {result.actual.reasons.length > 0 && (
            <div>
              <div style={{ fontWeight:600, marginBottom:6 }}>Actual response issues</div>
              <ul style={{ margin:0, paddingLeft:18 }}>
                {result.actual.reasons.map((r,i)=><li key={i} style={{ color:'#ef4444' }}>{r}</li>)}
              </ul>
            </div>
          )}
          {result.tips.length > 0 && (
            <div>
              <div style={{ fontWeight:600, marginBottom:6 }}>Fix suggestions</div>
              <ul style={{ margin:0, paddingLeft:18 }}>
                {[...new Set(result.tips)].map((t,i)=><li key={i} style={{ color:'#2563eb' }}>{t}</li>)}
              </ul>
            </div>
          )}

          <div style={{ fontSize:12, color:'#6b7280' }}>
            Notes: browsers block credentialed requests if <code style={mono}>ACAO</code> is <code style={mono}>"*"</code>.
            When echoing origins dynamically, also return <code style={mono}>Vary: Origin</code> to avoid cache leaks.
          </div>
        </div>
      </div>
    </div>
  );
}
