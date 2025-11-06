'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type BuzzerStatus = { state: 'on' | 'off'; alarm: boolean } | null;

const ENV_DEFAULT =
  (process.env.NEXT_PUBLIC_PICO_BASE as string | undefined) || '';

export default function BuzzerPage() {
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<BuzzerStatus>(null);
  const [ms, setMs] = useState(200);
  const [onMs, setOnMs] = useState(200);
  const [offMs, setOffMs] = useState(200);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const saved = typeof window !== 'undefined'
      ? window.localStorage.getItem('picoTarget') || ''
      : '';
    setTarget(saved || ENV_DEFAULT);
  }, []);

  function saveTarget(v: string) {
    setTarget(v);
    try { window.localStorage.setItem('picoTarget', v); } catch {}
  }

  function withTarget(path: string) {
    const t = (target || '').trim();
    if (!t) return null;
    const hasQ = path.includes('?');
    return `${path}${hasQ ? '&' : '?'}target=${encodeURIComponent(t)}`;
  }

  async function call(path: string) {
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const url = withTarget(path);
      if (!url) throw new Error("Set 'Target (http://ip)' first.");
      const r = await fetch(url, { method: 'GET', cache: 'no-store' });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
      setMsg(path);
      await refresh();
    } catch (e: any) {
      setErr(e?.message || 'Request failed');
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    setErr(null);
    try {
      const url = withTarget('/api/pico/buzzer/status');
      if (!url) return;
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) {
        setStatus(null);
        return;
      }
      const js = (await r.json()) as BuzzerStatus;
      setStatus(js);
    } catch {
      setStatus(null);
    }
  }

  useEffect(() => { if (target) refresh(); }, [target]);

  const label = !status ? '—' : status.alarm ? 'ALARM' : status.state.toUpperCase();

  return (
    <main style={{ maxWidth: 720, margin: '32px auto', padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <Link href="/pico" style={{ textDecoration: 'none', color: '#2563eb' }}>← Back</Link>
        <h1 style={{ fontSize: 28, fontWeight: 800 }}>Buzzer</h1>
      </div>
      <p style={{ color: '#6b7280', marginBottom: 16 }}>
        Uses the proxy at <code>/api/pico/*</code> with <code>?target=&lt;http://ip&gt;</code>.
      </p>

      {/* Target config */}
      <section style={card}>
        <label style={{ fontWeight: 600, color: '#111827' }}>
          Target (http://ip or http://hostname)
          <input
            placeholder="http://192.168.1.131"
            value={target}
            onChange={(e) => saveTarget(e.target.value)}
            style={input}
          />
        </label>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button onClick={refresh} disabled={busy} style={btnSecondary}>
            {busy ? 'Working…' : 'Refresh status'}
          </button>
          <span style={{ alignSelf: 'center', color: '#374151' }}>
            Status: <strong>{label}</strong>
          </span>
        </div>
      </section>

      {/* Controls */}
      <section style={card}>
        <div style={{ display: 'grid', gap: 8 }}>
          <label style={{ color: '#374151' }}>
            Quick beep (ms)
            <input
              type="number"
              min={10}
              max={5000}
              value={ms}
              onChange={(e) => setMs(parseInt(e.target.value || '0', 10))}
              style={input}
            />
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={() => call(`/api/pico/buzzer/beep?ms=${clamp(ms, 10, 5000)}`)}
              disabled={busy}
              style={btnPrimary}
            >
              {busy ? 'Working…' : `Beep ${ms}ms`}
            </button>
            <button
              onClick={() => call('/api/pico/buzzer?state=on')}
              disabled={busy}
              style={btnPrimaryOutline}
            >
              {busy ? 'Working…' : 'Buzzer ON'}
            </button>
            <button
              onClick={() => call('/api/pico/buzzer?state=off')}
              disabled={busy}
              style={btnDangerOutline}
            >
              {busy ? 'Working…' : 'Buzzer OFF'}
            </button>
          </div>
        </div>

        <hr style={{ border: 0, borderTop: '1px solid #e5e7eb', margin: '8px 0' }} />

        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ fontWeight: 700 }}>Alarm pattern</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <label style={{ color: '#374151' }}>
              on_ms
              <input
                type="number" min={10} max={5000}
                value={onMs}
                onChange={(e) => setOnMs(parseInt(e.target.value || '0', 10))}
                style={input}
              />
            </label>
            <label style={{ color: '#374151' }}>
              off_ms
              <input
                type="number" min={10} max={5000}
                value={offMs}
                onChange={(e) => setOffMs(parseInt(e.target.value || '0', 10))}
                style={input}
              />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={() =>
                call(`/api/pico/buzzer/alarm?cmd=start&on_ms=${clamp(onMs, 10, 5000)}&off_ms=${clamp(offMs, 10, 5000)}`)
              }
              disabled={busy}
              style={btnPrimary}
            >
              {busy ? 'Working…' : 'Start alarm'}
            </button>
            <button
              onClick={() => call('/api/pico/buzzer/alarm?cmd=stop')}
              disabled={busy}
              style={btnDanger}
            >
              {busy ? 'Working…' : 'Stop'}
            </button>
          </div>
        </div>

        <div style={{ minHeight: 20, fontSize: 14 }}>
          {msg && <span style={{ color: '#059669' }}>{msg}</span>}
          {err && <span style={{ color: '#dc2626' }}>{err}</span>}
        </div>
      </section>
    </main>
  );
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
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
const btnPrimaryOutline: React.CSSProperties = {
  ...btnBase, background: '#fff', color: '#111827',
};
const btnSecondary: React.CSSProperties = {
  ...btnBase, background: '#f9fafb', color: '#111827',
};
const btnDanger: React.CSSProperties = {
  ...btnBase, background: '#dc2626', color: '#fff', borderColor: '#dc2626',
};
const btnDangerOutline: React.CSSProperties = {
  ...btnBase, background: '#fff', color: '#dc2626', borderColor: '#fecaca',
};
const input: React.CSSProperties = {
  display: 'block', marginTop: 6, width: 220, padding: '6px 8px',
  borderRadius: 8, border: '1px solid #e5e7eb',
};
