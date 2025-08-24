'use client';

import React, { useMemo, useState } from 'react';

/** ---------- small utils ---------- */
const mono: React.CSSProperties = { fontFamily: 'ui-monospace, Menlo, monospace' };
const card: React.CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, background: '#fff' };
const row: React.CSSProperties  = { display: 'flex', gap: 8, alignItems: 'baseline' };
const label: React.CSSProperties= { width: 160, fontSize: 12, color: '#6b7280' };
const inputCss: React.CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 12px', width: '100%', font: 'inherit' };
const taCss: React.CSSProperties = { ...inputCss, height: 160, resize: 'vertical' as const };

function Bad({children}:{children:React.ReactNode}){return <span style={{color:'#ef4444'}}>{children}</span>}
function Warn({children}:{children:React.ReactNode}){return <span style={{color:'#f59e0b'}}>{children}</span>}
function Good({children}:{children:React.ReactNode}){return <span style={{color:'#16a34a'}}>{children}</span>}

/** ---------- base64url helpers ---------- */
function b64urlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(b64url.length + (4 - (b64url.length % 4 || 4)), '=');
  const bin = typeof atob !== 'undefined' ? atob(b64) : '';
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
function bytesToB64url(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  const b64 = typeof btoa !== 'undefined' ? btoa(s) : '';
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/,'');
}
function decodeJSON(b64url: string): any | null {
  try {
    const txt = new TextDecoder().decode(b64urlToBytes(b64url));
    return JSON.parse(txt);
  } catch { return null; }
}

/** ---------- crypto helpers (Web Crypto) ---------- */
async function importHmacSHA256(secret: string) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name:'HMAC', hash:'SHA-256' },
    false,
    ['verify']
  );
}
async function importRsaPkcs1Sha256Public(spkiPem: string) {
  // Accept PEM with -----BEGIN PUBLIC KEY----- or -----BEGIN RSA PUBLIC KEY-----
  const pem = spkiPem.replace(/-----(BEGIN|END)[^-]+-----/g,'').replace(/\s+/g,'');
  const der = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  return crypto.subtle.importKey(
    'spki',
    der,
    { name:'RSASSA-PKCS1-v1_5', hash:'SHA-256' },
    false,
    ['verify']
  );
}

