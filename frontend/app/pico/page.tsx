"use client";

import { useEffect, useMemo, useRef, useState } from "react";

function useLocalStorage(key: string, initial: string) {
  const [value, setValue] = useState<string>(() => {
    if (typeof window === "undefined") return initial;
    try { return window.localStorage.getItem(key) ?? initial; } catch { return initial; }
  });
  useEffect(() => { try { window.localStorage.setItem(key, value); } catch {} }, [key, value]);
  return [value, setValue] as const;
}

async function callProxy(url: string) {
  const res = await fetch("/api/pico", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }) });
  const text = await res.text();
  if (!res.ok) throw new Error(`Proxy ${res.status}: ${text || "error"}`);
  return text;
}
async function callProxyJSON(url: string) {
  const txt = await callProxy(url);
  try { return JSON.parse(txt); } catch { throw new Error("Bad JSON from device"); }
}

const PIN_OPTIONS = [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,26,27,28];

export default function PicoPage() {
  const [host, setHost] = useLocalStorage("pico_host", "http://pico.local");
  const [pin, setPin] = useLocalStorage("pico_pin", "15");         // GPIO control pin
  const [pwmPin, setPwmPin] = useLocalStorage("pico_pwm_pin", "15"); // PWM pin
  const [pwmDuty, setPwmDuty] = useLocalStorage("pwm_duty", "50"); // 0..100
  const [status, setStatus] = useState("Disconnected");
  const [busy, setBusy] = useState(false);

  // joystick
  const [joy, setJoy] = useState<{x_pct:number,y_pct:number,pressed:boolean,x:number,y:number,center?:{x:number,y:number}}|null>(null);
  const [polling, setPolling] = useState(false);
  const [intervalMs, setIntervalMs] = useLocalStorage("pico_joy_interval", "100");
  const pollRef = useRef<number|undefined>(undefined);

  const base = useMemo(() => host.replace(/\/+$/, ""), [host]);
  const pinNum = Number(pin) || 15;
  const pwmPinNum = Number(pwmPin) || 15;
  const dutyNum = Math.max(0, Math.min(100, Number(pwmDuty) || 0));

  async function send(path: string) {
    setBusy(true); setStatus("Sending...");
    try { await callProxy(`${base}${path}`); setStatus(`OK: ${path}`); }
    catch (e:any){ setStatus(`Failed: ${e?.message||String(e)}`); }
    finally { setBusy(false); }
  }
  async function ping() {
    setBusy(true); setStatus("Pinging...");
    try { await callProxy(`${base}/`); setStatus("Online"); }
    catch (e:any){ setStatus(`Offline: ${e?.message||String(e)}`); }
    finally { setBusy(false); }
  }
  async function readJoystickOnce() {
    try {
      const data = await callProxyJSON(`${base}/JOYSTICK`);
      setJoy({
        x_pct: Number(data.x_pct)||0,
        y_pct: Number(data.y_pct)||0,
        pressed: !!data.pressed,
        x: Number(data.x)||0,
        y: Number(data.y)||0,
        center: data.center
      });
      setStatus("Joystick OK");
    } catch (e:any) {
      setStatus(`Joystick error: ${e?.message||String(e)}`);
    }
  }
  async function calibrate() {
    try {
      const data = await callProxyJSON(`${base}/CALIBRATE`);
      setStatus(`Calibrated: x=${data.center?.x}, y=${data.center?.y}`);
    } catch (e:any) {
      setStatus(`Calibrate error: ${e?.message||String(e)}`);
    }
  }
  useEffect(() => {
    if (!polling) return;
    const ms = Math.max(50, Math.min(1000, Number(intervalMs)||100));
    function tick(){ readJoystickOnce(); }
    tick();
    pollRef.current = window.setInterval(tick, ms);
    return () => { if (pollRef.current) window.clearInterval(pollRef.current); };
  }, [polling, intervalMs, base]);

  function pctTo01(p:number){ return (p + 100) / 200; }
  const dotX = joy ? pctTo01(joy.x_pct) : 0.5;
  const dotY = joy ? 1 - pctTo01(joy.y_pct) : 0.5;

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 12 }}>Raspberry&nbsp;Pi Pico&nbsp;W</h1>
      <p style={{ color: "#4b5563", marginBottom: 24 }}>
        HTTPS-safe control of on-board LED, GPIO, PWM, and a live joystick via your server-side proxy.
      </p>

      <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>Pico Host / IP</label>
      <input
        value={host}
        onChange={(e) => setHost(e.target.value)}
        placeholder="http://192.168.1.131"
        style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 8, padding: "10px 12px", marginBottom: 12, fontFamily: "ui-monospace,Menlo,Consolas,monospace" }}
      />

      {/* Top row: LED + GPIO */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
          <h2 style={{ fontWeight: 700, marginBottom: 12 }}>On-board LED</h2>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button onClick={() => send("/LED_BUILTIN/ON")}  disabled={busy} style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#f1f5f9", cursor: busy?"not-allowed":"pointer" }}>LED ON</button>
            <button onClick={() => send("/LED_BUILTIN/OFF")} disabled={busy} style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#f1f5f9", cursor: busy?"not-allowed":"pointer" }}>LED OFF</button>
          </div>
        </div>

        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
          <h2 style={{ fontWeight: 700, marginBottom: 12 }}>GPIO Pin</h2>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
            <label style={{ fontWeight: 600 }}>Pin:</label>
            <select value={pin} onChange={(e)=>setPin(e.target.value)} style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb" }}>
              {PIN_OPTIONS.map(p => <option key={p} value={p}>GP{p}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button onClick={() => send(`/GPIO/${pinNum}/ON`)}  disabled={busy} style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#f1f5f9", cursor: busy?"not-allowed":"pointer" }}>Pin ON</button>
            <button onClick={() => send(`/GPIO/${pinNum}/OFF`)} disabled={busy} style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#f1f5f9", cursor: busy?"not-allowed":"pointer" }}>Pin OFF</button>
          </div>
        </div>
      </div>

      {/* PWM */}
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <h2 style={{ fontWeight: 700, marginBottom: 12 }}>PWM</h2>
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
          <label style={{ fontWeight: 600 }}>Pin:</label>
          <select value={pwmPin} onChange={(e)=>setPwmPin(e.target.value)} style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb" }}>
            {PIN_OPTIONS.map(p => <option key={p} value={p}>GP{p}</option>)}
          </select>
          <label style={{ fontWeight: 600, marginLeft: 16 }}>Duty:</label>
          <input
            type="range" min={0} max={100} value={dutyNum}
            onChange={(e)=>setPwmDuty(e.target.value)}
            style={{ width: 200 }}
          />
          <span style={{ width: 48, textAlign: "right" }}>{dutyNum}%</span>
          <button
            onClick={()=>send(`/PWM/${pwmPinNum}/${dutyNum}`)}
            disabled={busy}
            style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#f1f5f9", cursor: busy?"not-allowed":"pointer" }}
          >Set</button>
          <button
            onClick={()=>send(`/PWMOFF/${pwmPinNum}`)}
            disabled={busy}
            style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#f1f5f9", cursor: busy?"not-allowed":"pointer" }}
          >Stop</button>
        </div>
        <p style={{ fontSize: 12, color: "#6b7280" }}>
          Use PWM on a pin wired to an LED (via 220Ω) to dim it. Duty is 0–100%. (Arduino uses 8-bit analogWrite; MicroPython uses duty_u16.)
        </p>
      </div>

      {/* Joystick */}
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <h2 style={{ fontWeight: 700, marginBottom: 12 }}>Joystick (VRx=A0/GP26, VRy=A1/GP27, SW=GP28)</h2>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ width: 260 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button onClick={()=>setPolling(true)}  disabled={polling} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#f1f5f9" }}>Start</button>
              <button onClick={()=>setPolling(false)} disabled={!polling} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#f1f5f9" }}>Stop</button>
              <input value={intervalMs} onChange={(e)=>setIntervalMs(e.target.value)} title="ms" style={{ width: 80, padding: "6px 8px", borderRadius: 8, border: "1px solid #e5e7eb" }}/>
              <span style={{ color: "#6b7280", fontSize: 12 }}>ms</span>
              <button onClick={calibrate} style={{ marginLeft: 8, padding: "8px 12px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#f1f5f9" }}>
                Calibrate Center
              </button>
            </div>

            {/* Crosshair */}
            <div style={{ width: 200, height: 200, position: "relative", border: "1px solid #e5e7eb", borderRadius: 8, background: "#fafafa" }}>
              <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "#e5e7eb", transform: "translateX(-0.5px)" }}/>
              <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 1, background: "#e5e7eb", transform: "translateY(-0.5px)" }}/>
              <div style={{
                position: "absolute", width: 10, height: 10, borderRadius: 9999, background: "#111827",
                left: `calc(${((joy ? (joy.x_pct + 100) / 200 : 0.5)*100).toFixed(1)}% - 5px)`,
                top:  `calc(${((joy ? 1 - (joy.y_pct + 100) / 200 : 0.5)*100).toFixed(1)}% - 5px)`
              }}/>
            </div>
          </div>

          {/* Readout */}
          <div style={{ minWidth: 280 }}>
            <div style={{ fontFamily: "ui-monospace,Menlo,Consolas,monospace", fontSize: 14, lineHeight: 1.7 }}>
              <div>X%: <strong>{joy?.x_pct ?? "--"}</strong></div>
              <div>Y%: <strong>{joy?.y_pct ?? "--"}</strong></div>
              <div>X raw: <strong>{joy?.x ?? "--"}</strong> (0..4095)</div>
              <div>Y raw: <strong>{joy?.y ?? "--"}</strong> (0..4095)</div>
              <div>Button: <strong>{joy?.pressed ? "PRESSED" : "released"}</strong></div>
              <div>Center: <strong>{joy?.center ? `x=${joy.center.x}, y=${joy.center.y}` : "--"}</strong></div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
        <button onClick={ping} disabled={busy} style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#f1f5f9", cursor: busy?"not-allowed":"pointer" }}>Ping Device</button>
      </div>

      <div style={{ fontSize: 14, color: "#111827", marginBottom: 24 }}>
        Status: <span style={{ fontWeight: 700 }}>{status}</span>
      </div>
    </div>
  );
}
