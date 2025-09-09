'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type LedsStatus = {
  red:   { state: 'on' | 'off' | 'blinking' };
  green: { state: 'on' | 'off' | 'blinking' };
};

const ENV_DEFAULT = (process.env.NEXT_PUBLIC_PICO_BASE as string | undefined) || '';

export default function DualLedsPage() {
  const [target, setTarget] = useState('');
  const [status, setStatus] = useState<LedsStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [hz, setHz] = useState(2);

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('picoTarget') || '' : '';
    setTarget(saved || ENV_DEFAULT);
  }, []);

  function saveTarget(v: string) {
    setTarget(v);
    try { localStorage.setItem('picoTarget', v); } catch {}
  }

  function url(path: string) {
    const t = (target || '').trim();
    if (!t) throw new Error("Set 'Target (http://ip)' first.");
    const join = path.includes('?') ? '&' : '?';
    return `${path}${join}target=${encodeURIComponent(t)}`;
  }

  async function call(path: string) {
    setBusy(true); setErr(null);
    try {
      const r = await fetch(url(path), { cache: 'no-store' });
      const js = await r.json();
      if (!r.ok) throw new Error(js?.error || `HTTP ${r.status}`);
      return js;
    } catch (e: any) {
      setErr(e?.message || 'Request failed');
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    const js = await call('/api/pico/leds/status');
    if (js) setStatus(js);
  }

  async function setRed(state: 'on'|'off') {
    const js = await call(`/api/pico/leds/red?state=${state}`);
    if (js) setStatus(js);
  }
  async function setGreen(state: 'on'|'off') {
    const js = await call(`/api/pico/leds/green?state=${state}`);
    if (js) setStatus(js);
  }
  async function setBoth(red: 'on'|'off', green: 'on'|'off') {
    const js = await call(`/api/pico/leds/set?red=${red}&green=${green}`);
    if (js) setStatus(js);
  }
  async function blink(color: 'red'|'green'|'both') {
    const h = Math.min(20, Math.max(1, hz));
    const js = await call(`/api/pico/leds/blink?color=${color}&hz=${h}`);
    if (js) await refresh();
  }

  return (
    <main style={{ maxWidth: 900, margin: '32px auto', padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <Link href="/pico" style={{ textDecoration: 'none', color: '#2563eb' }}>← Back</Link>
        <h1 style={{ fontSize: 28, fontWeight: 800 }}>Dual LEDs (Red + Green)</h1>
      </div>
      <p style={{ color: '#6b7280', marginBottom: 16 }}>
        Control two external LEDs on GP10 (red) and GP11 (green). Use 330–1kΩ resistors, anodes to the pins, cathodes to GND.
      </p>

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
          <button onClick={refresh} disabled={busy} style={btn}>{busy ? '…' : 'Status'}</button>
          <div style={{ color: '#374151', fontSize: 14 }}>
            {status ? <>red: <b>{status.red.state}</b> · green: <b>{status.green.state}</b></> : '—'}
          </div>
        </div>

        {err && <div style={{ color: '#dc2626' }}>{err}</div>}
      </section>

      <section style={grid}>
        <div style={col}>
          <div style={ledHeader('red')}>🔴 Red LED</div>
          <div style={rowBtns}>
            <button onClick={()=>setRed('on')}  style={btn}>On</button>
            <button onClick={()=>setRed('off')} style={btn}>Off</button>
            <button onClick={()=>blink('red')} style={btn}>Blink</button>
          </div>
        </div>

        <div style={col}>
          <div style={ledHeader('green')}>🟢 Green LED</div>
          <div style={rowBtns}>
            <button onClick={()=>setGreen('on')}  style={btn}>On</button>
            <button onClick={()=>setGreen('off')} style={btn}>Off</button>
            <button onClick={()=>blink('green')} style={btn}>Blink</button>
          </div>
        </div>
      </section>

      <section style={card}>
        <div style={{ display:'flex', gap:12, alignItems:'center', flexWrap:'wrap' }}>
          <div>Both:</div>
          <button onClick={()=>setBoth('on','on')}   style={btn}>All On</button>
          <button onClick={()=>setBoth('off','off')} style={btn}>All Off</button>
          <button onClick={()=>blink('both')}        style={btn}>Blink Both</button>
          <label>Hz
            <input type="number" min={1} max={20} value={hz}
              onChange={(e)=>setHz(parseInt(e.target.value||'2',10))}
              style={inputSmall}
            />
          </label>
        </div>
      </section>
    </main>
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
const grid: React.CSSProperties = { display:'grid', gap:16, gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))' };
const col: React.CSSProperties = { ...card, marginBottom: 0 };
const rowBtns: React.CSSProperties = { display:'flex', gap:8, flexWrap:'wrap' };
const btn: React.CSSProperties = {
  borderRadius: 10, padding: '8px 12px', fontWeight: 600, border: '1px solid #e5e7eb', cursor: 'pointer',
  background: '#fff'
};
const input: React.CSSProperties = { display: 'block', marginTop: 6, width: 360, padding: '6px 8px', borderRadius: 8, border: '1px solid #e5e7eb' };
const inputSmall: React.CSSProperties = { display: 'inline-block', marginLeft: 8, width: 90, padding: '6px 8px', borderRadius: 8, border: '1px solid #e5e7eb' };

function ledHeader(color:'red'|'green'): React.CSSProperties {
  return { fontSize: 18, fontWeight: 800, color: color==='red' ? '#b91c1c' : '#065f46', marginBottom: 8 };
}
