'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';

/* ============================== Styling ============================== */
const card: React.CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, background: '#fff' };
const btn: React.CSSProperties = { border: '1px solid #e5e7eb', background: '#fff', padding: '8px 12px', borderRadius: 8, cursor: 'pointer' };
const inputCss: React.CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 10px', font: 'inherit' };
const mono: React.CSSProperties = { fontFamily: 'ui-monospace, Menlo, monospace' };
const label: React.CSSProperties = { fontSize: 12, color: '#6b7280' };

/* ============================== Types ============================== */

type DeviceType = 'light' | 'heater' | 'socket' | 'meter';
type Actuator = 'led' | 'relay' | 'mosfet';
type MeterSensor = 'none' | 'ina219' | 'acs712';

type Binding =
  | { kind: 'demo' }
  | { kind: 'pico'; pin: number };

type Room = {
  id: string;
  name: string;
  x: number; y: number; w: number; h: number;
  color?: string;
};

type Device = {
  id: string;
  name: string;
  type: DeviceType;
  roomId: string | null;
  x: number; y: number;
  watts?: number;
  state?: {
    on?: boolean;
    level?: number;
    setpoint?: number;
    temp?: number;
  };
  binding: Binding;
  // NEW: electronics hints
  actuator?: Actuator;      // for light/heater/socket control
  supplyV?: number;         // external supply for actuator (e.g., 5 or 12)
  sensor?: MeterSensor;     // for meter
};

type HouseModel = {
  rooms: Room[];
  devices: Device[];
};

/* ============================== Defaults ============================== */

const CANVAS_W = 900;
const CANVAS_H = 600;
const GRID = 50;

const DEVICE_ICON: Record<DeviceType, string> = {
  light: '💡',
  heater: '🔥',
  socket: '🔌',
  meter: '📟',
};

function makeId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

const DEFAULT_MODEL: HouseModel = {
  rooms: [
    { id: 'r1', name: 'Living', x: 50, y: 50, w: 380, h: 240, color: '#f8fafc' },
    { id: 'r2', name: 'Kitchen', x: 450, y: 50, w: 380, h: 240, color: '#fff7ed' },
    { id: 'r3', name: 'Bedroom', x: 50, y: 320, w: 380, h: 230, color: '#f0fdf4' },
    { id: 'r4', name: 'Office', x: 450, y: 320, w: 380, h: 230, color: '#eef2ff' },
  ],
  devices: [
    { id: 'd1', name: 'Ceiling Light', type: 'light', roomId: 'r1', x: 240, y: 170, watts: 12, actuator: 'relay', supplyV: 5, state: { on: false }, binding: { kind: 'demo' } },
    { id: 'd2', name: 'Heater', type: 'heater', roomId: 'r1', x: 120, y: 250, watts: 1000, actuator: 'relay', supplyV: 5, state: { on: false, setpoint: 20, temp: 18 }, binding: { kind: 'demo' } },
    { id: 'd3', name: 'Socket Strip', type: 'socket', roomId: 'r2', x: 640, y: 180, watts: 60, actuator: 'relay', supplyV: 5, state: { on: false }, binding: { kind: 'demo' } },
    { id: 'd4', name: 'Power Meter', type: 'meter', roomId: 'r2', x: 800, y: 70, watts: 0, sensor: 'none', state: {}, binding: { kind: 'demo' } },
  ],
};

/* ============================== Storage helpers ============================== */

const STORAGE_KEY = 'domotic-house-model-v1';

function loadModel(): HouseModel {
  if (typeof window === 'undefined') return DEFAULT_MODEL;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return DEFAULT_MODEL;
  try { return JSON.parse(raw); } catch { return DEFAULT_MODEL; }
}
function saveModel(m: HouseModel) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(m));
}

/* ============================== Pico / Serial Adapter ============================== */

type SerialAPI = {
  supported: boolean;
  connected: boolean;
  demoMode: boolean;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  setPin(pin: number, on: boolean): void;
};

function useSerial(): SerialAPI {
  const [supported, setSupported] = useState(false);
  const [connected, setConnected] = useState(false);
  const [demoMode, setDemoMode] = useState(true);

  const portRef = useRef<SerialPort | null>(null);
  const writerRef = useRef<WritableStreamDefaultWriter<string> | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<string> | null>(null);

  useEffect(() => {
    setSupported(typeof navigator !== 'undefined' && !!(navigator as any).serial);
  }, []);

  async function connect() {
    if (demoMode) { setConnected(true); return; }
    try {
      const port = await (navigator as any).serial.requestPort({});
      await port.open({ baudRate: 115200 });
      portRef.current = port;

      const textEncoder = new TextEncoderStream();
      textEncoder.readable.pipeTo(port.writable);
      writerRef.current = textEncoder.writable.getWriter();

      const textDecoder = new TextDecoderStream();
      port.readable.pipeTo(textDecoder.writable);
      readerRef.current = textDecoder.readable.getReader();

      setConnected(true);
    } catch (e) {
      console.error(e);
      alert('Failed to open serial port. Turn on Demo mode or connect your Pico.');
    }
  }

  async function disconnect() {
    if (demoMode) { setConnected(false); return; }
    try {
      readerRef.current?.releaseLock();
      writerRef.current?.releaseLock();
      await portRef.current?.close();
    } catch {}
    setConnected(false);
    portRef.current = null;
    readerRef.current = null;
    writerRef.current = null;
  }

  function send(obj: any) {
    if (demoMode) return;
    const w = writerRef.current;
    if (!w) return;
    w.write(JSON.stringify(obj) + '\n');
  }

  function setPin(pin: number, on: boolean) {
    send({ cmd: 'set', pin, value: on ? 1 : 0 });
  }

  // quick toggle via console if needed
  // @ts-ignore
  (globalThis as any).__domoSetDemo = (v: boolean) => setDemoMode(v);

  return { supported, connected, demoMode, connect, disconnect, setPin };
}

/* ============================== Sparkline ============================== */

