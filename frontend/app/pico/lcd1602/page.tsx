'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type LcdStatus = {
  ready: boolean;
  addr: string;
  cols: number;
  rows: number;
  backlight: boolean;
};

const ENV_DEFAULT = (process.env.NEXT_PUBLIC_PICO_BASE as string | undefined) || '';

export default function Lcd1602Page() {
  const [target, setTarget] = useState('');
  const [status, setStatus] = useState<LcdStatus | null>(null);
  const [addr, setAddr] = useState('0x27');
  const [cols, setCols] = useState(16);
  const [rows, setRows] = useState(2);
  const [line0, setLine0] = useState('Hello, LCD1602!');
  const [line1, setLine1] = useState('via Pico W API');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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

  async function refreshStatus() {
    const js = await call('/api/pico/lcd/status');
    if (js) setStatus(js);
  }

  async function doInit() {
    const js = await call(`/api/pico/lcd/init?addr=${encodeURIComponent(addr)}&cols=${cols}&rows=${rows}`);
    if (js) setStatus(js);
  }

  async function setLine(row: number, text: string, align: 'left'|'center'|'right' = 'left') {
    await call(`/api/pico/lcd/set?row=${row}&align=${align}&text=${encodeURIComponent(text)}`);
  }

  async function clear() {
    await call('/api/pico/lcd/clear');
  }

  async function backlight(state: 'on'|'off') {
    const js = await call(`/api/pico/lcd/backlight?state=${state}`);
    if (js) setStatus((s) => s ? { ...s, backlight: js.backlight } : s);
  }

  async function printAt(row: number, col: number, text: string) {
    await call(`/api/pico/lcd/print?row=${row}&col=${col}&text=${encodeURIComponent(text)}`);
  }

  async function scroll(dir: 'left'|'right', steps = 4) {
    await call(`/api/pico/lcd/scroll?dir=${dir}&steps=${steps}`);
  }

  return (
    <main style={{ maxWidth: 880, margin: '32px auto', padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <Link href="/pico" style={{ textDecoration: 'none', color: '#2563eb' }}>← Back</Link>
        <h1 style={{ fontSize: 28, fontWeight: 800 }}>LCD1602 (I²C) Controller</h1>
      </div>
      <p style={{ color: '#6b7280', marginBottom: 16 }}>
        Uses <code>/api/lcd/*</code> endpoints on the device via your <code>/api/pico/*</code> proxy.
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
          <label>Addr
            <input value={addr} onChange={(e) => setAddr(e.target.value)} style={inputSmall} />
          </label>
          <label>Cols
            <input type="number" min={8} max={40} value={cols} onChange={(e)=>setCols(parseInt(e.target.value||'16',10))} style={inputSmall} />
          </label>
          <label>Rows
            <input type="number" min={1} max={4} value={rows} onChange={(e)=>setRows(parseInt(e.target.value||'2',10))} style={inputSmall} />
          </label>

          <button onClick={doInit} disabled={busy} style={btnPrimary}>{busy ? 'Initializing…' : 'Init LCD'}</button>
          <button onClick={refreshStatus} disabled={busy} style={btn}>{busy ? '…' : 'Status'}</button>
        </div>

        {status && (
          <div style={{ color: '#374151', fontSize: 14 }}>
            ready: <b>{String(status.ready)}</b> · addr: <b>{status.addr}</b> · size: <b>{status.cols}×{status.rows}</b> · backlight: <b>{String(status.backlight)}</b>
          </div>
        )}
        {err && <div style={{ color: '#dc2626' }}>{err}</div>}
      </section>

      <section style={card}>
        <div style={{ display: 'grid', gap: 8 }}>
          <label>Line 1
            <input value={line0} onChange={(e)=>setLine0(e.target.value)} style={input} />
          </label>
          <label>Line 2
            <input value={line1} onChange={(e)=>setLine1(e.target.value)} style={input} />
          </label>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={()=>setLine(0, line0, 'left')}  style={btn}>Set L1</button>
          <button onClick={()=>setLine(1, line1, 'left')}  style={btn}>Set L2</button>
          <button onClick={()=>setLine(0, line0, 'center')} style={btn}>Center L1</button>
          <button onClick={()=>setLine(1, line1, 'center')} style={btn}>Center L2</button>
          <button onClick={()=>clear()} style={btn}>Clear</button>
          <button onClick={()=>backlight('on')} style={btn}>Backlight On</button>
          <button onClick={()=>backlight('off')} style={btn}>Backlight Off</button>
          <button onClick={()=>scroll('left', 4)} style={btn}>Scroll ⟵</button>
          <button onClick={()=>scroll('right',4)} style={btn}>Scroll ⟶</button>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <small style={{ color: '#6b7280' }}>Tip: use “Print at” for precise cursor writes.</small>
        </div>
      </section>

      <section style={card}>
        <PrintAt onSubmit={(row, col, text) => printAt(row, col, text)} />
      </section>
    </main>
  );
}

function PrintAt({ onSubmit }: { onSubmit: (row:number,col:number,text:string)=>void }) {
  const [row, setRow] = useState(0);
  const [col, setCol] = useState(0);
  const [text, setText] = useState('Hi!');
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ fontWeight: 700, color: '#111827' }}>Print at (row,col)</div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <label>Row<input type="number" min={0} value={row} onChange={(e)=>setRow(parseInt(e.target.value||'0',10))} style={inputSmall} /></label>
        <label>Col<input type="number" min={0} value={col} onChange={(e)=>setCol(parseInt(e.target.value||'0',10))} style={inputSmall} /></label>
        <label style={{ flex: 1 }}>Text<input value={text} onChange={(e)=>setText(e.target.value)} style={{ ...input, width: '100%' }} /></label>
        <button onClick={()=>onSubmit(row, col, text)} style={btnPrimary}>Print</button>
      </div>
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
const btn: React.CSSProperties = {
  borderRadius: 10, padding: '8px 12px', fontWeight: 600, border: '1px solid #e5e7eb', cursor: 'pointer',
  background: '#fff'
};
const btnPrimary: React.CSSProperties = { ...btn, background: '#111827', color: '#fff', borderColor: '#111827' };
const input: React.CSSProperties = { display: 'block', marginTop: 6, width: 360, padding: '6px 8px', borderRadius: 8, border: '1px solid #e5e7eb' };
const inputSmall: React.CSSProperties = { display: 'inline-block', marginLeft: 8, width: 90, padding: '6px 8px', borderRadius: 8, border: '1px solid #e5e7eb' };
