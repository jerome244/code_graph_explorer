'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

type DhtReading = {
  valid: boolean;
  humidity?: number;
  temp_c?: number;
  temp_f?: number;
  heat_index_c?: number;
  heat_index_f?: number;
  err?: string;
} | null;

const ENV_DEFAULT = (process.env.NEXT_PUBLIC_PICO_BASE as string | undefined) || '';

export default function Dht11Page() {
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState<DhtReading>(null);
  const [err, setErr] = useState<string | null>(null);
  const [settleMs, setSettleMs] = useState(0);
  const [auto, setAuto] = useState(false);
  const [period, setPeriod] = useState(2000);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('picoTarget') || '' : '';
    setTarget(saved || ENV_DEFAULT);
  }, []);

  useEffect(() => {
    if (auto) {
      if (timer.current) clearInterval(timer.current);
      timer.current = setInterval(() => refresh(), Math.max(500, period));
      return () => { if (timer.current) clearInterval(timer.current); };
    } else {
      if (timer.current) { clearInterval(timer.current); timer.current = null; }
    }
  }, [auto, period, target, settleMs]);

  function saveTarget(v: string) {
    setTarget(v);
    try { localStorage.setItem('picoTarget', v); } catch {}
  }

  function withTarget(path: string) {
    const t = (target || '').trim();
    if (!t) return null;
    const hasQ = path.includes('?');
    return `${path}${hasQ ? '&' : '?'}target=${encodeURIComponent(t)}`;
  }

  async function refresh() {
    setBusy(true);
    setErr(null);
    try {
      const url = withTarget(`/api/pico/dht11/read?settle_ms=${Math.max(0, Math.min(1000, settleMs))}`);
      if (!url) throw new Error("Set 'Target (http://ip)' first.");
      const r = await fetch(url, { cache: 'no-store' });
      const js = await r.json();
      if (!r.ok) throw new Error(js?.error || `HTTP ${r.status}`);
      setReading(js);
    } catch (e: any) {
      setErr(e?.message || 'Request failed');
      setReading(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 720, margin: '32px auto', padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <Link href="/pico" style={{ textDecoration: 'none', color: '#2563eb' }}>← Back</Link>
        <h1 style={{ fontSize: 28, fontWeight: 800 }}>DHT11 — Temp & Humidity</h1>
      </div>
      <p style={{ color: '#6b7280', marginBottom: 16 }}>
        Reads from <code>/api/dht11/read</code> via your <code>/api/pico/*</code> proxy.
      </p>

      {/* Target config */}
      <section style={card}>
        <label style={{ fontWeight: 600, color: '#111827' }}>
          Target (http://ip or http://hostname)
          <input
            placeholder="http://192.168.x.x"
            value={target}
            onChange={(e) => saveTarget(e.target.value)}
            style={input}
          />
        </label>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
          <label style={{ color: '#374151' }}>
            settle_ms (0–1000)
            <input
              type="number" min={0} max={1000}
              value={settleMs}
              onChange={(e) => setSettleMs(parseInt(e.target.value || '0', 10))}
              style={inputSmall}
            />
          </label>

          <button onClick={refresh} disabled={busy} style={btnPrimary}>
            {busy ? 'Reading…' : 'Read now'}
          </button>

          <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#374151' }}>
            <input
              type="checkbox"
              checked={auto}
              onChange={(e) => setAuto(e.target.checked)}
            />
            Auto refresh
          </label>
          <input
            type="number" min={500} step={100}
            value={period}
            onChange={(e) => setPeriod(parseInt(e.target.value || '0', 10))}
            style={{ ...inputSmall, width: 120 }}
          />
          <span style={{ alignSelf: 'center', color: '#374151' }}>ms</span>
        </div>
      </section>

      {/* Reading */}
      <section style={card}>
        {err && <div style={{ color: '#dc2626', marginBottom: 8 }}>{err}</div>}
        {!reading && !err && <div style={{ color: '#6b7280' }}>No reading yet.</div>}
        {reading && (
          <div style={{ display: 'grid', gap: 8 }}>
            {!reading.valid ? (
              <div style={{ color: '#dc2626' }}>Sensor error{reading.err ? `: ${reading.err}` : ''}</div>
            ) : (
              <>
                <Row label="Humidity" value={`${reading.humidity?.toFixed(1)} %`} />
                <Row label="Temperature" value={`${reading.temp_c?.toFixed(1)} °C  (${reading.temp_f?.toFixed(1)} °F)`} />
                <Row label="Heat index" value={`${reading.heat_index_c?.toFixed(1)} °C  (${reading.heat_index_f?.toFixed(1)} °F)`} />
              </>
            )}
          </div>
        )}
      </section>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
      <div style={{ color: '#374151' }}>{label}</div>
      <div style={{ fontWeight: 700, color: '#111827' }}>{value}</div>
    </div>
  );
}

const card: React.CSSProperties = {
  display: 'grid',
  gap: 12,
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  padding: 16,
  background: '#fff',
  boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
  marginBottom: 16,
};
const btnBase: React.CSSProperties = {
  borderRadius: 10,
  padding: '8px 12px',
  fontWeight: 600,
  border: '1px solid #e5e7eb',
  cursor: 'pointer',
};
const btnPrimary: React.CSSProperties = {
  ...btnBase, background: '#111827', color: '#fff', borderColor: '#111827',
};
const input: React.CSSProperties = {
  display: 'block', marginTop: 6, width: 260, padding: '6px 8px',
  borderRadius: 8, border: '1px solid #e5e7eb',
};
const inputSmall: React.CSSProperties = {
  display: 'inline-block', marginLeft: 8, width: 100, padding: '6px 8px',
  borderRadius: 8, border: '1px solid #e5e7eb',
};
