"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";

// Shared localStorage key so pages share the Pico base URL
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

export default function PicoMotor() {
  const { input, setInput, baseURL } = useBaseURL();
  const [state, setState] = useState<"on" | "off" | "unknown">("unknown");
  const [pulseMs, setPulseMs] = useState(500);
  const [error, setError] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const disabled = !baseURL || busy;

  // Proxy call via /api/pico with X-Pico-Base header
  async function jgetPico<T = any>(
    picoPath: string,
    qs?: Record<string, string | number>
  ): Promise<T> {
    const usp = new URLSearchParams();
    if (qs) for (const [k, v] of Object.entries(qs)) usp.set(k, String(v));
    // Add ?t=8000 to ask proxy for 8s timeout (optional)
    if (!usp.has("t")) usp.set("t", "8000");
    const url = `/api/pico${picoPath}${usp.toString() ? `?${usp.toString()}` : ""}`;
    const r = await fetch(url, { method: "GET", headers: { "X-Pico-Base": baseURL } });
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return (await r.json()) as T;
  }

  async function safeCall<T>(fn: () => Promise<T>) {
    if (busy) return;
    setBusy(true);
    try {
      return await fn();
    } catch (e: any) {
      setError(e?.message || "Request failed");
    } finally {
      setBusy(false);
    }
  }

  const refresh = async () => {
    if (!baseURL) return;
    try {
      const js = await jgetPico<{ state: "on" | "off" }>(`/api/relay/status`);
      setState(js.state);
      setError("");
    } catch (e: any) {
      setState("unknown");
      setError(e?.message || "Failed to fetch status");
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseURL]);

  return (
    <main style={{ maxWidth: 900, margin: "32px auto", padding: 24 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 4 }}>
            Motor (Relay)
          </h1>
          <p style={{ color: "#6b7280" }}>
            Control a 3.3 V relay coil via NPN transistor to switch your motor.
          </p>
        </div>
        <Link href="/pico" style={{ color: "#374151", textDecoration: "none" }}>
          ← Back
        </Link>
      </div>

      {/* Connection bar */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16 }}>
        <input
          placeholder="http://pico-w.local or 192.168.1.42"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          style={{ width: 320, padding: 10, border: "1px solid #e5e7eb", borderRadius: 10 }}
        />
        <button onClick={() => safeCall(refresh)} style={btnDark} disabled={busy}>
          Ping
        </button>
        <span style={{ color: "#6b7280", fontSize: 12 }}>
          Status: <b>{state}</b>
        </span>
      </div>

      {/* Error box */}
      {!!error && (
        <div style={errorBox}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Request failed</div>
          <div style={{ fontFamily: "ui-monospace, Menlo, monospace" }}>{error}</div>
        </div>
      )}

      {/* Card */}
      <div style={cardStyle}>
        <div style={{ fontSize: 32 }}>🛞</div>
        <div style={cardTitle}>Relay & Motor</div>
        <div style={{ ...cardDesc, marginBottom: 8 }}>
          Proxied via <code>/api/pico</code>. Endpoints:{" "}
          <code>/api/relay/status</code>, <code>/api/relay?state=on|off</code>,{" "}
          <code>/api/relay/pulse?ms=500</code>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            disabled={disabled}
            onClick={() =>
              safeCall(async () => {
                await jgetPico(`/api/relay`, { state: "on" });
                await refresh();
              })
            }
            style={btnGreen}
          >
            ON
          </button>

          <button
            disabled={disabled}
            onClick={() =>
              safeCall(async () => {
                await jgetPico(`/api/relay`, { state: "off" });
                await refresh();
              })
            }
            style={btnRed}
          >
            OFF
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="number"
              min={20}
              max={10000}
              step={20}
              value={pulseMs}
              onChange={(e) => setPulseMs(Number(e.target.value))}
              style={{ width: 110, padding: 10, border: "1px solid #e5e7eb", borderRadius: 10 }}
            />
            <button
              disabled={disabled}
              onClick={() =>
                safeCall(async () => {
                  await jgetPico(`/api/relay/pulse`, { ms: pulseMs });
                  await refresh();
                })
              }
              style={btnDark}
            >
              Pulse
            </button>
          </div>
        </div>

        <div style={{ marginTop: 16, fontSize: 13, color: "#6b7280" }}>
          <ul style={{ paddingLeft: 18, margin: 0 }}>
            <li>Low-side NPN: GPIO15 → ~1 kΩ → base; emitter → GND; collector → coil.</li>
            <li>Flyback diode across coil (stripe to +3.3 V, other end to collector/coil node).</li>
            <li>
              Motor on relay contacts (COM/NO). Consider a diode across the motor (DC) and use a
              separate supply if current is high.
            </li>
          </ul>
        </div>
      </div>
    </main>
  );
}

const cardStyle: React.CSSProperties = {
  display: "grid",
  gap: 8,
  padding: 16,
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  background: "#fff",
  boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
};
const cardTitle: React.CSSProperties = { fontSize: 18, fontWeight: 700, color: "#111827" };
const cardDesc: React.CSSProperties = { color: "#6b7280", fontSize: 14 };

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

const errorBox: React.CSSProperties = {
  background: "#fef2f2",
  border: "1px solid #fecaca",
  color: "#991b1b",
  padding: 12,
  borderRadius: 10,
  marginBottom: 12,
  fontSize: 14,
};