function Sparkline({ data, width = 300, height = 60 }: { data: number[]; width?: number; height?: number }) {
  if (data.length < 2) return <div style={{ color: '#6b7280' }}>no data</div>;
  const min = 0;
  const max = Math.max(1, Math.max(...data));
  const pad = 4;
  const xs = (i: number) => pad + (i * (width - 2 * pad)) / (data.length - 1);
  const ys = (v: number) => pad + (height-2*pad) * (1 - (v-min)/(max-min));
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height}>
      <polyline fill="none" stroke="#2563eb" strokeWidth="2"
        points={data.map((v,i)=>`${xs(i)},${ys(v)}`).join(' ')} />
    </svg>
  );
}

/* ============================== Main Page ============================== */

export default function HouseDomoticPage() {
  const [tab, setTab] = useState<'dashboard' | 'designer' | 'wiring'>('dashboard');

  // Hydration-safe default, then load persisted
  const [model, setModel] = useState<HouseModel>(DEFAULT_MODEL);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => { setModel(loadModel()); setHydrated(true); }, []);
  useEffect(() => { saveModel(model); }, [model]);

  const serial = useSerial();

  // Power tracking
  const [wattHistory, setWattHistory] = useState<number[]>([]);
  const [pricePerKwh, setPricePerKwh] = useState(0.20);

  const totalWatts = useMemo(() => {
    return model.devices.reduce((sum, d) => {
      const on = !!d.state?.on;
      const heatOn = d.type === 'heater' && d.state?.on;
      const w = d.watts || 0;
      return sum + ((on || heatOn) ? w : 0);
    }, 0);
  }, [model.devices]);

  useEffect(() => {
    const id = setInterval(() => {
      setWattHistory((h) => [...h.slice(-119), totalWatts]);
      setModel((m) => ({
        ...m,
        devices: m.devices.map((d) => {
          if (d.type !== 'heater') return d;
          const cur = d.state?.temp ?? 18;
          const on = d.state?.on ?? false;
          const nextTemp = cur + (on ? 0.05 : -0.02);
          const clamped = Math.max(5, Math.min(30, nextTemp));
          return { ...d, state: { ...d.state, temp: clamped } };
        })
      }));
    }, 1000);
    return () => clearInterval(id);
  }, [totalWatts]);

  // Scenes
  function applyScene(name: 'all-off' | 'evening' | 'away') {
    setModel((m) => ({
      ...m,
      devices: m.devices.map((d) => {
        if (name === 'all-off') {
          if (d.type === 'heater') return { ...d, state: { ...d.state, on: false } };
          if (d.type === 'light' || d.type === 'socket') return { ...d, state: { ...d.state, on: false } };
          return d;
        }
        if (name === 'evening') {
          if (d.type === 'light' && d.roomId === 'r1') return { ...d, state: { ...d.state, on: true } };
          if (d.type === 'heater') return { ...d, state: { ...d.state, on: true, setpoint: 21 } };
          return d;
        }
        if (name === 'away') {
          if (d.type === 'heater') return { ...d, state: { ...d.state, on: false, setpoint: 16 } };
          if (d.type === 'light' || d.type === 'socket') return { ...d, state: { ...d.state, on: false } };
          return d;
        }
        return d;
      })
    }));
  }

  // Device control
  function toggleDevice(d: Device) {
    setModel((m) => ({
      ...m,
      devices: m.devices.map((x) => (x.id === d.id ? ({ ...x, state: { ...x.state, on: !x.state?.on } }) : x))
    }));
    if (d.binding.kind === 'pico') {
      serial.setPin(d.binding.pin, !(d.state?.on));
    }
  }
  function setHeaterSetpoint(d: Device, sp: number) {
    setModel((m) => ({
      ...m,
      devices: m.devices.map((x) => (x.id === d.id ? ({ ...x, state: { ...x.state, setpoint: sp } }) : x))
    }));
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <h1 style={{ margin: 0 }}>Smart Home — Plan, Control & Wiring</h1>
      <p style={{ margin: 0, color: '#555' }}>Build your house plan, bind devices to a Raspberry Pi Pico (or simulate), control them, and get an automatic wiring diagram.</p>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button style={{ ...btn, background: tab === 'dashboard' ? '#eef2ff' : '#fff' }} onClick={() => setTab('dashboard')}>Dashboard</button>
        <button style={{ ...btn, background: tab === 'designer' ? '#eef2ff' : '#fff' }} onClick={() => setTab('designer')}>Designer</button>
        <button style={{ ...btn, background: tab === 'wiring' ? '#eef2ff' : '#fff' }} onClick={() => setTab('wiring')}>Wiring</button>
      </div>

      {tab === 'dashboard' ? (
        <>
          {/* Top controls */}
          <div style={card}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              {!serial.connected
                ? <button style={btn} onClick={serial.connect}>{serial.demoMode ? 'Start Demo' : 'Connect Pico (USB)'}</button>
                : <button style={btn} onClick={serial.disconnect}>Disconnect</button>}
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="checkbox"
                  checked={(serial as any).demoMode}
                  onChange={(e) => {
                    if (serial.connected) serial.disconnect();
                    // @ts-ignore
                    (globalThis as any).__domoSetDemo?.(e.target.checked);
                  }}
                />
                Demo mode
              </label>

              <div style={{ marginLeft: 8 }}>
                <span style={{ ...label }}>Price/kWh</span><br />
                <input type="number" step="0.01" value={pricePerKwh}
                  onChange={(e) => setPricePerKwh(parseFloat(e.target.value || '0'))}
                  style={{ ...inputCss, width: 120 }} />
              </div>

              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                <button style={btn} onClick={() => applyScene('all-off')}>All off</button>
                <button style={btn} onClick={() => applyScene('evening')}>Evening</button>
                <button style={btn} onClick={() => applyScene('away')}>Away</button>
              </div>
            </div>
          </div>

          {/* Summary */}
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '2fr 1fr' }}>
            <div style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 18 }}>Live consumption</div>
                  <div style={{ ...mono, fontSize: 24 }} suppressHydrationWarning>
                    {(hydrated ? totalWatts : 0)} W
                  </div>
                  <div style={{ ...label }} suppressHydrationWarning>
                    ≈ {((hydrated ? totalWatts : 0) / 1000 * pricePerKwh).toFixed(3)} €/hour
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 8 }}>
                <Sparkline data={wattHistory} />
              </div>
            </div>

            <div style={card}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Rooms</div>
              <div style={{ display: 'grid', gap: 6 }}>
                {model.rooms.map((r) => {
                  const watts = model.devices
                    .filter((d) => d.roomId === r.id)
                    .reduce((sum, d) => sum + ((d.state?.on && d.watts) ? d.watts! : 0), 0);
                  return (
                    <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', border: '1px solid #e5e7eb', borderRadius: 8, padding: 8 }}>
                      <div>{r.name}</div>
                      <div style={mono} suppressHydrationWarning>{hydrated ? watts : 0} W</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Plan + Per-room control */}
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '2fr 1fr' }}>
            <PlanCanvas model={model} onClickDevice={(d) => toggleDevice(d)} onClickEmpty={() => {}} />
            <div style={{ display: 'grid', gap: 12 }}>
              {model.rooms.map((r) => (
                <div key={r.id} style={card}>
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>{r.name}</div>
                  {model.devices.filter((d) => d.roomId === r.id).length === 0 ? (
                    <div style={{ color: '#6b7280' }}>No devices in this room</div>
                  ) : (
                    <div style={{ display: 'grid', gap: 8 }}>
                      {model.devices.filter((d) => d.roomId === r.id).map((d) => (
                        <div key={d.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center' }}>
                          <div>
                            <div><b>{DEVICE_ICON[d.type]}</b> {d.name}</div>
                            <div style={label}>{d.type} · {d.watts || 0} W</div>
                          </div>
                          <div>
                            {d.type === 'heater' ? (
                              <div style={{ display: 'grid', gap: 6 }}>
                                <button style={btn} onClick={() => toggleDevice(d)}>{d.state?.on ? 'Stop' : 'Start'}</button>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <input type="range" min={10} max={26} value={d.state?.setpoint ?? 20}
                                    onChange={(e) => setHeaterSetpoint(d, parseInt(e.target.value))} />
                                  <div style={mono}>{d.state?.setpoint ?? 20}°C</div>
                                </div>
                                <div style={label}>Current ~ {d.state?.temp?.toFixed(1) ?? '-'}°C</div>
                              </div>
                            ) : (
                              <button style={btn} onClick={() => toggleDevice(d)}>{d.state?.on ? 'Turn off' : 'Turn on'}</button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      ) : tab === 'designer' ? (
        <Designer model={model} setModel={setModel} />
      ) : (
        <Wiring model={model} />
      )}
    </div>
  );
}

/* ============================== Plan Canvas (shared) ============================== */

function PlanCanvas({
  model,
  onClickDevice,
  onClickEmpty,
  onDragRoom,
  onDragDevice,
  onSelectRoom,
  selectedId,
}: {
  model: HouseModel;
  onClickDevice?: (d: Device) => void;
  onClickEmpty?: () => void;
  onDragRoom?: (id: string, x: number, y: number) => void;
  onDragDevice?: (id: string, x: number, y: number) => void;
  onSelectRoom?: (id: string) => void;
  selectedId?: string | null;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{ kind: 'room' | 'device' | null; id: string | null; dx: number; dy: number; }>({ kind: null, id: null, dx: 0, dy: 0 });

  function pt(evt: React.PointerEvent) {
    const svg = svgRef.current!;
    const rect = svg.getBoundingClientRect();
    return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
  }

  function downRoom(e: React.PointerEvent, r: Room) {
    e.stopPropagation();
    const p = pt(e);
    dragRef.current = { kind: 'room', id: r.id, dx: p.x - r.x, dy: p.y - r.y };
    onSelectRoom?.(r.id);
    (e.target as Element).setPointerCapture(e.pointerId);
  }
  function downDevice(e: React.PointerEvent, d: Device) {
    e.stopPropagation();
    const p = pt(e);
    dragRef.current = { kind: 'device', id: d.id, dx: p.x - d.x, dy: p.y - d.y };
    (e.target as Element).setPointerCapture(e.pointerId);
  }
  function move(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag.kind || !drag.id) return;
    const p = pt(e);
    const nx = Math.max(10, Math.min(CANVAS_W - 10, p.x - drag.dx));
    const ny = Math.max(10, Math.min(CANVAS_H - 10, p.y - drag.dy));
    if (drag.kind === 'room' && onDragRoom) onDragRoom(drag.id, nx, ny);
    if (drag.kind === 'device' && onDragDevice) onDragDevice(drag.id, nx, ny);
  }
  function up() { dragRef.current = { kind: null, id: null, dx: 0, dy: 0 }; }
  function clickSvg() { onClickEmpty?.(); }

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
      width="100%"
      height={CANVAS_H}
      style={{ border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff' }}
      onPointerMove={move}
      onPointerUp={up}
      onClick={clickSvg}
    >
      {/* grid */}
      <g opacity={0.2}>
        {Array.from({ length: Math.floor(CANVAS_W / GRID) + 1 }).map((_, i) => (
          <line key={`v${i}`} x1={i * GRID} y1={0} x2={i * GRID} y2={CANVAS_H} stroke="#e5e7eb" />
        ))}
        {Array.from({ length: Math.floor(CANVAS_H / GRID) + 1 }).map((_, i) => (
          <line key={`h${i}`} x1={0} y1={i * GRID} x2={CANVAS_W} y2={i * GRID} stroke="#e5e7eb" />
        ))}
      </g>

      {/* rooms */}
      {model.rooms.map((r) => (
        <g key={r.id}>
          <rect
            x={r.x} y={r.y} width={r.w} height={r.h}
            fill={r.color || '#f8fafc'}
            stroke={selectedId === r.id ? '#2563eb' : '#cbd5e1'}
            strokeWidth={selectedId === r.id ? 3 : 1}
            onPointerDown={(e) => downRoom(e, r)}
            onClick={(e) => { e.stopPropagation(); onSelectRoom?.(r.id); }}
          />
          <text x={r.x + 8} y={r.y + 20} fontSize={12} fill="#334155">{r.name}</text>
        </g>
      ))}

      {/* devices */}
      {model.devices.map((d) => (
        <g
          key={d.id}
          transform={`translate(${d.x},${d.y})`}
          onPointerDown={(e) => downDevice(e, d)}
          onClick={(e) => { e.stopPropagation(); onClickDevice?.(d); }}
          style={{ cursor: 'grab' }}
        >
          <circle r={16} fill={selectedId === d.id ? '#dbeafe' : '#f1f5f9'} stroke="#94a3b8" />
          <text textAnchor="middle" dominantBaseline="central" fontSize={16}>{DEVICE_ICON[d.type]}</text>
          <text y={28} textAnchor="middle" fontSize={10} fill="#334155">{d.name}</text>
        </g>
      ))}
    </svg>
  );
}

/* ============================== Designer ============================== */

function Designer({ model, setModel }: { model: HouseModel; setModel: (m: HouseModel) => void }) {
  const [selected, setSelected] = useState<{ kind: 'room' | 'device'; id: string } | null>(null);

  function addRoom() {
    const id = makeId('r');
    setModel({
      ...model,
      rooms: [...model.rooms, { id, name: `Room ${model.rooms.length + 1}`, x: 80, y: 80, w: 260, h: 180, color: '#f8fafc' }]
    });
    setSelected({ kind: 'room', id });
  }
  function addDevice(type: DeviceType) {
    const id = makeId('d');
    const name = type === 'light' ? 'Light' : type === 'heater' ? 'Heater' : type === 'socket' ? 'Socket' : 'Meter';
    const watts = type === 'light' ? 10 : type === 'heater' ? 1000 : type === 'socket' ? 60 : 0;
    setModel({
      ...model,
      devices: [...model.devices, {
        id, name, type, roomId: null, x: 120, y: 120, watts,
        state: { on: false, setpoint: type === 'heater' ? 20 : undefined, temp: type === 'heater' ? 18 : undefined },
        binding: { kind: 'demo' },
        actuator: type === 'meter' ? undefined : (type === 'light' ? 'relay' : 'relay'),
        supplyV: type === 'meter' ? undefined : 5,
        sensor: type === 'meter' ? 'none' : undefined,
      }]
    });
    setSelected({ kind: 'device', id });
  }

  function assignRoomsByContainment(m: HouseModel): HouseModel {
    const devices = m.devices.map((d) => {
      const r = m.rooms.find((r) => d.x >= r.x && d.x <= r.x + r.w && d.y >= r.y && d.y <= r.y + r.h);
      return { ...d, roomId: r ? r.id : null };
    });
    return { ...m, devices };
  }

  function onDragRoom(id: string, x: number, y: number) {
    const m = { ...model, rooms: model.rooms.map((r) => (r.id === id ? { ...r, x, y } : r)) };
    setModel(assignRoomsByContainment(m));
    setSelected({ kind: 'room', id });
  }
  function onDragDevice(id: string, x: number, y: number) {
    const m = { ...model, devices: model.devices.map((d) => (d.id === id ? { ...d, x, y } : d)) };
    setModel(assignRoomsByContainment(m));
    setSelected({ kind: 'device', id });
  }

  const selRoom = selected?.kind === 'room' ? model.rooms.find((r) => r.id === selected.id) : null;
  const selDev = selected?.kind === 'device' ? model.devices.find((d) => d.id === selected.id) : null;

  function updateRoom(patch: Partial<Room>) {
    if (!selRoom) return;
    setModel({ ...model, rooms: model.rooms.map((r) => (r.id === selRoom.id ? { ...r, ...patch } : r)) });
  }
  function updateDevice(patch: Partial<Device>) {
    if (!selDev) return;
    setModel({ ...model, devices: model.devices.map((d) => (d.id === selDev.id ? { ...d, ...patch } : d)) });
  }

  function removeSelected() {
    if (!selected) return;
    if (selected.kind === 'room') {
      setModel({
        ...model,
        rooms: model.rooms.filter((r) => r.id !== selected.id),
        devices: model.devices.map((d) => (d.roomId === selected.id ? { ...d, roomId: null } : d)),
      });
    } else {
      setModel({ ...model, devices: model.devices.filter((d) => d.id !== selected.id) });
    }
    setSelected(null);
  }

  // export/import
  const [exportOpen, setExportOpen] = useState(false);
  const [importJson, setImportJson] = useState('');

  return (
    <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '2fr 1fr' }}>
      <div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <button style={btn} onClick={addRoom}>+ Room</button>
          <button style={btn} onClick={() => addDevice('light')}>+ Light</button>
          <button style={btn} onClick={() => addDevice('heater')}>+ Heater</button>
          <button style={btn} onClick={() => addDevice('socket')}>+ Socket</button>
          <button style={btn} onClick={() => addDevice('meter')}>+ Meter</button>
          <button style={{ ...btn, marginLeft: 'auto' }} onClick={() => setExportOpen(true)}>Export JSON</button>
        </div>

        <PlanCanvas
          model={model}
          onClickDevice={(d) => setSelected({ kind: 'device', id: d.id })}
          onClickEmpty={() => setSelected(null)}
          onDragRoom={onDragRoom}
          onDragDevice={onDragDevice}
          onSelectRoom={(id) => setSelected({ kind: 'room', id })}
          selectedId={selected?.id}
        />
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        <div style={card}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Selection</div>
          {!selected ? (
            <div style={{ color: '#6b7280' }}>Click a room or device to edit its properties.</div>
          ) : selected.kind === 'room' && selRoom ? (
            <div style={{ display: 'grid', gap: 8 }}>
              <div>
                <div style={label}>Name</div>
                <input value={selRoom.name} onChange={(e) => updateRoom({ name: e.target.value })} style={{ ...inputCss, width: '100%' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div><div style={label}>X</div><input type="number" value={selRoom.x} onChange={(e) => updateRoom({ x: parseInt(e.target.value || '0') })} style={inputCss} /></div>
                <div><div style={label}>Y</div><input type="number" value={selRoom.y} onChange={(e) => updateRoom({ y: parseInt(e.target.value || '0') })} style={inputCss} /></div>
                <div><div style={label}>Width</div><input type="number" value={selRoom.w} onChange={(e) => updateRoom({ w: parseInt(e.target.value || '0') })} style={inputCss} /></div>
                <div><div style={label}>Height</div><input type="number" value={selRoom.h} onChange={(e) => updateRoom({ h: parseInt(e.target.value || '0') })} style={inputCss} /></div>
              </div>
              <div><div style={label}>Color</div><input type="color" value={selRoom.color || '#f8fafc'} onChange={(e) => updateRoom({ color: e.target.value })} /></div>
              <div><button style={{ ...btn, borderColor: '#ef4444', color: '#ef4444' }} onClick={removeSelected}>Delete room</button></div>
            </div>
          ) : selDev ? (
            <div style={{ display: 'grid', gap: 8 }}>
              <div>
                <div style={label}>Name</div>
                <input value={selDev.name} onChange={(e) => updateDevice({ name: e.target.value })} style={{ ...inputCss, width: '100%' }} />
              </div>

              {/* Binding */}
              <div style={{ display: 'grid', gap: 8 }}>
                <div style={label}>Binding</div>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="radio" name="binding"
                    checked={selDev.binding.kind === 'demo'}
                    onChange={() => updateDevice({ binding: { kind: 'demo' } })}
                  /> Demo (simulate)
                </label>
                <label style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 8, alignItems: 'center' }}>
                  <span>
                    <input
                      type="radio" name="binding"
                      checked={selDev.binding.kind === 'pico'}
                      onChange={() => updateDevice({ binding: { kind: 'pico', pin: 2 } })}
                    />&nbsp;Pico GPIO
                  </span>
                  <input
                    type="number" placeholder="GPIO pin"
                    value={selDev.binding.kind === 'pico' ? selDev.binding.pin : 2}
                    onChange={(e) => updateDevice({ binding: { kind: 'pico', pin: parseInt(e.target.value || '0') } })}
                    style={{ ...inputCss, width: '100%' }}
                  />
                </label>
              </div>

              {/* Electronics */}
              {selDev.type !== 'meter' ? (
                <div style={{ borderTop: '1px dashed #e5e7eb', paddingTop: 8 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Electronics (actuator)</div>
                  <div style={{ display: 'grid', gap: 6 }}>
                    <label style={{ display: 'inline-flex', gap: 8 }}>
                      <input
                        type="radio" name={`act-${selDev.id}`}
                        checked={(selDev.actuator ?? 'relay') === 'led'}
                        onChange={() => updateDevice({ actuator: 'led', supplyV: 3.3 })}
                      /> LED (3.3V, with 330Ω)
                    </label>
                    <label style={{ display: 'inline-flex', gap: 8 }}>
                      <input
                        type="radio" name={`act-${selDev.id}`}
                        checked={(selDev.actuator ?? 'relay') === 'relay'}
                        onChange={() => updateDevice({ actuator: 'relay', supplyV: 5 })}
                      /> Relay module (3.3–5V input)
                    </label>
                    <label style={{ display: 'inline-flex', gap: 8 }}>
                      <input
                        type="radio" name={`act-${selDev.id}`}
                        checked={(selDev.actuator ?? 'relay') === 'mosfet'}
                        onChange={() => updateDevice({ actuator: 'mosfet', supplyV: 12 })}
                      /> MOSFET driver (DC load)
                    </label>
                    <div>
                      <div style={label}>External supply (V)</div>
                      <input type="number" value={selDev.supplyV ?? (selDev.actuator === 'led' ? 3.3 : selDev.actuator === 'mosfet' ? 12 : 5)}
                        onChange={(e) => updateDevice({ supplyV: parseFloat(e.target.value || '0') })}
                        style={{ ...inputCss, width: 120 }} />
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ borderTop: '1px dashed #e5e7eb', paddingTop: 8 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Meter Sensor</div>
                  <select
                    value={selDev.sensor ?? 'none'}
                    onChange={(e) => updateDevice({ sensor: e.target.value as MeterSensor })}
                    style={inputCss}
                  >
                    <option value="none">none</option>
                    <option value="ina219">INA219 (I2C)</option>
                    <option value="acs712">ACS712 (analog)</option>
                  </select>
                </div>
              )}

              {/* Power & misc */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <div style={label}>Nominal power (W)</div>
                  <input type="number" value={selDev.watts || 0} onChange={(e) => updateDevice({ watts: parseInt(e.target.value || '0') })} style={inputCss} />
                </div>
                <div>
                  <div style={label}>Room</div>
                  <select
                    value={selDev.roomId || ''}
                    onChange={(e) => updateDevice({ roomId: e.target.value || null })}
                    style={inputCss}
                  >
                    <option value="">— none —</option>
                    {model.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
              </div>

              <div><button style={{ ...btn, borderColor: '#ef4444', color: '#ef4444' }} onClick={removeSelected}>Delete device</button></div>
            </div>
          ) : null}
        </div>

        {/* Import / Export */}
        {exportOpen && (
          <div style={card}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Export / Import</div>
            <textarea readOnly value={JSON.stringify(model, null, 2)} style={{ width: '100%', height: 200, ...mono }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button style={btn} onClick={() => navigator.clipboard.writeText(JSON.stringify(model)).catch(()=>{})}>Copy JSON</button>
              <button style={btn} onClick={() => setExportOpen(false)}>Close</button>
            </div>
            <div style={{ borderTop: '1px dashed #e5e7eb', marginTop: 8, paddingTop: 8 }}>
              <div style={label}>Paste JSON below to import (replaces current model)</div>
              <textarea value={importJson} onChange={(e) => setImportJson(e.target.value)} style={{ width: '100%', height: 140, ...mono }} />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button
                  style={{ ...btn, borderColor: '#16a34a', color: '#16a34a' }}
                  onClick={() => {
                    try {
                      const next = JSON.parse(importJson);
                      setModel(next);
                      setImportJson('');
                      alert('Imported.');
                    } catch { alert('Invalid JSON'); }
                  }}
                >Import</button>
                <button style={btn} onClick={() => setImportJson('')}>Clear</button>
              </div>
            </div>
          </div>
        )}

        <div style={{ fontSize: 12, color: '#6b7280' }}>
          Tip: drag rooms/devices on the plan. Devices inside a room automatically inherit the room.
        </div>
      </div>
    </div>
  );
}

/* ============================== Wiring Tab ============================== */

type WireSpec =
  | { kind: 'led', device: Device, gpio: number }
  | { kind: 'relay', device: Device, gpio: number, supplyV: number }
  | { kind: 'mosfet', device: Device, gpio: number, supplyV: number }
  | { kind: 'ina219', device: Device }
  | { kind: 'acs712', device: Device };

function Wiring({ model }: { model: HouseModel }) {
  // Build wiring specs from devices
  const specs: WireSpec[] = useMemo(() => {
    const list: WireSpec[] = [];
    for (const d of model.devices) {
      if (d.type === 'meter') {
        if (d.sensor === 'ina219') list.push({ kind: 'ina219', device: d });
        if (d.sensor === 'acs712') list.push({ kind: 'acs712', device: d });
        continue;
      }
      if (d.binding.kind === 'pico') {
        const gpio = d.binding.pin;
        const act = d.actuator ?? 'relay';
        const supply = d.supplyV ?? (act === 'led' ? 3.3 : act === 'mosfet' ? 12 : 5);
        if (act === 'led') list.push({ kind: 'led', device: d, gpio });
        else if (act === 'relay') list.push({ kind: 'relay', device: d, gpio, supplyV: supply });
        else list.push({ kind: 'mosfet', device: d, gpio, supplyV: supply });
      }
    }
    return list;
  }, [model.devices]);

  const bom = useMemo(() => {
    const b: Record<string, number> = {};
    const add = (name: string, n = 1) => { b[name] = (b[name] || 0) + n; };
    specs.forEach(s => {
      if (s.kind === 'led') { add('LED (any color)'); add('Resistor 330Ω'); add('Jumper wires'); }
      if (s.kind === 'relay') { add(`${s.supplyV}V Relay module (low-level trigger OK)`); add('Jumper wires'); }
      if (s.kind === 'mosfet') { add('N-MOSFET module (logic-level, with diode)'); add('Jumper wires'); }
      if (s.kind === 'ina219') { add('INA219 current sensor (I2C)'); add('Jumper wires'); }
      if (s.kind === 'acs712') { add('ACS712 current sensor'); add('Jumper wires'); }
    });
    // Always needed
    add('Raspberry Pi Pico');
    add('Breadboard', 1);
    return Object.entries(b).map(([name, qty]) => ({ name, qty }));
  }, [specs]);

  return (
    <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '2fr 1fr' }}>
      <div style={card}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Wiring Diagram (auto)</div>
        <DiagramSVG specs={specs} />
        <SafetyNote />
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        <div style={card}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Connections</div>
          {specs.length === 0 ? (
            <div style={{ color: '#6b7280' }}>No Pico-bound devices. In the Designer, set Binding → Pico and choose a GPIO.</div>
          ) : (
            <div style={{ display: 'grid', gap: 6 }}>
              {specs.map((s, i) => (
                <div key={i} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 8 }}>
                  {s.kind === 'led' && (
                    <div>
                      <b>{s.device.name}</b> — LED circuit:<br />
                      <span style={mono}>
                        Pico GP{s.gpio} → 330Ω → LED anode, LED cathode → GND
                      </span>
                    </div>
                  )}
                  {s.kind === 'relay' && (
                    <div>
                      <b>{s.device.name}</b> — Relay module:<br />
                      <span style={mono}>
                        Pico GP{s.gpio} → IN, Pico GND → GND, +{s.supplyV}V → VCC (module)
                      </span>
                      <div style={label}>Switch mains/DC on relay output (NO/COM). Never drive mains directly from the Pico.</div>
                    </div>
                  )}
                  {s.kind === 'mosfet' && (
                    <div>
                      <b>{s.device.name}</b> — MOSFET driver (low-side):<br />
                      <span style={mono}>
                        Pico GP{s.gpio} → Gate (with 100Ω), Source → GND, Drain → Load−, Load+ → +{s.supplyV}V
                      </span>
                      <div style={label}>Use flyback diode for inductive loads. Prefer logic-level MOSFET modules.</div>
                    </div>
                  )}
                  {s.kind === 'ina219' && (
                    <div>
                      <b>{s.device.name}</b> — INA219 (I²C) power monitor:<br />
                      <span style={mono}>VCC → 3V3, GND → GND, SDA → GP4, SCL → GP5</span>
                      <div style={label}>Wire the shunt in series with the load according to the board’s labels (VIN+, VIN−).</div>
                    </div>
                  )}
                  {s.kind === 'acs712' && (
                    <div>
                      <b>{s.device.name}</b> — ACS712 (analog):<br />
                      <span style={mono}>VCC → 5V, GND → GND, OUT → ADC (e.g., GP26/ADC0)</span>
                      <div style={label}>Requires calibration; outputs ~2.5V at 0A.</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={card}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>BOM (shopping list)</div>
          {bom.length === 0 ? (
            <div style={{ color: '#6b7280' }}>Add Pico-bound devices to generate a BOM.</div>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {bom.map((b, i) => <li key={i}>{b.name} × {b.qty}</li>)}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function SafetyNote() {
  return (
    <div style={{ marginTop: 12, padding: 12, border: '1px solid #fee2e2', background: '#fef2f2', borderRadius: 8 }}>
      <div style={{ fontWeight: 700, color: '#b91c1c' }}>⚠️ Safety</div>
      <ul style={{ margin: 6 }}>
        <li>Do <b>not</b> switch mains directly with the Pico. Use rated relay/SSR modules with proper isolation.</li>
        <li>Share a common <b>GND</b> between Pico and modules. Use external supplies sized for the load.</li>
        <li>Add <b>flyback diodes</b> across coils/inductive loads when using transistors/MOSFETs.</li>
        <li>When unsure, consult a qualified electrician.</li>
      </ul>
    </div>
  );
}

/* ============================== Simple SVG diagram ============================== */
/**
 * This renders:
 *  - A stylized Raspberry Pi Pico with two pin columns (GP0..GP28 subset + 3V3/GND).
 *  - For each spec, a module box and colored lines from the selected GP pin to its input.
 *  - Power rails boxes for 3V3, 5V, 12V when referenced by modules.
 * It’s not a standards-compliant schematic, but it’s great for wiring at the bench.
 */

function DiagramSVG({ specs }: { specs: WireSpec[] }) {
  const width = 920, height = 520;
  const pico = { x: 120, y: 60, w: 140, h: 400 };

  // Minimal pin map to coordinates
  // Left column (top -> bottom): GP0..GP15 (subset), plus 3V3 and GND
  // Right column: GP16..GP28 (subset), plus 3V3 and GND
  const pinStep = 22;
  const leftPins = Array.from({ length: 10 }).map((_, i) => ({ name: `GP${i}`, x: pico.x - 12, y: pico.y + 40 + i * pinStep, side: 'L' as const }));
  const rightPins = Array.from({ length: 10 }).map((_, i) => ({ name: `GP${16 + i}`, x: pico.x + pico.w + 12, y: pico.y + 40 + i * pinStep, side: 'R' as const }));
  const gndL = { name: 'GND', x: pico.x - 12, y: pico.y + pico.h - 40 };
  const gndR = { name: 'GND', x: pico.x + pico.w + 12, y: pico.y + pico.h - 40 };
  const v33 = { name: '3V3', x: pico.x - 12, y: pico.y + 18 };
  const adc0 = { name: 'ADC0', x: pico.x + pico.w + 12, y: pico.y + 18 }; // hint
  const pinIndex: Record<string, { x: number; y: number }> = {};
  [...leftPins, ...rightPins, gndL, gndR, v33, adc0].forEach(p => { pinIndex[p.name] = { x: p.x, y: p.y }; });

  function gpCoord(n: number) {
    const key = `GP${n}`;
    if (pinIndex[key]) return pinIndex[key];
    // fallback: place off bottom if unknown
    return { x: pico.x + pico.w + 12, y: pico.y + pico.h + 20 };
  }

  // Module placements (stacked right side)
  const moduleX = 560;
  const boxes = specs.map((s, i) => ({
    spec: s,
    x: moduleX,
    y: 60 + i * 84,
    w: 300,
    h: 62,
    title:
      s.kind === 'led' ? `${s.device.name} — LED`
      : s.kind === 'relay' ? `${s.device.name} — Relay`
      : s.kind === 'mosfet' ? `${s.device.name} — MOSFET`
      : s.kind === 'ina219' ? `${s.device.name} — INA219`
      : `${s.device.name} — ACS712`,
    terminals:
      s.kind === 'led' ? ['RES→LED+', 'LED−→GND']
      : s.kind === 'relay' ? ['IN', `VCC(${s.supplyV}V)`, 'GND']
      : s.kind === 'mosfet' ? ['G (from GP)', `+${s.supplyV}V`, 'GND']
      : s.kind === 'ina219' ? ['SDA(GP4)', 'SCL(GP5)', '3V3', 'GND']
      : ['OUT→ADC0', '5V', 'GND']
  }));

  // rails used?
  const uses5 = specs.some(s => (s.kind === 'relay' && s.supplyV >= 4.5) || s.kind === 'acs712');
  const uses12 = specs.some(s => (s.kind === 'mosfet' && (s.supplyV ?? 12) >= 11));
  const rails = [
    { name: '3V3', x: 380, y: 60 },
    ...(uses5 ? [{ name: '5V', x: 380, y: 120 }] as const : []),
    ...(uses12 ? [{ name: '12V', x: 380, y: 180 }] as const : []),
    { name: 'GND', x: 380, y: 240 },
  ];

  // Build wires
  type Wire = { x1: number; y1: number; x2: number; y2: number; label?: string };
  const wires: Wire[] = [];
  boxes.forEach((b, i) => {
    const s = b.spec;
    const left = b.x;
    const midY = b.y + b.h / 2;

    if (s.kind === 'led') {
      // GPx -> box (label 330Ω), and box to GND rail
      const gp = gpCoord(s.gpio);
      wires.push({ x1: gp.x, y1: gp.y, x2: left, y2: midY - 8, label: `GP${s.gpio} → 330Ω` });
      const g = rails.find(r => r.name === 'GND')!;
      wires.push({ x1: left, y1: midY + 8, x2: g.x, y2: g.y, label: `LED− → GND` });
    }
    if (s.kind === 'relay') {
      const gp = gpCoord(s.gpio);
      const v = rails.find(r => r.name === (s.supplyV >= 11 ? '12V' : s.supplyV >= 4.5 ? '5V' : '3V3'))!;
      const g = rails.find(r => r.name === 'GND')!;
      wires.push({ x1: gp.x, y1: gp.y, x2: left, y2: midY - 12, label: `GP${s.gpio} → IN` });
      wires.push({ x1: v.x, y1: v.y, x2: left, y2: midY, label: `${v.name} → VCC` });
      wires.push({ x1: left, y1: midY + 12, x2: g.x, y2: g.y, label: `GND` });
    }
    if (s.kind === 'mosfet') {
      const gp = gpCoord(s.gpio);
      const v = rails.find(r => r.name === (s.supplyV >= 11 ? '12V' : s.supplyV >= 4.5 ? '5V' : '3V3'))!;
      const g = rails.find(r => r.name === 'GND')!;
      wires.push({ x1: gp.x, y1: gp.y, x2: left, y2: midY - 12, label: `GP${s.gpio} → Gate` });
      wires.push({ x1: v.x, y1: v.y, x2: left, y2: midY, label: `${v.name} → Load+` });
      wires.push({ x1: left, y1: midY + 12, x2: g.x, y2: g.y, label: `GND` });
    }
    if (s.kind === 'ina219') {
      const sda = gpCoord(4), scl = gpCoord(5);
      const v = rails.find(r => r.name === '3V3')!, g = rails.find(r => r.name === 'GND')!;
      wires.push({ x1: sda.x, y1: sda.y, x2: left, y2: midY - 18, label: 'GP4 → SDA' });
      wires.push({ x1: scl.x, y1: scl.y, x2: left, y2: midY - 6, label: 'GP5 → SCL' });
      wires.push({ x1: v.x, y1: v.y, x2: left, y2: midY + 6, label: '3V3 → VCC' });
      wires.push({ x1: left, y1: midY + 18, x2: g.x, y2: g.y, label: 'GND' });
    }
    if (s.kind === 'acs712') {
      const adc0Pin = pinIndex['ADC0'] ?? { x: pico.x + pico.w + 12, y: pico.y + 18 };
      const v = rails.find(r => r.name === '5V') ?? rails.find(r => r.name === '3V3')!;
      const g = rails.find(r => r.name === 'GND')!;
      wires.push({ x1: adc0Pin.x, y1: adc0Pin.y, x2: left, y2: midY - 10, label: 'ADC0 → OUT' });
      wires.push({ x1: v.x, y1: v.y, x2: left, y2: midY, label: `${v.name} → VCC` });
      wires.push({ x1: left, y1: midY + 10, x2: g.x, y2: g.y, label: 'GND' });
    }
  });

  // Download handler
  const svgRef = useRef<SVGSVGElement | null>(null);
  function downloadSvg() {
    const svg = svgRef.current;
    if (!svg) return;
    const blob = new Blob([svg.outerHTML], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'wiring-diagram.svg';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} width="100%" height={height} style={{ border: '1px solid #e5e7eb', borderRadius: 12 }}>
        {/* Pico body */}
        <rect x={pico.x} y={pico.y} width={pico.w} height={pico.h} rx={12} fill="#f8fafc" stroke="#cbd5e1" />
        <text x={pico.x + pico.w/2} y={pico.y - 8} textAnchor="middle" fontWeight={700}>Raspberry Pi Pico</text>

        {/* Left pins */}
        {leftPins.map((p, i) => (
          <g key={`lp${i}`}>
            <circle cx={p.x} cy={p.y} r={5} fill="#0f172a" />
            <line x1={p.x} y1={p.y} x2={p.x + 14} y2={p.y} stroke="#0f172a" />
            <text x={p.x - 8} y={p.y + 4} textAnchor="end" fontSize={10}>{p.name}</text>
          </g>
        ))}
        {/* Right pins */}
        {rightPins.map((p, i) => (
          <g key={`rp${i}`}>
            <circle cx={p.x} cy={p.y} r={5} fill="#0f172a" />
            <line x1={p.x - 14} y1={p.y} x2={p.x} y2={p.y} stroke="#0f172a" />
            <text x={p.x + 8} y={p.y + 4} fontSize={10}>{p.name}</text>
          </g>
        ))}
        {/* Power/GND hints */}
        {[{...pinIndex['3V3'], name:'3V3'},{...pinIndex['GND']??{x:pico.x+ pico.w + 12, y:pico.y + pico.h - 40}, name:'GND'}, {...pinIndex['ADC0'], name:'ADC0'}].map((p,i)=>(
          <g key={`pwr${i}`}>
            <rect x={p.x-18} y={p.y-10} width={36} height={20} rx={4} fill="#f1f5f9" stroke="#cbd5e1" />
            <text x={p.x} y={p.y+4} textAnchor="middle" fontSize={10}>{(p as any).name}</text>
          </g>
        ))}

        {/* Rails */}
        {rails.map((r,i)=>(
          <g key={`rail${i}`}>
            <rect x={r.x-28} y={r.y-12} width={56} height={24} rx={6} fill="#fefce8" stroke="#eab308" />
            <text x={r.x} y={r.y+4} textAnchor="middle" fontSize={11} fontWeight={700}>{r.name}</text>
          </g>
        ))}

        {/* Module boxes */}
        {boxes.map((b,i)=>(
          <g key={`box${i}`}>
            <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={8} fill="#fff" stroke="#94a3b8" />
            <text x={b.x + 8} y={b.y + 16} fontSize={12} fontWeight={700}>{b.title}</text>
            <text x={b.x + 8} y={b.y + 34} fontSize={11} fill="#475569">
              {b.terminals.join('   ·   ')}
            </text>
          </g>
        ))}

        {/* Wires */}
        {wires.map((w,i)=>(
          <g key={`wire${i}`}>
            <path d={`M ${w.x1} ${w.y1} C ${(w.x1+w.x2)/2} ${w.y1}, ${(w.x1+w.x2)/2} ${w.y2}, ${w.x2} ${w.y2}`} fill="none" stroke="#2563eb" strokeWidth={2}/>
            {w.label && (
              <text x={(w.x1+w.x2)/2} y={(w.y1+w.y2)/2 - 6} textAnchor="middle" fontSize={10} fill="#334155">{w.label}</text>
            )}
          </g>
        ))}
      </svg>
      <div style={{ marginTop: 8 }}>
        <button style={btn} onClick={downloadSvg}>Download SVG</button>
      </div>
    </>
  );
}
