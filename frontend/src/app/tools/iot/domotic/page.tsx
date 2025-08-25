'use client';

import React, { useEffect, useRef, useState } from 'react';

const card: React.CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, background: '#fff' };
const btn: React.CSSProperties = {
  border: '1px solid #e5e7eb', background: '#fff', padding: '8px 12px', borderRadius: 8, cursor: 'pointer'
};
const inputCss: React.CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 12px', font: 'inherit', width: '100%' };
const mono: React.CSSProperties = { fontFamily: 'ui-monospace, Menlo, monospace' };

type PicoState = {
  connected: boolean;
  info?: { model?: string; fw?: string };
  pins: { [gpio: number]: 0 | 1 };
  pwm: { [gpio: number]: number };   // 0..100 (%)
  servo: { [gpio: number]: number }; // 0..180 (deg)
  adc: { [gpio: number]: number };   // 0..4095
};

type InMsg =
  | { type: 'ok'; cmd?: string }
  | { type: 'error'; message: string }
  | { type: 'info'; model?: string; fw?: string }
  | { type: 'state'; pins?: any; pwm?: any; servo?: any; adc?: any }
  | { type: 'adc'; pin: number; value: number };

export default function DomoticPage() {
  const [supported, setSupported] = useState(false);
  const [demoMode, setDemoMode] = useState(false);

  useEffect(() => { setSupported(typeof navigator !== 'undefined' && !!(navigator as any).serial); }, []);

  // serial refs
  const portRef = useRef<SerialPort | null>(null);
  const writerRef = useRef<WritableStreamDefaultWriter<string> | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<string> | null>(null);
  const [connected, setConnected] = useState(false);

  // app state
  const [state, setState] = useState<PicoState>({
    connected: false,
    pins: {},
    pwm: {},
    servo: {},
    adc: {},
  });

  // sparkline
  const [adcHistory, setAdcHistory] = useState<number[]>([]);

  // constants (GPIO you’ll wire for the demo)
  const GPIO_LED = 2;     // LED / lamp (through transistor or relay module)
  const GPIO_RELAY = 18;  // Relay IN
  const GPIO_PWM = 15;    // PWM dimmer output
  const GPIO_SERVO = 16;  // Servo signal
  const GPIO_ADC = 26;    // Potentiometer to ADC0 (GPIO26)

  function updateState(patch: Partial<PicoState>) {
    setState((s) => ({ ...s, ...patch }));
  }

  async function connectSerial() {
    if (demoMode) { setConnected(true); updateState({ connected: true }); return; }
    try {
      // Ask the user to pick a serial device
      const port = await (navigator as any).serial.requestPort({});
      await port.open({ baudRate: 115200 });
      portRef.current = port;

      // Text encode/decode pipeline (newline-delimited JSON)
      const textEncoder = new TextEncoderStream();
      const writableStreamClosed = textEncoder.readable.pipeTo(port.writable);
      writerRef.current = textEncoder.writable.getWriter();

      const textDecoder = new TextDecoderStream();
      const readableStreamClosed = port.readable.pipeTo(textDecoder.writable);
      const reader = textDecoder.readable.getReader();
      readerRef.current = reader;

      setConnected(true); updateState({ connected: true });

      // greet/ask info
      send({ cmd: 'info' });
      send({ cmd: 'state' });

      // reader loop
      let buf = '';
      (async () => {
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            if (!value) continue;
            buf += value;
            let idx;
            while ((idx = buf.indexOf('\n')) >= 0) {
              const line = buf.slice(0, idx).trim();
              buf = buf.slice(idx + 1);
              if (!line) continue;
              try {
                const msg = JSON.parse(line) as InMsg;
                handleInMsg(msg);
              } catch (e) {
                console.warn('bad JSON', line);
              }
            }
          }
        } catch (e) {
          console.warn('reader error', e);
        }
      })();
    } catch (e) {
      console.error(e);
      alert('Could not open serial port. Is the Pico connected and not used by another app?');
    }
  }

  async function disconnectSerial() {
    if (demoMode) { setConnected(false); updateState({ connected: false }); return; }
    try {
      readerRef.current?.releaseLock();
      writerRef.current?.releaseLock();
      await portRef.current?.close();
    } catch {}
    portRef.current = null;
    readerRef.current = null;
    writerRef.current = null;
    setConnected(false);
    updateState({ connected: false });
  }

  function handleInMsg(msg: InMsg) {
    if (msg.type === 'info') {
      updateState({ info: { model: msg.model, fw: msg.fw } });
    } else if (msg.type === 'state') {
      updateState({
        pins: { ...state.pins, ...(msg as any).pins },
        pwm: { ...state.pwm, ...(msg as any).pwm },
        servo: { ...state.servo, ...(msg as any).servo },
        adc: { ...state.adc, ...(msg as any).adc },
      });
    } else if (msg.type === 'adc') {
      const v = msg.value;
      setAdcHistory((h) => [...h.slice(-119), v]);
      updateState({ adc: { ...state.adc, [msg.pin]: v } });
    }
  }

  function send(obj: any) {
    if (demoMode) {
      // Simulate responses
      if (obj.cmd === 'info') {
        handleInMsg({ type: 'info', model: 'Pico (demo)', fw: 'v0.0' });
      } else if (obj.cmd === 'set') {
        const pins = { ...state.pins, [obj.pin]: obj.value ? 1 : 0 };
        handleInMsg({ type: 'state', pins } as any);
      } else if (obj.cmd === 'pwm') {
        const pwm = { ...state.pwm, [obj.pin]: Math.round(obj.percent) };
        handleInMsg({ type: 'state', pwm } as any);
      } else if (obj.cmd === 'servo') {
        const servo = { ...state.servo, [obj.pin]: Math.round(obj.angle) };
        handleInMsg({ type: 'state', servo } as any);
      } else if (obj.cmd === 'read' && obj.type === 'adc') {
        const val = 2000 + Math.round(1800 * Math.sin(Date.now() / 1200));
        handleInMsg({ type: 'adc', pin: obj.pin, value: Math.max(0, Math.min(4095, val)) });
      } else if (obj.cmd === 'scene') {
        // simple: re-route into individual commands
        if (obj.name === 'all-off') {
          handleInMsg({ type: 'state', pins: { ...state.pins, [GPIO_LED]: 0, [GPIO_RELAY]: 0 }, pwm: { ...state.pwm, [GPIO_PWM]: 0 } } as any);
        }
      }
      return;
    }
    const w = writerRef.current;
    if (!w) return;
    w.write(JSON.stringify(obj) + '\n');
  }

  // actions
  function togglePin(pin: number, on: boolean) { send({ cmd: 'set', pin, value: on ? 1 : 0 }); }
  function setPwm(pin: number, percent: number) { send({ cmd: 'pwm', pin, percent }); }
  function setServo(pin: number, angle: number) { send({ cmd: 'servo', pin, angle }); }
  function readAdc(pin: number) { send({ cmd: 'read', type: 'adc', pin }); }
  function applyScene(name: 'all-off' | 'evening' | 'presentation') { send({ cmd: 'scene', name }); }

  useEffect(() => {
    let id: any;
    if (connected) {
      id = setInterval(() => readAdc(GPIO_ADC), 1000);
    }
    return () => { if (id) clearInterval(id); };
  }, [connected]);

  // sparkline svg
  function Sparkline({ data, width=320, height=60 }: { data: number[]; width?: number; height?: number }) {
    if (data.length < 2) return <div style={{ color:'#6b7280' }}>no data</div>;
    const maxV = 4095, minV = 0;
    const pad = 4;
    const xs = (i:number) => pad + (i*(width-2*pad))/(data.length-1);
    const ys = (v:number) => pad + (height-2*pad) * (1 - (v - minV)/(maxV - minV));
    let d = `M ${xs(0)} ${ys(data[0])}`;
    for (let i=1;i<data.length;i++) d += ` L ${xs(i)} ${ys(data[i])}`;
    return (
      <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} style={{ display:'block' }}>
        <polyline fill="none" stroke="#2563eb" strokeWidth="2" points={data.map((v,i)=>`${xs(i)},${ys(v)}`).join(' ')} />
      </svg>
    );
  }

  return (
    <div style={{ display:'grid', gap:16 }}>
      <h1 style={{ margin: 0 }}>Domotics Control (Pico)</h1>
      <p style={{ margin: 0, color: '#555' }}>
        Connect to a Raspberry Pi Pico/Pico W over USB (Web Serial). Toggle lights/relays, dim via PWM, move a servo, and read a sensor.
      </p>

      {/* Connection */}
      <div style={card}>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
          {!connected
            ? <button onClick={connectSerial} style={btn}>{demoMode ? 'Start demo' : 'Connect Pico (USB)'}</button>
            : <button onClick={disconnectSerial} style={btn}>Disconnect</button>}
          <label style={{ display:'inline-flex', alignItems:'center', gap:8, marginLeft:8 }}>
            <input type="checkbox" checked={demoMode} onChange={e=>setDemoMode(e.target.checked)} />
            Demo mode (no hardware)
          </label>
          {!supported && <span style={{ color:'#b91c1c' }}>Your browser doesn’t support Web Serial. Use Chrome/Edge on desktop.</span>}
        </div>
        <div style={{ marginTop:8, fontSize:12, color:'#6b7280' }}>
          {state.info ? <span>Device: {state.info.model} · FW: {state.info.fw}</span> : '—'}
        </div>
      </div>

      {/* Lights / Relays */}
      <div style={card}>
        <div style={{ fontWeight:700, marginBottom:8 }}>Actuators</div>
        <div style={{ display:'grid', gap:10, gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <div style={{ border:'1px solid #e5e7eb', borderRadius:8, padding:12 }}>
            <div style={{ fontWeight:600, marginBottom:6 }}>Light (GPIO {GPIO_LED})</div>
            <button
              onClick={()=>togglePin(GPIO_LED, !(state.pins[GPIO_LED]===1))}
              style={btn}
            >
              {state.pins[GPIO_LED] ? 'Turn OFF' : 'Turn ON'}
            </button>
            <div style={{ marginTop:6, fontSize:12, color:'#6b7280' }}>3.3V logic → use transistor or relay to drive lamps.</div>
          </div>

          <div style={{ border:'1px solid #e5e7eb', borderRadius:8, padding:12 }}>
            <div style={{ fontWeight:600, marginBottom:6 }}>Relay (GPIO {GPIO_RELAY})</div>
            <button
              onClick={()=>togglePin(GPIO_RELAY, !(state.pins[GPIO_RELAY]===1))}
              style={btn}
            >
              {state.pins[GPIO_RELAY] ? 'Relay OFF' : 'Relay ON'}
            </button>
            <div style={{ marginTop:6, fontSize:12, color:'#6b7280' }}>Use a low-voltage load for demo. Don’t switch mains.</div>
          </div>

          <div style={{ border:'1px solid #e5e7eb', borderRadius:8, padding:12 }}>
            <div style={{ fontWeight:600, marginBottom:6 }}>PWM Dimmer (GPIO {GPIO_PWM})</div>
            <input type="range" min={0} max={100} value={state.pwm[GPIO_PWM] ?? 0}
              onChange={(e)=>setPwm(GPIO_PWM, Number(e.target.value))}
              style={{ width:'100%' }} />
            <div style={{ ...mono, marginTop:6 }}>{state.pwm[GPIO_PWM] ?? 0}%</div>
          </div>

          <div style={{ border:'1px solid #e5e7eb', borderRadius:8, padding:12 }}>
            <div style={{ fontWeight:600, marginBottom:6 }}>Servo (GPIO {GPIO_SERVO})</div>
            <input type="range" min={0} max={180} value={state.servo[GPIO_SERVO] ?? 90}
              onChange={(e)=>setServo(GPIO_SERVO, Number(e.target.value))}
              style={{ width:'100%' }} />
            <div style={{ ...mono, marginTop:6 }}>{state.servo[GPIO_SERVO] ?? 90}°</div>
            <div style={{ marginTop:6, fontSize:12, color:'#6b7280' }}>Power servo from 5V with common ground.</div>
          </div>
        </div>
      </div>

      {/* Sensors */}
      <div style={card}>
        <div style={{ fontWeight:700, marginBottom:8 }}>Sensors</div>
        <div style={{ display:'grid', gap:10, gridTemplateColumns:'repeat(auto-fit, minmax(260px, 1fr))' }}>
          <div style={{ border:'1px solid #e5e7eb', borderRadius:8, padding:12 }}>
            <div style={{ fontWeight:600, marginBottom:6 }}>ADC (GPIO {GPIO_ADC} / ADC0)</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr auto', alignItems:'center', gap:8 }}>
              <div>
                <div style={mono}>Raw: {state.adc[GPIO_ADC] ?? '-'}</div>
                <div style={{ fontSize:12, color:'#6b7280' }}>
                  {(state.adc[GPIO_ADC] != null) ? `~${Math.round((state.adc[GPIO_ADC]/4095)*100)}%` : '—'}
                </div>
              </div>
              <button onClick={()=>readAdc(GPIO_ADC)} style={btn}>Read now</button>
            </div>
            <div style={{ marginTop:8 }}>
              <Sparkline data={adcHistory} />
            </div>
          </div>
        </div>
      </div>

      {/* Scenes */}
      <div style={card}>
        <div style={{ fontWeight:700, marginBottom:8 }}>Scenes</div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <button style={btn} onClick={()=>applyScene('all-off')}>All off</button>
          <button style={btn} onClick={()=>applyScene('evening')}>Evening</button>
          <button style={btn} onClick={()=>applyScene('presentation')}>Presentation</button>
        </div>
      </div>

      {/* Safety note */}
      <div style={{ fontSize:12, color:'#6b7280' }}>
        ⚠️ Demo safely: control only **low-voltage** loads (5–12V). If you ever switch mains, use proper opto-isolated relays and follow electrical codes.
      </div>
    </div>
  );
}
