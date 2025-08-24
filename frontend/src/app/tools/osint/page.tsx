'use client';

import { useState } from 'react';

type ScanResult = {
  ok: boolean;
  error?: string;
  url?: string;
  hostname?: string;
  domain?: string;
  ips?: string[];
  http?: {
    status?: number;
    redirects?: (string | null)[];
    server?: string | null;
    content_type?: string | null;
    title?: string | null;
    error?: string;
  };
  robots?: { present: boolean; status: number | null; size: number | null; sitemaps: string[] };
  sitemap?: { present: boolean; status: number | null };
  timing_ms?: Record<string, number>;
};

export default function OSINTPage() {
  const [target, setTarget] = useState('example.com');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ScanResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setLoading(true); setErr(null); setData(null);
    try {
      const u = encodeURIComponent(target.trim());
      const res = await fetch(`http://127.0.0.1:8000/api/osint/scan?target=${u}`);
      const json: ScanResult = await res.json();
      if (!res.ok || !json.ok) {
        setErr(json.error || `HTTP ${res.status}`);
      } else {
        setData(json);
      }
    } catch (e: any) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 860 }}>
      <h1>OSINT – Quick URL Scan</h1>
      <p style={{ color: '#666' }}>
        Checks DNS/IPs, HTTP status & headers, page title, robots.txt and sitemap. (Server-side with SSRF guards.)
      </p>

      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <input
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder="https://example.com"
          style={{ flex: 1, padding: 10, border: '1px solid #ddd', borderRadius: 8, fontSize: 14 }}
        />
        <button onClick={run} disabled={loading} style={{ padding: '10px 14px', borderRadius: 8 }}>
          {loading ? 'Scanning…' : 'Scan'}
        </button>
      </div>

      {err && <p style={{ color: 'crimson', marginTop: 12 }}>{err}</p>}

      {data && (
        <div style={{ marginTop: 16, border: '1px solid #eee', borderRadius: 10, padding: 16, background: '#fff' }}>
          <h2 style={{ marginTop: 0 }}>{data.url}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <section>
              <h3>Host</h3>
              <ul>
                <li><b>Hostname:</b> {data.hostname}</li>
                <li><b>Domain:</b> {data.domain}</li>
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
                <li><b>Redirects:</b> {data.http?.redirects && data.http.redirects.length ? data.http.redirects.join(' → ') : '—'}</li>
                {data.http?.error && <li style={{ color: 'crimson' }}><b>Error:</b> {data.http.error}</li>}
              </ul>
            </section>

            <section>
              <h3>robots.txt</h3>
              <ul>
                <li><b>Present:</b> {data.robots?.present ? 'yes' : 'no'}</li>
                <li><b>Status:</b> {data.robots?.status ?? '—'}</li>
                <li><b>Size:</b> {data.robots?.size ?? '—'}</li>
                <li><b>Sitemaps:</b> {data.robots?.sitemaps && data.robots.sitemaps.length ? (
                  <ul>{data.robots.sitemaps.map((s, i) => <li key={i}>{s}</li>)}</ul>
                ) : '—'}</li>
              </ul>
            </section>

            <section>
              <h3>Sitemap</h3>
              <ul>
                <li><b>Present (quick check):</b> {data.sitemap?.present ? 'yes' : 'no'}</li>
                <li><b>Status:</b> {data.sitemap?.status ?? '—'}</li>
              </ul>
            </section>
          </div>

          {data.timing_ms && (
            <p style={{ color: '#666', marginTop: 8 }}>
              Timings: {Object.entries(data.timing_ms).map(([k, v]) => `${k} ${v}ms`).join(' · ')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
