"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

// ──────────────────────────────────────────────────────────────────────────────
// Shared localStorage key so pages share the Pico base URL (same as your pages)
const LS_KEY = "pico_baseURL";

function useBaseURL() {
  const [raw, setRaw] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem(LS_KEY);
    if (saved) setRaw(saved);
  }, []);

  const baseURL = useMemo(() => {
    const s = raw.trim();
    if (!s) return "";
    if (/^https?:\/\//i.test(s)) return s.replace(/\/$/, "");
    return `http://${s}`;
  }, [raw]);

  const save = (v: string) => {
    setRaw(v);
    localStorage.setItem(LS_KEY, v);
  };

  return { input: raw, setInput: save, baseURL } as const;
}

// ──────────────────────────────────────────────────────────────────────────────
// Types
type Thermo = {
  raw: number;
  raw_bits: number;
  voltage: number;
  resistance_ohm: number;
  temp_c: number;
};

type MotorState = "on" | "off" | "unknown";

// ──────────────────────────────────────────────────────────────────────────────
// Small style system (matches your look, a touch more polished)
const pageWrap: React.CSSProperties = { maxWidth: 980, margin: "32px auto", padding: 24 };
const headerBar: React.CSSProperties = {
  display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 16,
};
const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
  gap: 16,
  alignItems: "start",
};
const card: React.CSSProperties = {
  display: "grid",
  gap: 10,
  padding: 16,
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  background: "#fff",
  boxShadow: "0 6px 16px rgba(0,0,0,0.06)",
};
const cardTitle: React.CSSProperties = { fontSize: 18, fontWeight: 700, color: "#111827" };
const cardDesc: React.CSSProperties = { color: "#6b7280", fontSize: 14 };
const row: React.CSSProperties = { display: "flex", gap: 8, alignItems: "center" };
const hint: React.CSSProperties = { color: "#6b7280", fontSize: 12 };
const pill: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 999,
  border: "1px solid #e5e7eb",
  background: "#f9fafb",
  fontSize: 12,
  color: "#374151",
  fontWeight: 600,
};

const btnBase: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  fontSize: 14,
  fontWeight: 600,
  border: "1px solid transparent",
  cursor: "pointer",
};
const btnDark: React.CSSProperties = { ...btnBase, color: "#fff", background: "#111827" };
const btnGreen: React.CSSProperties = { ...btnBase, color: "#fff", background: "#059669" };
const btnRed: React.CSSProperties = { ...btnBase, color: "#fff", background: "#dc2626" };
const btnLight: React.CSSProperties = {
  ...btnBase, color: "#111827", background: "#fff", border: "1px solid #e5e7eb",
};

const errorBox: React.CSSProperties = {
  background: "#fef2f2",
  border: "1px solid #fecaca",
  color: "#991b1b",
  padding: 12,
  borderRadius: 10,
  marginTop: 12,
  fontSize: 14,
};