/** ---------- page ---------- */
export default function JWTInspector() {
  const [token, setToken] = useState('');
  const [algoOverride, setAlgoOverride] = useState<'auto'|'HS256'|'RS256'>('auto');
  const [secret, setSecret] = useState('');      // for HS256
  const [pubKey, setPubKey] = useState('');     // for RS256 (PEM)
  const [verifyResult, setVerifyResult] = useState<null|{ok:boolean,msg:string}>(null);

  const parts = useMemo(() => token.trim().split('.'), [token]);
  const header = useMemo(() => parts.length>=2 ? decodeJSON(parts[0]) : null, [parts]);
  const payload= useMemo(() => parts.length>=2 ? decodeJSON(parts[1]) : null, [parts]);
  const sig     = useMemo(() => parts.length===3 ? parts[2] : null, [parts]);

  const algFromHeader: string | undefined = header?.alg;

  const nowSec = Math.floor(Date.now()/1000);
  const expOk = payload?.exp ? nowSec < Number(payload.exp) : undefined;
  const nbfOk = payload?.nbf ? nowSec >= Number(payload.nbf) : undefined;

  const usedAlg = algoOverride==='auto' ? (algFromHeader || 'unknown') : algoOverride;

  async function handleVerify() {
    try {
      if (!token || parts.length!==3) return setVerifyResult({ok:false, msg:'Token must have 3 parts (header.payload.signature).'});
      const signingInput = parts[0] + '.' + parts[1];
      const signature = b64urlToBytes(parts[2]);

      const alg = usedAlg;
      if (alg === 'HS256') {
        if (!secret) return setVerifyResult({ok:false, msg:'Enter an HMAC secret.'});
        const key = await importHmacSHA256(secret);
        const ok = await crypto.subtle.verify('HMAC', key, signature, new TextEncoder().encode(signingInput));
        return setVerifyResult({ok, msg: ok ? 'Signature VALID (HS256).' : 'Signature INVALID (HS256).'});
      }
      if (alg === 'RS256') {
        if (!pubKey) return setVerifyResult({ok:false, msg:'Paste an RSA public key (PEM).' });
        const key = await importRsaPkcs1Sha256Public(pubKey);
        const ok = await crypto.subtle.verify({name:'RSASSA-PKCS1-v1_5'}, key, signature, new TextEncoder().encode(signingInput));
        return setVerifyResult({ok, msg: ok ? 'Signature VALID (RS256).' : 'Signature INVALID (RS256).'});
      }
      return setVerifyResult({ok:false, msg:`Unsupported algorithm "${alg}". Choose HS256 or RS256.`});
    } catch (e:any) {
      setVerifyResult({ok:false, msg: e?.message || String(e)});
    }
  }

  const risks: React.ReactNode[] = [];
  if (!token) {
    // nothing
  } else if (parts.length !== 3) {
    risks.push(<Bad key="p">Not a 3-part JWT (expected header.payload.signature).</Bad>);
  } else {
    if (!header) risks.push(<Bad key="h">Header is not valid JSON.</Bad>);
    if (!payload) risks.push(<Bad key="pl">Payload is not valid JSON.</Bad>);
    if (header?.alg === 'none') risks.push(<Bad key="none">Header alg = "none" — **never** accept unsigned JWTs.</Bad>);
    if (header?.typ && header.typ !== 'JWT') risks.push(<Warn key="typ">Header typ is "{String(header.typ)}" (usually "JWT").</Warn>);
    if (typeof payload?.exp !== 'undefined') {
      risks.push(expOk ? <Good key="exp">exp is in the future.</Good> : <Bad key="exp">Token expired (exp ≤ now).</Bad>);
    } else {
      risks.push(<Warn key="exp-miss">No exp claim — tokens should expire.</Warn>);
    }
    if (typeof payload?.nbf !== 'undefined') {
      risks.push(nbfOk ? <Good key="nbf">nbf is satisfied.</Good> : <Warn key="nbf">nbf is in the future (not yet valid).</Warn>);
    }
    if (typeof payload?.iat === 'number') {
      const skew = Math.abs(nowSec - payload.iat);
      if (skew > 60*60*24*365) risks.push(<Warn key="iat">iat is very far from now — check issuer clock.</Warn>);
    }
  }

  return (
    <div style={{ display:'grid', gap:16 }}>
      <h1 style={{ margin:0 }}>JWT Inspector (parse, check, verify)</h1>
      <p style={{ margin:0, color:'#555' }}>
        Paste a JSON Web Token to see the header, payload, common risks, and optionally verify its signature (HS256/RS256) — all locally.
      </p>

      {/* Input */}
      <div style={card}>
        <div style={{ fontWeight:700, marginBottom:8 }}>Token</div>
        <textarea
          value={token}
          onChange={e=>setToken(e.target.value.trim())}
          placeholder="eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0IiwgImV4cCI6MTcwMDAwMDAwMH0.XYZ..."
          style={{ ...taCss, fontFamily: mono.fontFamily }}
        />
        <div style={{ fontSize:12, color:'#6b7280' }}>
          Tip: a JWT has three base64url sections separated by dots: <code style={mono}>header.payload.signature</code>.
        </div>
      </div>

      {/* Quick risks */}
      {token && (
        <div style={card}>
          <div style={{ fontWeight:700, marginBottom:8 }}>Quick checks</div>
          <ul style={{ margin:0, paddingLeft:18 }}>
            {risks.length ? risks.map((r,i)=><li key={i}>{r}</li>) : <li><Good>No obvious issues with structure.</Good></li>}
          </ul>
        </div>
      )}

      {/* Parsed */}
      {parts.length>=2 && (
        <div style={{ display:'grid', gap:16, gridTemplateColumns:'repeat(auto-fit, minmax(280px, 1fr))' }}>
          <div style={card}>
            <div style={{ fontWeight:700, marginBottom:8 }}>Header</div>
            <KV name="alg">{String(header?.alg ?? '—')}</KV>
            <KV name="typ">{String(header?.typ ?? '—')}</KV>
            <KV name="kid">{String(header?.kid ?? '—')}</KV>
            <pre style={{ ...mono, background:'#f8fafc', border:'1px solid #eef2f7', padding:8, borderRadius:8, overflow:'auto' }}>
{JSON.stringify(header ?? {}, null, 2)}
            </pre>
          </div>
          <div style={card}>
            <div style={{ fontWeight:700, marginBottom:8 }}>Payload</div>
            <KV name="sub">{String(payload?.sub ?? '—')}</KV>
            <KV name="iss">{String(payload?.iss ?? '—')}</KV>
            <KV name="aud">{String(payload?.aud ?? '—')}</KV>
            <KV name="exp">{payload?.exp ? `${payload.exp} (${new Date(payload.exp*1000).toLocaleString()})` : '—'}</KV>
            <KV name="nbf">{payload?.nbf ? `${payload.nbf} (${new Date(payload.nbf*1000).toLocaleString()})` : '—'}</KV>
            <KV name="iat">{payload?.iat ? `${payload.iat} (${new Date(payload.iat*1000).toLocaleString()})` : '—'}</KV>
            <pre style={{ ...mono, background:'#f8fafc', border:'1px solid #eef2f7', padding:8, borderRadius:8, overflow:'auto' }}>
{JSON.stringify(payload ?? {}, null, 2)}
            </pre>
          </div>
          <div style={card}>
            <div style={{ fontWeight:700, marginBottom:8 }}>Raw parts</div>
            <div style={row}><div style={label}>Header (b64url)</div><code style={mono}>{parts[0] || '—'}</code></div>
            <div style={row}><div style={label}>Payload (b64url)</div><code style={mono}>{parts[1] || '—'}</code></div>
            <div style={row}><div style={label}>Signature (b64url)</div><code style={mono}>{sig || '—'}</code></div>
          </div>
        </div>
      )}

      {/* Verify */}
      {token && (
        <div style={card}>
          <div style={{ fontWeight:700, marginBottom:8 }}>Verify signature (optional)</div>
          <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
            <label style={{ display:'flex', gap:8, alignItems:'center' }}>
              <span>Algorithm</span>
              <select value={algoOverride} onChange={e=>setAlgoOverride(e.target.value as any)} style={{ border:'1px solid #e5e7eb', borderRadius:8, padding:'6px 8px' }}>
                <option value="auto">Auto (from header)</option>
                <option value="HS256">HS256 (HMAC-SHA256)</option>
                <option value="RS256">RS256 (RSA-SHA256)</option>
              </select>
            </label>
            <span style={{ fontSize:12, color:'#6b7280' }}>
              Header says alg = <code style={mono}>{String(algFromHeader ?? 'unknown')}</code>
            </span>
          </div>

          { (algoOverride==='HS256' || (algoOverride==='auto' && algFromHeader==='HS256')) && (
            <div style={{ marginTop:10 }}>
              <div style={{ fontSize:12, color:'#6b7280', marginBottom:6 }}>HMAC secret</div>
              <input value={secret} onChange={e=>setSecret(e.target.value)} placeholder="your-shared-secret" style={inputCss}/>
            </div>
          )}
          { (algoOverride==='RS256' || (algoOverride==='auto' && algFromHeader==='RS256')) && (
            <div style={{ marginTop:10 }}>
              <div style={{ fontSize:12, color:'#6b7280', marginBottom:6 }}>RSA public key (PEM)</div>
              <textarea value={pubKey} onChange={e=>setPubKey(e.target.value)} placeholder={`-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A...
-----END PUBLIC KEY-----`} style={taCss}/>
            </div>
          )}

          <div style={{ display:'flex', gap:8, marginTop:10 }}>
            <button onClick={handleVerify} style={{ border:'1px solid #2563eb', background:'#eff6ff', color:'#1e40af', padding:'8px 12px', borderRadius:8, cursor:'pointer' }}>
              Verify
            </button>
          </div>

          {verifyResult && (
            <div style={{ marginTop:8 }}>
              {verifyResult.ok ? <Good>✔ {verifyResult.msg}</Good> : <Bad>✖ {verifyResult.msg}</Bad>}
            </div>
          )}

          <div style={{ fontSize:12, color:'#6b7280', marginTop:8 }}>
            Security tip: never trust <code style={mono}>alg</code> blindly — enforce expected algorithms server-side and always validate audience/issuer/expiry.
          </div>
        </div>
      )}
    </div>
  );
}

function KV({name, children}:{name:string; children?:React.ReactNode}) {
  return (
    <div style={row}>
      <div style={label}>{name}</div>
      <div style={{...mono, overflow:'hidden', textOverflow:'ellipsis'}}>{children ?? '—'}</div>
    </div>
  );
}
