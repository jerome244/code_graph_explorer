'use client';

import { useState, useCallback } from 'react';

type DNSRecords = {
  available?: boolean;
  A?: string[]; AAAA?: string[]; NS?: string[]; MX?: string[]; TXT?: string[];
};

type HttpInfo = {
  status?: number;
  redirects?: (string | null)[];
  server?: string | null;
  content_type?: string | null;
  title?: string | null;
  error?: string;
  body_preview?: string; // preview mode
  body_text?: string;    // full text mode
  body_html?: string;    // sanitized HTML mode (server-sanitized)
  truncated?: boolean;
};

type ScanResult = {
  ok: boolean;
  error?: string;
  url?: string;
  hostname?: string;
  domain?: string;
  ips?: string[];
  via_tor?: boolean;
  http?: HttpInfo;
  robots?: { present: boolean; status: number | null; size: number | null; sitemaps: string[] };
  sitemap?: { present: boolean; status: number | null };
  dns?: DNSRecords;
  timing_ms?: Record<string, number>;
};

type ContentMode = 'preview' | 'full' | 'html';

export default function OSINTPage() {
  const [target, setTarget] = useState('example.com');
  const [useTor, setUseTor] = useState(false);
  const [mode, setMode] = useState<ContentMode>('preview');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ScanResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true); setErr(null); setData(null);
    try {
      const raw = target.trim();

      // Detect onion and auto-enable Tor
      let hostname = '';
      try {
        const u = raw.includes('://') ? raw : `http://${raw}`;
        hostname = new URL(u).hostname || '';
      } catch {}
      const onion = /\.onion$/i.test(hostname);
      const willUseTor = useTor || onion;

      const qTarget = encodeURIComponent(raw);
      const res = await fetch(
        `http://127.0.0.1:8000/api/osint/scan?target=${qTarget}&use_tor=${willUseTor ? 1 : 0}&content=${mode}`
      );
      const json: ScanResult = await res.json();
      if (!res.ok || !json.ok) setErr(json.error || `HTTP ${res.status}`);
      else setData(json);
    } catch (e: any) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, [target, useTor, mode]);

  return (
    <div style={{ maxWidth: 900 }}>
      <h1>OSINT – URL/Onion scanner</h1>
      <p style={{ color: '#666' }}>
        Clearnet + optional Tor (.onion). Metadata and safe content (text or sanitized HTML).
      </p>

      <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') run(); }}
          placeholder="https://example.com or exampleonion.onion"
          style={{ flex: 1, minWidth: 300, padding: 10, border: '1px solid #ddd', borderRadius: 8, fontSize: 14 }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, userSelect: 'none' }}>
          <input type="checkbox" checked={useTor} onChange={(e) => setUseTor(e.target.checked)} />
          Use Tor (.onion)
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, userSelect: 'none' }}>
          Mode:
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as ContentMode)}
            style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #ddd' }}
          >
            <option value="preview">Preview (64KB)</option>
            <option value="full">Full text (512KB)</option>
            <option value="html">Sanitized HTML (512KB)</option>
          </select>
        </label>
        <button onClick={run} disabled={loading} style={{ padding: '10px 14px', borderRadius: 8 }}>
          {loading ? 'Scanning…' : 'Scan'}
        </button>
      </div>

      {err && <p style={{ color: 'crimson', marginTop: 12 }}>{err}</p>}

      {data && (
        <div style={{ marginTop: 16, border: '1px solid #eee', borderRadius: 10, padding: 16, background: '#fff' }}>
          <h2 style={{ marginTop: 0 }}>
            {data.url}{' '}
            {data.via_tor ? <small style={{ color: '#0a7', fontWeight: 600 }}>via Tor</small> : null}
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <section>
              <h3>Host</h3>
              <ul>
                <li><b>Hostname:</b> {data.hostname ?? '—'}</li>
                <li><b>Domain:</b> {data.domain ?? '—'}</li>
                <li><b>IPs:</b> {data.ips && data.ips.length ? data.ips.join(', ') : '—'}</li>
              </ul>
            </section>

            <section>
              <h3>HTTP</h3>
              <ul>
                <li><b>Status:</b> {data.http?.status ?? '—'}</li>
                <li><b>Title:</b> {data.http?.title ?? '—'}</li>
                <li><b>Server:</b> {data.http?.server ?? '—'}</li>
                <li><b>Content-Type:</b> {data.http?.content_type ?? '—'}</li>
                <li><b>Redirects:</b> {data.http?.redirects && data.http.redirects.length
                  ? data.http.redirects.filter(Boolean).join(' → ')
                  : '—'}</li>
                {data.http?.error && <li style={{ color: 'crimson' }}><b>Error:</b> {data.http.error}</li>}
              </ul>
            </section>

            <section>
              <h3>robots.txt</h3>
              <ul>
                <li><b>Present:</b> {data.robots?.present ? 'yes' : 'no'}</li>
                <li><b>Status:</b> {data.robots?.status ?? '—'}</li>
                <li><b>Size:</b> {data.robots?.size ?? '—'}</li>
                <li><b>Sitemaps:</b> {data.robots?.sitemaps?.length
                  ? <ul style={{ marginTop: 6 }}>{data.robots.sitemaps.map((s, i) => <li key={i}>{s}</li>)}</ul>
                  : '—'}</li>
              </ul>
            </section>

            <section>
              <h3>Sitemap</h3>
              <ul>
                <li><b>Present (quick check):</b> {data.sitemap?.present ? 'yes' : 'no'}</li>
                <li><b>Status:</b> {data.sitemap?.status ?? '—'}</li>
              </ul>
            </section>

            <section style={{ gridColumn: '1 / span 2' }}>
              <h3>DNS (clearnet)</h3>
              {data.dns?.available === false ? (
                <p style={{ color: '#666' }}>DNS module not available or skipped (for .onion via Tor).</p>
              ) : data.dns ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <KV label="A" value={listOrDash(data.dns.A)} />
                  <KV label="AAAA" value={listOrDash(data.dns.AAAA)} />
                  <KV label="NS" value={listOrDash(data.dns.NS)} />
                  <KV label="MX" value={listOrDash(data.dns.MX)} />
                  <KV label="TXT" value={listOrDash(data.dns.TXT)} />
                </div>
              ) : <p style={{ color: '#666' }}>No DNS info.</p>}
            </section>

            {/* Content area */}
            <section style={{ gridColumn: '1 / span 2' }}>
              {data.http?.body_html && (
                <>
                  <h3>HTML (sanitized){data.http.truncated ? <small> (truncated)</small> : null}</h3>
                  <div
                    style={{ border: '1px solid #eee', padding: 12, borderRadius: 8, background: '#fff', maxHeight: 500, overflow: 'auto' }}
                    // Backend already sanitized; still keep this sandboxed in UI context.
                    dangerouslySetInnerHTML={{ __html: data.http.body_html }}
                  />
                </>
              )}

              {!data.http?.body_html && (data.http?.body_text || data.http?.body_preview) && (
                <>
                  <h3>
                    {data.http.body_text ? 'Full text' : 'Content preview'}
                    {data.http.truncated ? <small> (truncated)</small> : null}
                  </h3>
                  <pre style={{
                    whiteSpace: 'pre-wrap',
                    background: '#f8f8f8',
                    border: '1px solid #eee',
                    borderRadius: 8,
                    padding: 12,
                    maxHeight: 500,
                    overflow: 'auto'
                  }}>
{data.http.body_text ?? data.http.body_preview}
                  </pre>
                </>
              )}
            </section>
          </div>

          {data.timing_ms && (
            <p style={{ color: '#666', marginTop: 12 }}>
              Timings: {Object.entries(data.timing_ms).map(([k, v]) => `${k} ${v}ms`).join(' · ')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontWeight: 600 }}>{label}</div>
      <div style={{ color: '#333' }}>{value}</div>
    </div>
  );
}
function listOrDash(v?: string[]) { return v && v.length ? v.join(', ') : '—'; }
