"use client";
import { useEffect, useRef, useState } from "react";
import { proxyJSON } from "../_lib/picoProxy";
import { useLocalStorage } from "../_lib/useLocalStorage";
import { PressButton } from "./ui";

type JoyResp = { x:number; y:number; pressed:boolean; x_pct?:number; y_pct?:number; center?:{x:number;y:number} };

// clamp helper
const clamp = (v:number, lo:number, hi:number) => v < lo ? lo : v > hi ? hi : v;

/** Critically-damped spring (Unity SmoothDamp). Stable across frame rates. */
function smoothDamp(current:number, target:number, vel:number, smoothTime:number, maxSpeed:number, dt:number) {
  smoothTime = Math.max(0.0001, smoothTime);
  const omega = 2 / smoothTime;
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  let change = current - target;
  const maxChange = maxSpeed * smoothTime;
  change = clamp(change, -maxChange, maxChange);
  const temp = (vel + omega * change) * dt;
  const newVel = (vel - omega * temp) * exp;
  let newVal = target + (change + temp) * exp;
  // snap when close
  if (Math.abs(newVal - target) < 1e-4 && Math.abs(newVel) < 1e-4) {
    newVal = target; return [newVal, 0] as const;
  }
  return [newVal, newVel] as const;
}

export function JoystickCard({ base, onStatus }: { base: string; onStatus: (s: string)=>void }) {
  // raw values from device
  const [raw, setRaw] = useState<{x:number; y:number; pressed:boolean} | null>(null);

  // user prefs (SSR-safe)
  const [intervalMs, setIntervalMs] = useLocalStorage("pico_joy_interval", "250");
  const [invertX, setInvertX]       = useLocalStorage("pico_joy_invertX", "0");
  const [invertY, setInvertY]       = useLocalStorage("pico_joy_invertY", "0");
  const [swapAxes, setSwapAxes]     = useLocalStorage("pico_joy_swap", "0");
  const [autoRange, setAutoRange]   = useLocalStorage("pico_joy_autorange", "1");
  const [smoothStr, setSmoothStr]   = useLocalStorage("pico_joy_smooth", "70"); // 0..100 (higher = softer)

  // calibration (center) and learned range
  const [cxStr, setCxStr] = useLocalStorage("pico_joy_cx", "2048");
  const [cyStr, setCyStr] = useLocalStorage("pico_joy_cy", "2048");
  const [minXStr, setMinXStr] = useLocalStorage("pico_joy_minx", "4095");
  const [maxXStr, setMaxXStr] = useLocalStorage("pico_joy_maxx", "0");
  const [minYStr, setMinYStr] = useLocalStorage("pico_joy_miny", "4095");
  const [maxYStr, setMaxYStr] = useLocalStorage("pico_joy_maxy", "0");

  const cx = +cxStr || 2048, cy = +cyStr || 2048;
  const minX = +minXStr || 4095, maxX = +maxXStr || 0;
  const minY = +minYStr || 4095, maxY = +maxYStr || 0;

  // target (0..1) for the dot (from latest sample)
  const targetRef = useRef({ x: 0.5, y: 0.5 });

  // drawn (0..1) position, smoothed by the spring
  const [draw, setDraw] = useState({ x: 0.5, y: 0.5 });
  const velRef = useRef({ vx: 0, vy: 0 });

  const [polling, setPolling] = useState(false);
  const [busy, setBusy] = useState(false);

  // map raw → pct → [0..1] css coords
  function toPct(rawX:number, rawY:number) {
    let rx = rawX, ry = rawY;
    if (swapAxes === "1") [rx, ry] = [ry, rx];

    // learn range
    if (autoRange === "1") {
      if (rx < minX) setMinXStr(String(rx));
      if (rx > maxX) setMaxXStr(String(rx));
      if (ry < minY) setMinYStr(String(ry));
      if (ry > maxY) setMaxYStr(String(ry));
    }

    const spanX = Math.max(120, Math.max(maxX - cx, cx - minX));
    const spanY = Math.max(120, Math.max(maxY - cy, cy - minY));

    let xPct = ((rx - cx) / spanX) * 100;   // right +
    let yPct = ((ry - cy) / spanY) * 100;   // up + (depends on sensor orientation)

    if (invertX === "1") xPct = -xPct;
    if (invertY === "1") yPct = -yPct;

    xPct = clamp(xPct, -100, 100);
    yPct = clamp(yPct, -100, 100);

    const tx = (xPct + 100) / 200;       // 0..1 left→right
    const ty = 1 - (yPct + 100) / 200;   // 0..1 top→bottom
    return { xPct, yPct, tx: clamp(tx,0,1), ty: clamp(ty,0,1) };
  }

  async function readOnce() {
    try {
      const d = await proxyJSON<JoyResp>(`${base}/JOYSTICK`);
      const rx = +d.x || 0, ry = +d.y || 0;
      setRaw({ x: rx, y: ry, pressed: !!d.pressed });
      const { tx, ty } = toPct(rx, ry);
      targetRef.current = { x: tx, y: ty };
      onStatus("Joystick OK");
    } catch (e:any) {
      onStatus(`Joystick error: ${e?.message||String(e)}`);
    }
  }

  async function deviceCalibrate() {
    setBusy(true); onStatus("Calibrating on device…");
    try {
      const d = await proxyJSON<{center:{x:number;y:number}}>(`${base}/CALIBRATE`);
      setCxStr(String(d.center.x)); setCyStr(String(d.center.y));
      onStatus(`Device center: x=${d.center.x}, y=${d.center.y}`);
    } catch (e:any) { onStatus(`Device calibrate error: ${e?.message||String(e)}`); }
    finally { setBusy(false); }
  }
  function calibrateHere() {
    if (!raw) return;
    setCxStr(String(raw.x)); setCyStr(String(raw.y));
    onStatus(`Center set: x=${raw.x}, y=${raw.y}`);
  }
  function resetRange() {
    setMinXStr("4095"); setMaxXStr("0"); setMinYStr("4095"); setMaxYStr("0");
    onStatus("Range reset. Move stick to all corners to learn full range.");
  }

  // sequential polling (no overlaps)
  useEffect(() => {
    let stop = false;
    if (!polling) return;
    const ms = Math.max(120, Math.min(800, Number(intervalMs) || 250));
    (async () => { while (!stop) { await readOnce().catch(()=>{}); await new Promise(r => setTimeout(r, ms)); } })();
    return () => { stop = true; };
  }, [polling, intervalMs, base, invertX, invertY, swapAxes, autoRange, cxStr, cyStr, minXStr, maxXStr, minYStr, maxYStr]);

  // animation loop: SmoothDamp draw → target at ~60fps (frame-time aware)
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const MAX_SPEED = 4.0; // units per second (box widths/sec)
    const tick = () => {
      const now = performance.now();
      let dt = (now - last) / 1000; last = now;
      dt = Math.min(Math.max(dt, 0.001), 0.033); // clamp 1..33 ms

      // map smooth slider (0..100) → smoothTime (0.05..0.9s)
      const s = Math.max(0, Math.min(100, Number(smoothStr) || 70));
      const smoothTime = 0.05 + (0.9 - 0.05) * (s / 100); // higher slider = softer / slower

      const t = targetRef.current;
      let [nx, vx] = smoothDamp(draw.x, t.x, velRef.current.vx, smoothTime, MAX_SPEED, dt);
      let [ny, vy] = smoothDamp(draw.y, t.y, velRef.current.vy, smoothTime, MAX_SPEED, dt);
      velRef.current.vx = vx; velRef.current.vy = vy;
      setDraw({ x: nx, y: ny });

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [smoothStr, draw.x, draw.y]);

  const left = `calc(${(draw.x*100).toFixed(2)}% - 5px)`;
  const top  = `calc(${(draw.y*100).toFixed(2)}% - 5px)`;

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
      <h2 style={{ fontWeight: 700, marginBottom: 12 }}>Joystick (VRx=A0/GP26, VRy=A1/GP27, SW=GP28)</h2>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ width: 300 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center", flexWrap: "wrap" }}>
            <PressButton onClick={()=>setPolling(true)}  disabled={polling}>Start</PressButton>
            <PressButton onClick={()=>setPolling(false)} disabled={!polling}>Stop</PressButton>
            <input value={intervalMs} onChange={(e)=>setIntervalMs(e.target.value)} title="ms" style={{ width: 80, padding: "6px 8px", borderRadius: 8, border: "1px solid #e5e7eb" }}/>
            <span style={{ color: "#6b7280", fontSize: 12 }}>ms</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 8 }}>
              <span style={{ fontSize: 12, color: "#6b7280" }}>Smoothness</span>
              <input type="range" min={0} max={100} value={Number(smoothStr)||70} onChange={(e)=>setSmoothStr(e.target.value)} />
            </div>
          </div>

          {/* Crosshair */}
          <div style={{ width: 200, height: 200, position: "relative", border: "1px solid #e5e7eb", borderRadius: 8, background: "#fafafa", overflow: "hidden" }}>
            <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "#e5e7eb", transform: "translateX(-0.5px)" }}/>
            <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 1, background: "#e5e7eb", transform: "translateY(-0.5px)" }}/>
            <div style={{
              position: "absolute", width: 10, height: 10, borderRadius: 9999, background: "#111827",
              left, top,
              boxShadow: "0 0 0 0 rgba(17,24,39,0.22)",
              animation: "pulseDot 2s ease-out infinite",
            }}/>
            <style>{`
              @keyframes pulseDot {
                0% { box-shadow: 0 0 0 0 rgba(17,24,39,0.22); }
                70% { box-shadow: 0 0 0 8px rgba(17,24,39,0); }
                100% { box-shadow: 0 0 0 0 rgba(17,24,39,0); }
              }
            `}</style>
          </div>
        </div>

        {/* Controls + Readout */}
        <div style={{ minWidth: 340 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
            <PressButton onClick={calibrateHere}>Calibrate Center (here)</PressButton>
            <PressButton onClick={deviceCalibrate} busy={busy}>Device Calibrate</PressButton>
            <PressButton onClick={resetRange}>Reset Range</PressButton>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={autoRange==="1"} onChange={(e)=>setAutoRange(e.target.checked?"1":"0")} />
              Auto-range
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={swapAxes==="1"} onChange={(e)=>setSwapAxes(e.target.checked?"1":"0")} />
              Swap axes
            </label>
            <div style={{ display: "flex", gap: 12 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input type="checkbox" checked={invertX==="1"} onChange={(e)=>setInvertX(e.target.checked?"1":"0")} />
                Invert X
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input type="checkbox" checked={invertY==="1"} onChange={(e)=>setInvertY(e.target.checked?"1":"0")} />
                Invert Y
              </label>
            </div>
          </div>

          <div style={{ fontFamily: "ui-monospace,Menlo,Consolas,monospace", fontSize: 14, lineHeight: 1.7 }}>
            <div>Raw X: <strong>{raw?.x ?? "--"}</strong>  Raw Y: <strong>{raw?.y ?? "--"}</strong></div>
            <div>Center X:
              <input value={cxStr} onChange={(e)=>setCxStr(e.target.value)} style={{ width: 80, marginLeft: 6, padding: "4px 6px", border: "1px solid #e5e7eb", borderRadius: 6 }} />
              &nbsp;Center Y:
              <input value={cyStr} onChange={(e)=>setCyStr(e.target.value)} style={{ width: 80, marginLeft: 6, padding: "4px 6px", border: "1px solid #e5e7eb", borderRadius: 6 }} />
            </div>
            <div>Range X: <strong>{minX}</strong> .. <strong>{maxX}</strong></div>
            <div>Range Y: <strong>{minY}</strong> .. <strong>{maxY}</strong></div>
            <div>Pressed: <strong>{raw?.pressed ? "PRESSED" : "released"}</strong></div>
          </div>
        </div>
      </div>
    </div>
  );
}
