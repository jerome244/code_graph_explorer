"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

// ──────────────────────────────────────────────────────────────────────────────
// Shared localStorage key so all pages share the Pico base URL
const LS_KEY = "pico_baseURL";

function useBaseURL() {
  const [raw, setRaw] = useState("");
  useEffect(() => { const saved = localStorage.getItem(LS_KEY); if (saved) setRaw(saved); }, []);
  const baseURL = useMemo(() => {
    const s = raw.trim(); if (!s) return "";
    return /^https?:\/\//i.test(s) ? s.replace(/\/$/, "") : `http://${s}`;
  }, [raw]);
  const save = (v: string) => { setRaw(v); localStorage.setItem(LS_KEY, v); };
  return { input: raw, setInput: save, baseURL } as const;
}

// ──────────────────────────────────────────────────────────────────────────────
// Types
type Thermo = { raw:number; raw_bits:number; voltage:number; resistance_ohm:number; temp_c:number; };
type MotorState = "on" | "off" | "unknown";
type OnOff = "on" | "off";

// ──────────────────────────────────────────────────────────────────────────────
// Styles
const pageWrap: React.CSSProperties = { maxWidth: 980, margin: "32px auto", padding: 24 };
const headerBar: React.CSSProperties = { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 16 };
const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16, alignItems: "start" };
const card: React.CSSProperties = { display: "grid", gap: 10, padding: 16, border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", boxShadow: "0 6px 16px rgba(0,0,0,0.06)" };
const cardTitle: React.CSSProperties = { fontSize: 18, fontWeight: 700, color: "#111827" };
const cardDesc: React.CSSProperties = { color: "#6b7280", fontSize: 14 };
const row: React.CSSProperties = { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" };
const hint: React.CSSProperties = { color: "#6b7280", fontSize: 12 };
const pill: React.CSSProperties = { padding: "6px 10px", borderRadius: 999, border: "1px solid #e5e7eb", background: "#f9fafb", fontSize: 12, color: "#374151", fontWeight: 600 };

const btnBase: React.CSSProperties = { padding: "10px 12px", borderRadius: 10, fontSize: 14, fontWeight: 600, border: "1px solid transparent", cursor: "pointer" };
const btnDark: React.CSSProperties = { ...btnBase, color: "#fff", background: "#111827" };
const btnLight: React.CSSProperties = { ...btnBase, color: "#111827", background: "#fff", border: "1px solid #e5e7eb" };
const btnWarn: React.CSSProperties = { ...btnBase, color: "#fff", background: "#dc2626" };
const btnSafe: React.CSSProperties = { ...btnBase, color: "#fff", background: "#059669" };

const errorBox: React.CSSProperties = { background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", padding: 12, borderRadius: 10, marginTop: 12, fontSize: 14 };

// ──────────────────────────────────────────────────────────────────────────────
export default function ThermoMotorPage() {
  const { input, setInput, baseURL } = useBaseURL();

  const [thermo, setThermo] = useState<Thermo | null>(null);
  const [motor, setMotor] = useState<MotorState>("unknown");
  const [buzzer, setBuzzer] = useState<{ state: OnOff; alarm: boolean }>({ state: "off", alarm: false });
  const [error, setError] = useState("");

  // Controls
  const [auto, setAuto] = useState(true);             // auto motor logic
  const [targetC, setTargetC] = useState(30);         // motor threshold
  const [hyst, setHyst] = useState(1.0);              // motor hysteresis
  const [syncLEDs, setSyncLEDs] = useState(true);     // physical LEDs
  // Safety buzzer
  const [critC, setCritC] = useState(40);             // critical temperature
  const [critHyst, setCritHyst] = useState(0.5);      // hysteresis for alarm clear
  const [buzzOnMs, setBuzzOnMs] = useState(400);
  const [buzzOffMs, setBuzzOffMs] = useState(400);
  const [buzzEnable, setBuzzEnable] = useState(true);
  const [buzzLatch, setBuzzLatch] = useState(false);  // default: auto-stop when cooled

  const [busy, setBusy] = useState(false);

  // Refs (avoid stale closures + throttles)
  const targetRef = useRef(targetC); useEffect(()=>{targetRef.current=targetC;},[targetC]);
  const hystRef = useRef(hyst); useEffect(()=>{hystRef.current=hyst;},[hyst]);
  const autoRef = useRef(auto); useEffect(()=>{autoRef.current=auto;},[auto]);
  const motorRef = useRef<MotorState>(motor); useEffect(()=>{motorRef.current=motor;},[motor]);
  const inflightRef = useRef(false);
  const cooldownUntilRef = useRef(0);        // relay cooldown
  const backoffUntilRef = useRef(0);         // after 5xx

  const lastLEDRef = useRef<{ red: OnOff; green: OnOff }>({ red: "off", green: "off" });
  const ledCooldownUntilRef = useRef(0);

  const critRef = useRef(critC); useEffect(()=>{critRef.current=critC;},[critC]);
  const critHystRef = useRef(critHyst); useEffect(()=>{critHystRef.current=critHyst;},[critHyst]);
  const buzzEnableRef = useRef(buzzEnable); useEffect(()=>{buzzEnableRef.current=buzzEnable;},[buzzEnable]);
  const buzzLatchRef = useRef(buzzLatch); useEffect(()=>{buzzLatchRef.current=buzzLatch;},[buzzLatch]);
  const buzzOnRef = useRef(buzzOnMs); useEffect(()=>{buzzOnRef.current=buzzOnMs;},[buzzOnMs]);
  const buzzOffRef = useRef(buzzOffMs); useEffect(()=>{buzzOffRef.current=buzzOffMs;},[buzzOffMs]);
  const alarmActiveRef = useRef(false);   // last commanded alarm state
  const buzzCooldownUntilRef = useRef(0);
  const buzzerRef = useRef<{ state: OnOff; alarm: boolean }>({ state: "off", alarm: false });
  useEffect(()=>{buzzerRef.current=buzzer;},[buzzer]);

  // ─────────────────────── proxy helper ───────────────────────
  async function jgetPico<T = any>(picoPath: string, qs?: Record<string,string|number>): Promise<T> {
    if (!baseURL) throw new Error("Missing Pico base URL");
    const usp = new URLSearchParams();
    if (qs) for (const [k,v] of Object.entries(qs)) usp.set(k, String(v));
    if (!usp.has("t")) usp.set("t", "12000");
    usp.set("target", baseURL); // always pass target for your proxy
    const url = `/api/pico${picoPath}${usp.toString() ? `?${usp.toString()}` : ""}`;
    const r = await fetch(url, { method: "GET", headers: { "X-Pico-Base": baseURL }, cache: "no-store", keepalive: false });
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return (await r.json()) as T;
  }

  // ─────────────────────── API wrappers ───────────────────────
  const readThermistor = async () => {
    if (Date.now() < backoffUntilRef.current) return thermo;
    try {
      const js = await jgetPico<Thermo>(`/api/thermistor/read`);
      setThermo(js); setError(""); return js;
    } catch (e:any) {
      const msg = e?.message || "";
      if (/^5\d\d/.test(msg)) backoffUntilRef.current = Date.now() + 2000;
      throw e;
    }
  };

  const readMotorStatus = async () => {
    const js = await jgetPico<{state:"on"|"off"}>(`/api/relay/status`);
    setMotor(js.state); setError(""); return js.state as MotorState;
  };

  const setMotorState = async (state:"on"|"off") => {
    if (Date.now() < cooldownUntilRef.current) return;
    await jgetPico(`/api/relay`, { state });
    setMotor(state); motorRef.current = state;
    cooldownUntilRef.current = Date.now() + 2500;
  };

  const readBuzzerStatus = async () => {
    const js = await jgetPico<{state:OnOff; alarm:boolean}>(`/api/buzzer/status`);
    setBuzzer(js); return js;
  };

  const startAlarm = async () => {
    if (Date.now() < buzzCooldownUntilRef.current) return;
    await jgetPico(`/api/buzzer/alarm`, { cmd: "start", on_ms: buzzOnRef.current, off_ms: buzzOffRef.current });
    alarmActiveRef.current = true;
    buzzCooldownUntilRef.current = Date.now() + 300;
    await readBuzzerStatus(); // resync
  };

  const stopAlarm = async () => {
    if (Date.now() < buzzCooldownUntilRef.current) return;
    await jgetPico(`/api/buzzer/alarm`, { cmd: "stop" });
    alarmActiveRef.current = false;
    buzzCooldownUntilRef.current = Date.now() + 300;
    await readBuzzerStatus(); // resync
  };

  async function setLEDs(red: OnOff, green: OnOff) {
    if (!syncLEDs || Date.now() < ledCooldownUntilRef.current) return;
    const last = lastLEDRef.current;
    if (last.red === red && last.green === green) return;
    try {
      await jgetPico(`/api/leds/set`, { red, green });
      lastLEDRef.current = { red, green };
      ledCooldownUntilRef.current = Date.now() + 300;
    } catch {}
  }

  // ─────────────────────── lifecycle ──────────────────────────
  useEffect(() => {
    if (!baseURL) return;
    (async () => {
      try {
        await readThermistor();
        await readMotorStatus();
        await readBuzzerStatus();
      } catch (e:any) { setError(e?.message || "Request failed"); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseURL]);

  useEffect(() => {
    if (!baseURL) return;
    const tick = async () => {
      if (inflightRef.current) return;
      inflightRef.current = true;
      try {
        const t = await readThermistor();
        if (t) {
          const temp = t.temp_c;
          const onAt = targetRef.current;
          const offAt = targetRef.current - hystRef.current;

          // LEDs: red ≥ target, green ≤ (target - hyst), off in between
          if (temp >= onAt) await setLEDs("on", "off");
          else if (temp <= offAt) await setLEDs("off", "on");
          else await setLEDs("off", "off");

          // Auto motor relay (no manual card)
          if (autoRef.current && Date.now() >= cooldownUntilRef.current) {
            if (motorRef.current !== "on" && temp >= onAt) await setMotorState("on");
            else if (motorRef.current !== "off" && temp <= offAt) await setMotorState("off");
          }

          // Buzzer safety
          if (buzzEnableRef.current) {
            const crit = critRef.current;
            const clr  = critRef.current - critHystRef.current;
            const bz = buzzerRef.current;

            if (temp >= crit) {
              if (!alarmActiveRef.current || !bz.alarm || bz.state !== "on") {
                await startAlarm();
              }
            } else if (temp <= clr) {
              // auto-clear only when not latched
              if (!buzzLatchRef.current && (alarmActiveRef.current || bz.alarm || bz.state === "on")) {
                await stopAlarm();
              }
            }
          } else {
            // safety disabled → ensure buzzer is off
            const bz = buzzerRef.current;
            if (alarmActiveRef.current || bz.alarm || bz.state === "on") {
              await stopAlarm();
            }
          }
        }
      } catch (e:any) {
        setError(e?.message || "Request failed");
      } finally {
        inflightRef.current = false;
      }
    };

    const id = setInterval(tick, 1500);
    tick();
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseURL, auto, syncLEDs, buzzEnable, buzzLatch]);

  async function safe<T>(fn: () => Promise<T>) {
    if (busy) return;
    setBusy(true);
    try { return await fn(); }
    catch (e:any) { setError(e?.message || "Request failed"); }
    finally { setBusy(false); }
  }

  // ─────────────────────── UI ──────────────────────────
  return (
    <main style={pageWrap}>
      {/* Header */}
      <div style={headerBar}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 4 }}>Thermo ⇄ Motor + Safety</h1>
          <p style={{ color: "#6b7280" }}>
            Motor auto ON/OFF around target; LEDs show zone; buzzer alarms at critical temp.
          </p>
        </div>
        <Link href="/pico" style={{ color: "#374151", textDecoration: "none" }}>← Back</Link>
      </div>

      {/* Connection / toggles */}
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={row}>
          <input
            placeholder="http://pico-w.local or 192.168.1.42"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            style={{ width: 320, padding: 10, border: "1px solid #e5e7eb", borderRadius: 10 }}
          />
          <button
            onClick={() => safe(async () => { await readThermistor(); await readMotorStatus(); await readBuzzerStatus(); })}
            style={btnDark}
          >
            Connect / Refresh
          </button>
          <span style={pill}>Motor: {motor === "unknown" ? "—" : motor.toUpperCase()}</span>
          <span style={pill}>Buzzer: {buzzer.alarm ? "ALARM" : buzzer.state.toUpperCase()}</span>
          <label style={{ ...row, color: "#374151", marginLeft: 8 }}>
            <input type="checkbox" checked={auto} onChange={(e)=>setAuto(e.target.checked)} />
            Auto motor (1.5s)
          </label>
          <label style={{ ...row, color: "#374151" }}>
            <input type="checkbox" checked={syncLEDs} onChange={(e)=>setSyncLEDs(e.target.checked)} />
            Sync LEDs
          </label>
        </div>
        {!baseURL && <div style={{ ...hint, marginTop: 8 }}>Enter the Pico URL/IP to avoid proxy errors like <code>Missing 'target'</code>.</div>}
      </div>

      {/* Content */}
      <div style={grid}>
        {/* Thermistor / thresholds */}
        <div style={card}>
          <div style={{ fontSize: 32 }}>🌡️</div>
          <div style={cardTitle}>Temperature</div>
          <div style={{ display: "grid", gap: 6, fontSize: 14, color: "#374151" }}>
            <div><span style={{ color: "#6b7280" }}>Temperature:</span> <b>{thermo ? thermo.temp_c.toFixed(2) : "—"} °C</b></div>
            <div><span style={{ color: "#6b7280" }}>Voltage:</span> {thermo ? thermo.voltage.toFixed(4) : "—"} V</div>
            <div><span style={{ color: "#6b7280" }}>Resistance:</span> {thermo ? Math.round(thermo.resistance_ohm) : "—"} Ω</div>
          </div>

          <div style={{ marginTop: 12 }}>
            <div style={{ ...row, justifyContent: "space-between" }}>
              <div style={cardDesc}>Target (°C)</div>
              <input type="number" inputMode="decimal" step={0.5} min={-40} max={150}
                value={targetC} onChange={(e)=>setTargetC(Number(e.target.value))}
                style={{ width: 110, padding: 10, border: "1px solid #e5e7eb", borderRadius: 10 }} />
            </div>
            <input type="range" min={0} max={100} step={0.5} value={targetC} onChange={(e)=>setTargetC(Number(e.target.value))} style={{ width: "100%" }} />
            <div style={{ ...row, justifyContent: "space-between", marginTop: 8 }}>
              <div style={cardDesc}>Hysteresis (°C)</div>
              <input type="number" inputMode="decimal" step={0.1} min={0} max={10}
                value={hyst} onChange={(e)=>setHyst(Number(e.target.value))}
                style={{ width: 110, padding: 10, border: "1px solid #e5e7eb", borderRadius: 10 }} />
            </div>
            <div style={{ ...hint, marginTop: 6 }}>
              Motor ON at ≥ {targetC.toFixed(1)} °C, OFF at ≤ {(targetC - hyst).toFixed(1)} °C. LEDs follow the same thresholds.
            </div>
          </div>

          <div style={{ marginTop: 8 }}>
            <button onClick={() => safe(readThermistor)} style={btnLight} disabled={!baseURL || busy}>Manual Read</button>
          </div>
        </div>

        {/* Safety buzzer */}
        <div style={card}>
          <div style={{ fontSize: 32 }}>🔔</div>
          <div style={cardTitle}>Safety Buzzer (Critical)</div>
          <div style={{ ...cardDesc, marginBottom: 8 }}>
            Starts <code>/api/buzzer/alarm</code> when temp ≥ critical. Auto-stops at ≤ (critical − hysteresis) unless latched.
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ ...row, justifyContent: "space-between" }}>
              <div style={cardDesc}>Critical (°C)</div>
              <input type="number" inputMode="decimal" step={0.5} min={-40} max={150}
                value={critC} onChange={(e)=>setCritC(Number(e.target.value))}
                style={{ width: 110, padding: 10, border: "1px solid #e5e7eb", borderRadius: 10 }} />
            </div>

            <div style={{ ...row, justifyContent: "space-between" }}>
              <div style={cardDesc}>Critical hysteresis (°C)</div>
              <input type="number" inputMode="decimal" step={0.1} min={0} max={10}
                value={critHyst} onChange={(e)=>setCritHyst(Number(e.target.value))}
                style={{ width: 110, padding: 10, border: "1px solid #e5e7eb", borderRadius: 10 }} />
            </div>

            <div style={{ ...row, justifyContent: "space-between" }}>
              <div style={cardDesc}>Pattern (on/off ms)</div>
              <div style={{ display: "flex", gap: 8 }}>
                <input type="number" min={10} max={5000} step={10}
                  value={buzzOnMs} onChange={(e)=>setBuzzOnMs(Number(e.target.value))}
                  style={{ width: 110, padding: 10, border: "1px solid #e5e7eb", borderRadius: 10 }} />
                <input type="number" min={10} max={5000} step={10}
                  value={buzzOffMs} onChange={(e)=>setBuzzOffMs(Number(e.target.value))}
                  style={{ width: 110, padding: 10, border: "1px solid #e5e7eb", borderRadius: 10 }} />
              </div>
            </div>

            <div style={row}>
              <label style={{ ...row, color: "#374151" }}>
                <input type="checkbox" checked={buzzEnable} onChange={(e)=>setBuzzEnable(e.target.checked)} />
                Enable buzzer safety
              </label>
              <label style={{ ...row, color: "#374151" }}>
                <input type="checkbox" checked={buzzLatch} onChange={(e)=>setBuzzLatch(e.target.checked)} />
                Latch until Silence
              </label>
              <button
                onClick={() => safe(async () => { await stopAlarm(); })}
                style={btnWarn}
                disabled={!baseURL || busy}
                title="Stop alarm now"
              >
                Silence
              </button>
              <button
                onClick={() => safe(async () => { await startAlarm(); })}
                style={btnSafe}
                disabled={!baseURL || busy}
                title="Test alarm now"
              >
                Test
              </button>
            </div>

            <div style={{ ...hint }}>
              Alarm starts at ≥ {critC.toFixed(1)} °C. Auto-stops at ≤ {(critC - critHyst).toFixed(1)} °C
              {buzzLatch ? " (latch is ON: requires Silence)" : ""}.
            </div>
          </div>
        </div>
      </div>

      {!!error && (
        <div style={errorBox}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Request failed</div>
          <div style={{ fontFamily: "ui-monospace, Menlo, monospace" }}>{error}</div>
        </div>
      )}
    </main>
  );
}