// ──────────────────────────────────────────────────────────────────────────────
// Page
export default function ThermoMotorPage() {
  const { input, setInput, baseURL } = useBaseURL();

  const [thermo, setThermo] = useState<Thermo | null>(null);
  const [motor, setMotor] = useState<MotorState>("unknown");
  const [error, setError] = useState<string>("");

  const [auto, setAuto] = useState(true);
  const [targetC, setTargetC] = useState(30);
  const [hyst, setHyst] = useState(1.0);

  const [busy, setBusy] = useState(false);

  // Refs to avoid stale closures and add guards
  const targetRef = useRef(targetC);
  const hystRef = useRef(hyst);
  const autoRef = useRef(auto);
  const motorRef = useRef<MotorState>(motor);
  const inflightRef = useRef(false);           // prevents overlapping polls
  const cooldownUntilRef = useRef(0);          // lockout after switching
  const backoffUntilRef = useRef(0);           // quiet time after 5xx

  useEffect(() => { targetRef.current = targetC; }, [targetC]);
  useEffect(() => { hystRef.current = hyst; }, [hyst]);
  useEffect(() => { autoRef.current = auto; }, [auto]);
  useEffect(() => { motorRef.current = motor; }, [motor]);

  // ─────────────────────── proxy helper (header + query target) ──────────────
  async function jgetPico<T = any>(
    picoPath: string,
    qs?: Record<string, string | number>
  ): Promise<T> {
    if (!baseURL) throw new Error("Missing Pico base URL"); // avoids 'Missing target'
    const usp = new URLSearchParams();
    if (qs) for (const [k, v] of Object.entries(qs)) usp.set(k, String(v));
    if (!usp.has("t")) usp.set("t", "12000");         // longer timeout
    usp.set("target", baseURL);                       // <— ensure proxy always gets target

    const url = `/api/pico${picoPath}${usp.toString() ? `?${usp.toString()}` : ""}`;
    const r = await fetch(url, {
      method: "GET",
      headers: { "X-Pico-Base": baseURL },
      cache: "no-store",
      keepalive: false,
    });
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return (await r.json()) as T;
  }

  // ───────────────────────────────── API calls ───────────────────────────────
  const readThermistor = async () => {
    // Gentle backoff after a recent 5xx to avoid cascades
    if (Date.now() < backoffUntilRef.current) return thermo;
    try {
      const js = await jgetPico<Thermo>(`/api/thermistor/read`);
      setThermo(js);
      setError("");
      return js;
    } catch (e: any) {
      const msg = e?.message || "";
      if (/^5\d\d/.test(msg)) backoffUntilRef.current = Date.now() + 2000;
      throw e;
    }
  };

  const readMotorStatus = async () => {
    const js = await jgetPico<{ state: "on" | "off" }>(`/api/relay/status`);
    setMotor(js.state);
    setError("");
    return js.state as MotorState;
  };

  const setMotorState = async (state: "on" | "off") => {
    // Cooldown to prevent immediate flip-flop and allow EMI to settle
    if (Date.now() < cooldownUntilRef.current) return;
    await jgetPico(`/api/relay`, { state });
    setMotor(state);
    motorRef.current = state;
    cooldownUntilRef.current = Date.now() + 2500; // 2.5s lockout after switching
    // Delay the *next* status read so we don't hammer right after the coil kicks
    setTimeout(() => { readMotorStatus().catch(() => {}); }, 1200);
  };

  // ───────────────────────────── lifecycle ───────────────────────────────────
  // Refresh status when base changes (sequential, not parallel)
  useEffect(() => {
    if (!baseURL) return;
    (async () => {
      try {
        await readThermistor();
        await readMotorStatus();
      } catch (e: any) {
        setError(e?.message || "Request failed");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseURL]);

  // Auto loop: poll every 1.5s and apply control logic; no overlaps
  useEffect(() => {
    if (!baseURL) return;
    const tick = async () => {
      if (inflightRef.current) return;
      inflightRef.current = true;
      try {
        const t = await readThermistor();
        if (t && autoRef.current) {
          const temp = t.temp_c;
          const onAt = targetRef.current;
          const offAt = targetRef.current - hystRef.current;

          if (Date.now() >= cooldownUntilRef.current) {
            if (motorRef.current !== "on" && temp >= onAt) {
              await setMotorState("on");
            } else if (motorRef.current !== "off" && temp <= offAt) {
              await setMotorState("off");
            }
          }
        }
      } catch (e: any) {
        setError(e?.message || "Request failed");
      } finally {
        inflightRef.current = false;
      }
    };

    const id = setInterval(tick, 1500);
    tick(); // kick once immediately
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseURL, auto]);

  // Helper to wrap buttons with busy flag
  async function safe<T>(fn: () => Promise<T>) {
    if (busy) return;
    setBusy(true);
    try { return await fn(); }
    catch (e: any) { setError(e?.message || "Request failed"); }
    finally { setBusy(false); }
  }

  // ─────────────────────────────────── UI ────────────────────────────────────
  return (
    <main style={pageWrap}>
      {/* Header */}
      <div style={headerBar}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 4 }}>
            Thermo ⇄ Motor (Auto)
          </h1>
          <p style={{ color: "#6b7280" }}>
            Set a temperature; motor turns <b>ON</b> at ≥ target and <b>OFF</b> below (target − hysteresis).
          </p>
        </div>
        <Link href="/pico" style={{ color: "#374151", textDecoration: "none" }}>
          ← Back
        </Link>
      </div>

      {/* Connection + Controls */}
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ ...row, justifyContent: "space-between", flexWrap: "wrap" }}>
          <div style={{ ...row, flexWrap: "wrap" }}>
            <input
              placeholder="http://pico-w.local or 192.168.1.42"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              style={{ width: 320, padding: 10, border: "1px solid #e5e7eb", borderRadius: 10 }}
            />
            <button
              onClick={() => safe(async () => {
                await readThermistor();
                await readMotorStatus();
              })}
              style={btnDark}
            >
              Connect / Refresh
            </button>
            <span style={pill}>
              Motor: {motor === "unknown" ? "—" : motor.toUpperCase()}
            </span>
            <label style={{ ...row, color: "#374151", marginLeft: 8 }}>
              <input
                type="checkbox"
                checked={auto}
                onChange={(e) => setAuto(e.target.checked)}
              />
              Auto (1.5s)
            </label>
          </div>
        </div>

        {!baseURL && (
          <div style={{ ...hint, marginTop: 8 }}>
            Enter your Pico’s URL/IP above to avoid proxy errors like <code>Missing 'target'</code>.
          </div>
        )}
      </div>

      {/* Content grid */}
      <div style={grid}>
        {/* Thermistor card */}
        <div style={card}>
          <div style={{ fontSize: 32 }}>🌡️</div>
          <div style={cardTitle}>Thermistor</div>
          <div style={{ display: "grid", gap: 6, fontSize: 14, color: "#374151" }}>
            <div>
              <span style={{ color: "#6b7280" }}>Temperature:</span>{" "}
              <b>{thermo ? thermo.temp_c.toFixed(2) : "—"} °C</b>
            </div>
            <div><span style={{ color: "#6b7280" }}>ADC:</span> {thermo?.raw ?? "—"} / {thermo?.raw_bits ?? "—"}</div>
            <div><span style={{ color: "#6b7280" }}>Voltage:</span> {thermo ? thermo.voltage.toFixed(4) : "—"} V</div>
            <div><span style={{ color: "#6b7280" }}>Resistance:</span> {thermo ? Math.round(thermo.resistance_ohm) : "—"} Ω</div>
          </div>

          <div style={{ marginTop: 10, color: "#6b7280", fontSize: 13 }}>
            Divider: 3V3 → <b>NTC</b> → node → <b>10k</b> → GND (node → ADC GP26).
          </div>

          <div style={{ marginTop: 12 }}>
            <div style={{ ...row, justifyContent: "space-between" }}>
              <div style={cardDesc}>Target (°C):</div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="number"
                  inputMode="decimal"
                  step={0.5}
                  min={-40}
                  max={150}
                  value={targetC}
                  onChange={(e) => setTargetC(Number(e.target.value))}
                  style={{ width: 100, padding: 10, border: "1px solid #e5e7eb", borderRadius: 10 }}
                />
              </div>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={0.5}
              value={targetC}
              onChange={(e) => setTargetC(Number(e.target.value))}
              style={{ width: "100%" }}
            />
            <div style={{ ...row, justifyContent: "space-between", marginTop: 8 }}>
              <div style={cardDesc}>Hysteresis (°C):</div>
              <input
                type="number"
                inputMode="decimal"
                step={0.1}
                min={0}
                max={10}
                value={hyst}
                onChange={(e) => setHyst(Number(e.target.value))}
                style={{ width: 100, padding: 10, border: "1px solid #e5e7eb", borderRadius: 10 }}
              />
            </div>
            <div style={{ ...hint, marginTop: 6 }}>
              Motor turns <b>ON</b> at ≥ {targetC.toFixed(1)}°C and <b>OFF</b> at ≤ {(targetC - hyst).toFixed(1)}°C.
            </div>
          </div>

          <div style={{ marginTop: 8 }}>
            <button onClick={() => safe(readThermistor)} style={btnLight} disabled={!baseURL || busy}>
              Manual Read
            </button>
          </div>
        </div>

        {/* Motor card */}
        <div style={card}>
          <div style={{ fontSize: 32 }}>🛞</div>
          <div style={cardTitle}>Motor (Relay)</div>
          <div style={{ ...cardDesc, marginBottom: 8 }}>
            Endpoints: <code>/api/relay/status</code>, <code>/api/relay?state=on|off</code>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              disabled={!baseURL || busy || auto}
              onClick={() => safe(async () => { await setMotorState("on"); })}
              style={btnGreen}
              title={auto ? "Disable Auto to use manual controls" : ""}
            >
              Start
            </button>

            <button
              disabled={!baseURL || busy || auto}
              onClick={() => safe(async () => { await setMotorState("off"); })}
              style={btnRed}
              title={auto ? "Disable Auto to use manual controls" : ""}
            >
              Stop
            </button>

            <button
              disabled={!baseURL || busy}
              onClick={() => safe(readMotorStatus)}
              style={btnLight}
            >
              Refresh Status
            </button>
          </div>

          <div style={{ marginTop: 12, fontSize: 13, color: "#6b7280" }}>
            <ul style={{ paddingLeft: 18, margin: 0 }}>
              <li>Hysteresis and a short cooldown prevent rapid on/off cycling.</li>
              <li>For stability with motors: separate supplies, flyback diodes, and bulk caps.</li>
            </ul>
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
