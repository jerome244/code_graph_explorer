// app/pico/thermo-motor/components/ThermoMotorProtected.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import { btnDark, btnLight, btnSafe, btnWarn, card, cardDesc, cardTitle, grid, hint, pill, row, errorBox } from "./ui";
import MotorAnim from "./MotorAnim";
import LedDot from "./LedDot";
import { jgetPico } from "../lib/api";
import type { OnOff, MotorState, Thermo, DhtReading } from "../lib/types";

export default function ThermoMotorProtected({
  baseURL,
  input,
  setInput,
  logger,
  onRelock,
}: {
  baseURL: string;
  input: string;
  setInput: (v: string) => void;
  logger: { push: Function; unread: { warn: number; err: number }; logs: any[] };
  onRelock: () => void;
}) {
  const [thermo, setThermo] = useState<Thermo | null>(null);
  const [humidity, setHumidity] = useState<number | null>(null);
  const [motor, setMotor] = useState<MotorState>("unknown");
  const [buzzer, setBuzzer] = useState<{ state: OnOff; alarm: boolean }>({ state: "off", alarm: false });
  const [error, setError] = useState("");

  const [auto, setAuto] = useState(true);
  const [targetC, setTargetC] = useState(30);
  const [hyst, setHyst] = useState(1.0);
  const [syncLEDs, setSyncLEDs] = useState(true);

  const [critC, setCritC] = useState(40);
  const [critHyst, setCritHyst] = useState(0.5);
  const [buzzOnMs, setBuzzOnMs] = useState(400);
  const [buzzOffMs, setBuzzOffMs] = useState(400);
  const [buzzEnable, setBuzzEnable] = useState(true);
  const [buzzLatch, setBuzzLatch] = useState(false);

  const [busy, setBusy] = useState(false);

  // ── LCD state (NEW) ─────────────────────────────────────────
  const [lcdReady, setLcdReady] = useState<boolean>(false);
  const [lcdBacklight, setLcdBacklight] = useState<boolean | null>(null);

  // Refs/guards
  const autoRef   = useRef(auto);    useEffect(()=>{autoRef.current=auto;},[auto]);
  const motorRef  = useRef<MotorState>(motor); useEffect(()=>{motorRef.current=motor;},[motor]);
  const targetRef = useRef(targetC); useEffect(()=>{targetRef.current=targetC;},[targetC]);
  const hystRef   = useRef(hyst);    useEffect(()=>{hystRef.current=hyst;},[hyst]);

  const critRef = useRef(critC);         useEffect(()=>{critRef.current=critC;},[critC]);
  const critHystRef = useRef(critHyst);  useEffect(()=>{critHystRef.current=critHyst;},[critHyst]);

  const buzzEnableRef = useRef(buzzEnable); useEffect(()=>{buzzEnableRef.current=buzzEnable;},[buzzEnable]);
  const buzzLatchRef  = useRef(buzzLatch);  useEffect(()=>{buzzLatchRef.current=buzzLatch;},[buzzLatch]);
  const buzzOnRef = useRef(buzzOnMs);    useEffect(()=>{buzzOnRef.current=buzzOnMs;},[buzzOnMs]);
  const buzzOffRef = useRef(buzzOffMs);  useEffect(()=>{buzzOffRef.current=buzzOffMs;},[buzzOffMs]);

  const inflightRef = useRef(false);
  const cooldownUntilRef = useRef(0);
  const backoffUntilRef  = useRef(0);
  const alarmActiveRef   = useRef(false);
  const buzzCooldownUntilRef = useRef(0);

  const lastLEDRef = useRef<{ red: OnOff; green: OnOff }>({ red: "off", green: "off" });
  const ledCooldownUntilRef = useRef(0);

  // Silence latch (keeps alarm off until safe)
  const silencedUntilSafeRef = useRef(false);
  const lastSilenceLogRef = useRef(0);

  // Helpers
  async function jget<T=any>(p: string, qs?: Record<string,string|number>) { return jgetPico<T>(baseURL, p, qs); }
  async function safe<T>(fn: () => Promise<T>) {
    if (busy) return;
    setBusy(true);
    try { return await fn(); }
    catch (e:any) { setError(e?.message || "Request failed"); logger.push("system","error","Action failed",{error:String(e?.message||e)}); }
    finally { setBusy(false); }
  }

  // ── LCD helpers (NEW) ───────────────────────────────────────
  const lcdStatus = async () => {
    const st = await jget<{ready:boolean; backlight:boolean}>(`/api/lcd/status`);
    setLcdReady(!!st.ready);
    if (typeof st.backlight === "boolean") setLcdBacklight(st.backlight);
    return st;
  };
  const lcdEnsure = async () => {
    try {
      const st = await lcdStatus();
      if (!st.ready) {
        await jget(`/api/lcd/init`, { addr: "0x27", cols: 16, rows: 2 });
        await lcdStatus();
      }
    } catch {/* ignore */}
  };
  const lcdBacklightSet = async (state: "on" | "off") => {
    await jget(`/api/lcd/backlight`, { state });
    setLcdBacklight(state === "on");
    logger.push("system", "info", `LCD backlight ${state.toUpperCase()}`);
  };
  const lcdBacklightToggle = async () => {
    await lcdEnsure();
    const wantOn = !(lcdBacklight ?? false);
    await lcdBacklightSet(wantOn ? "on" : "off");
  };

  // API
  const readThermistor = async () => {
    if (Date.now() < backoffUntilRef.current) return thermo;
    try {
      const js = await jget<Thermo>(`/api/thermistor/read`);
      setThermo(js); setError(""); return js;
    } catch (e:any) {
      if (/^5\d\d/.test(String(e?.message||""))) backoffUntilRef.current = Date.now() + 2000;
      throw e;
    }
  };
  const readHumidity = async () => {
    try {
      const js = await jget<DhtReading>(`/api/dht11/read`, { settle_ms: 0 });
      if (js.valid && typeof js.humidity === "number") setHumidity(js.humidity);
      return js;
    } catch { /* ignore */ }
  };
  const readMotorStatus = async () => {
    const js = await jget<{state:"on"|"off"}>(`/api/relay/status`);
    setMotor(js.state); setError(""); return js.state as MotorState;
  };
  const setMotorState = async (state:"on"|"off") => {
    if (Date.now() < cooldownUntilRef.current) return;
    await jget(`/api/relay`, { state });
    setMotor(state); motorRef.current = state;
    cooldownUntilRef.current = Date.now() + 2500;
    // Log with temperature + humidity snapshot
    logger.push(
      "motor",
      "info",
      `Motor ${state.toUpperCase()}`,
      {
        state,
        at_temp_c: typeof thermo?.temp_c === "number" ? Number(thermo!.temp_c.toFixed(2)) : null,
        humidity: typeof humidity === "number" ? Number(humidity.toFixed(1)) : null,
      }
    );
    setTimeout(() => { readMotorStatus().catch(()=>{}); }, 1000);
  };
  const readBuzzerStatus = async () => {
    const js = await jget<{state:OnOff; alarm:boolean}>(`/api/buzzer/status`);
    setBuzzer(js); return js;
  };
  const startAlarm = async () => {
    if (Date.now() < buzzCooldownUntilRef.current) return;
    silencedUntilSafeRef.current = false; // clear silence latch
    await jget(`/api/buzzer/alarm`, { cmd: "start", on_ms: buzzOnRef.current, off_ms: buzzOffRef.current });
    alarmActiveRef.current = true;
    buzzCooldownUntilRef.current = Date.now() + 300;
    logger.push("buzzer","warn","Alarm START", { on_ms: buzzOnRef.current, off_ms: buzzOffRef.current });
    await readBuzzerStatus();
  };
  const stopAlarm = async (opts?: { fromSilence?: boolean }) => {
    if (Date.now() < buzzCooldownUntilRef.current) return;
    await jget(`/api/buzzer/alarm`, { cmd: "stop" });
    alarmActiveRef.current = false;
    buzzCooldownUntilRef.current = Date.now() + 300;
    if (opts?.fromSilence) {
      silencedUntilSafeRef.current = true;
      logger.push("buzzer","info","Alarm SILENCED (latched until safe)");
    } else {
      logger.push("buzzer","info","Alarm STOP");
    }
    await readBuzzerStatus();
  };
  async function setLEDs(red: OnOff, green: OnOff) {
    if (!syncLEDs || Date.now() < ledCooldownUntilRef.current) return;
    const last = lastLEDRef.current;
    if (last.red === red && last.green === green) return;
    try {
      await jget(`/api/leds/set`, { red, green });
      lastLEDRef.current = { red, green };
      ledCooldownUntilRef.current = Date.now() + 300;
    } catch {}
  }

  // Initial
  useEffect(() => {
    if (!baseURL) return;
    (async () => {
      try {
        await readThermistor();
        await readHumidity();
        await readMotorStatus();
        await readBuzzerStatus();
        await lcdEnsure();           // NEW: get LCD state on connect
      } catch (e:any) {
        setError(e?.message || "Request failed");
        logger.push("system","error","Initial connect failed",{error:String(e?.message||e)});
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseURL]);

  // Poll loop
  useEffect(() => {
    if (!baseURL) return;
    const tick = async () => {
      if (inflightRef.current) return;
      inflightRef.current = true;
      try {
        const t = await readThermistor();
        await readHumidity();
        if (t) {
          const temp = t.temp_c;
          const onAt = targetRef.current;
          const offAt = targetRef.current - hystRef.current;

          // LEDs
          if (temp >= onAt) await setLEDs("on", "off");
          else if (temp <= offAt) await setLEDs("off", "on");
          else await setLEDs("off", "off");

          // Motor auto
          if (autoRef.current && Date.now() >= cooldownUntilRef.current) {
            if (motorRef.current !== "on" && temp >= onAt) await setMotorState("on");
            else if (motorRef.current !== "off" && temp <= offAt) await setMotorState("off");
          }

          // Buzzer with silence latch
          if (buzzEnableRef.current) {
            const crit = critRef.current;
            const clr  = critRef.current - critHystRef.current;

            if (temp >= crit) {
              if (silencedUntilSafeRef.current) {
                const now = Date.now();
                if (now - lastSilenceLogRef.current > 5000) {
                  logger.push("buzzer","warn","Alarm silenced, waiting for safe temp", { temp_c: Number(temp.toFixed(2)), clear_at_c: Number(clr.toFixed(2)) });
                  lastSilenceLogRef.current = now;
                }
              } else if (!alarmActiveRef.current || !buzzer.alarm || buzzer.state !== "on") {
                await startAlarm();
              }
            } else if (temp <= clr) {
              if (silencedUntilSafeRef.current) silencedUntilSafeRef.current = false;
              if (!buzzLatchRef.current && (alarmActiveRef.current || buzzer.alarm || buzzer.state === "on")) {
                await stopAlarm();
              }
            }
          } else {
            if (alarmActiveRef.current || buzzer.alarm || buzzer.state === "on") await stopAlarm();
            silencedUntilSafeRef.current = false;
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

  const temp = thermo?.temp_c ?? null;
  const ledRedOn   = temp !== null && temp >= targetC;
  const ledGreenOn = temp !== null && temp <= (targetC - hyst);

  return (
    <>
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={row}>
          <input
            placeholder="http://pico-w.local or 192.168.1.42"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            style={{ width: 320, padding: 10, border: "1px solid #e5e7eb", borderRadius: 10 }}
          />
          <button onClick={() => safe(async () => { await readThermistor(); await readHumidity(); await readMotorStatus(); await readBuzzerStatus(); await lcdEnsure(); })} style={btnDark}>
            Connect / Refresh
          </button>
          <span style={pill}>Motor: {motor === "unknown" ? "—" : motor.toUpperCase()}</span>
          <span style={pill}>Buzzer: {buzzer.alarm ? "ALARM" : buzzer.state.toUpperCase()}</span>
          <label style={{ ...row, color: "#374151", marginLeft: 8 }}>
            <input type="checkbox" checked={auto} onChange={(e)=>setAuto(e.target.checked)} /> Auto motor
          </label>
          <label style={{ ...row, color: "#374151" }}>
            <input type="checkbox" checked={syncLEDs} onChange={(e)=>setSyncLEDs(e.target.checked)} /> Sync LEDs
          </label>
          <button onClick={onRelock} style={btnLight} title="Re-lock this page">Lock Now</button>

          {/* NEW: LCD backlight toggle */}
          <button
            onClick={() => safe(lcdBacklightToggle)}
            style={btnLight}
            title={lcdReady ? "Toggle LCD backlight" : "LCD not initialized"}
            disabled={!baseURL || busy}
          >
            {lcdBacklight == null ? "LCD Light" : (lcdBacklight ? "LCD Light OFF" : "LCD Light ON")}
          </button>
        </div>
      </div>

      <div style={grid}>
        {/* Thermistor */}
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
          </div>
        </div>

        {/* Humidity (DHT11) — humidity only */}
        <div style={card}>
          <div style={{ fontSize: 32 }}>💧</div>
          <div style={cardTitle}>Humidity (DHT11)</div>
          <div style={{ ...cardDesc, marginBottom: 8 }}>
            Reads from <code>/api/dht11/read</code>, shows <b>humidity only</b>.
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#111827" }}>
            {humidity == null ? "—" : `${humidity.toFixed(1)} %`}
          </div>
          <div style={{ ...row, marginTop: 10 }}>
            <button onClick={() => safe(readHumidity)} style={btnLight} disabled={!baseURL || busy}>Read humidity</button>
          </div>
        </div>

        {/* Safety buzzer */}
        <div style={card}>
          <div style={{ fontSize: 32 }}>🔔</div>
          <div style={cardTitle}>Safety Buzzer (Critical)</div>
          <div style={{ ...cardDesc, marginBottom: 8 }}>
            Starts at ≥ critical. Auto-stops at ≤ (critical − hysteresis). “Silence” holds OFF until safe.
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
                <input
                  type="checkbox"
                  checked={buzzEnable}
                  onChange={(e)=>{ setBuzzEnable(e.target.checked); if (!e.target.checked) silencedUntilSafeRef.current = false; }}
                />
                Enable buzzer safety
              </label>
              <label style={{ ...row, color: "#374151" }}>
                <input type="checkbox" checked={buzzLatch} onChange={(e)=>setBuzzLatch(e.target.checked)} />
                Latch until Silence
              </label>
              <button onClick={() => safe(() => stopAlarm({ fromSilence: true }))} style={btnWarn}>Silence</button>
              <button onClick={() => safe(startAlarm)} style={btnSafe}>Test</button>
            </div>
            <div style={hint}>
              Alarm ≥ {critC.toFixed(1)}°C, auto-clear ≤ {(critC - critHyst).toFixed(1)}°C.
              “Silence” prevents restart until temp ≤ clear.
            </div>
          </div>
        </div>

        {/* Indicators */}
        <div style={card}>
          <div style={{ fontSize: 32 }}>🎛️</div>
          <div style={cardTitle}>Live Indicators</div>
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <MotorAnim running={motor === "on"} />
              <div style={{ color:"#6b7280", fontSize: 13, lineHeight: 1.4 }}>
                Motor mirrors relay state.<br/>
                Auto: ON ≥ {targetC.toFixed(1)}°C, OFF ≤ {(targetC - hyst).toFixed(1)}°C.
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap:"wrap" }}>
              <LedDot color="red"   on={temp !== null && temp >= targetC} label="RED" />
              <LedDot color="green" on={temp !== null && temp <= (targetC - hyst)} label="GREEN" />
            </div>
          </div>
        </div>
      </div>

      {!!error && (
        <div style={errorBox}>
          <b>Request failed</b>
          <div style={{ fontFamily: "ui-monospace, Menlo, monospace" }}>{error}</div>
        </div>
      )}
    </>
  );
}
