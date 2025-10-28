"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

const LS_KEY = "pico_baseURL";

function useBaseURL() {
  const [raw, setRaw] = useState("");
  useEffect(() => { const s = localStorage.getItem(LS_KEY); if (s) setRaw(s); }, []);
  const baseURL = useMemo(() => {
    const s = raw.trim(); if (!s) return "";
    return /^https?:\/\//i.test(s) ? s.replace(/\/$/, "") : `http://${s}`;
  }, [raw]);
  const save = (v: string) => { setRaw(v); localStorage.setItem(LS_KEY, v); };
  return { input: raw, setInput: save, baseURL } as const;
}

type Thermo = {
  raw: number; raw_bits: number; voltage: number; resistance_ohm: number; temp_c: number;
};

export default function PicoThermistor() {
  const { input, setInput, baseURL } = useBaseURL();
  const [data, setData] = useState<Thermo | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [auto, setAuto] = useState(true);
  const timer = useRef<NodeJS.Timeout | null>(null);

  async function jgetPico<T=any>(picoPath: string, qs?: Record<string,string|number>): Promise<T> {
    const usp = new URLSearchParams(qs as any);
    if (!usp.has("t")) usp.set("t", "8000");
    const url = `/api/pico${picoPath}?${usp.toString()}`;
    const r = await fetch(url, { headers: { "X-Pico-Base": baseURL } });
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return r.json();
  }

  async function refresh() {
    if (!baseURL) return;
    setBusy(true);
    try { setData(await jgetPico<Thermo>(`/api/thermistor/read`)); setError(""); }
    catch (e: any) { setError(e?.message || "Request failed"); }
    finally { setBusy(false); }
  }

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [baseURL]);

  useEffect(() => {
    if (!auto) { if (timer.current) clearInterval(timer.current); return; }
    timer.current = setInterval(refresh, 1000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [auto, baseURL]); // auto-poll every 1s

  return (
    <main style={{ maxWidth: 900, margin: "32px auto", padding: 24 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 4 }}>Thermistor (NTC 10k)</h1>
          <p style={{ color: "#6b7280" }}>Reads temperature from a 10k NTC divider on GP26 / ADC0.</p>
        </div>
        <Link href="/pico" style={{ color: "#374151", textDecoration: "none" }}>← Back</Link>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16 }}>
        <input
          placeholder="http://pico-w.local or 192.168.1.42"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          style={{ width: 320, padding: 10, border: "1px solid #e5e7eb", borderRadius: 10 }}
        />
        <button onClick={refresh} style={btnDark} disabled={busy}>Read</button>
        <label style={{ display: "flex", alignItems: "center", gap: 6, color: "#374151" }}>
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          Auto 1s
        </label>
      </div>

      {!!error && <div style={errorBox}><b>Request failed</b><div style={{ fontFamily: "ui-monospace, Menlo, monospace" }}>{error}</div></div>}

      <div style={cardStyle}>
        <div style={{ fontSize: 32 }}>🌡️</div>
        <div style={cardTitle}>Live Reading</div>

        <div style={{ display: "grid", gap: 6, fontSize: 14, color: "#374151", marginTop: 6 }}>
          <div><span style={{ color: "#6b7280" }}>Temperature:</span> <b>{data ? data.temp_c.toFixed(2) : "—"} °C</b></div>
          <div><span style={{ color: "#6b7280" }}>ADC:</span> {data?.raw ?? "—"} / {data?.raw_bits ?? "—"}</div>
          <div><span style={{ color: "#6b7280" }}>Voltage:</span> {data ? data.voltage.toFixed(4) : "—"} V</div>
          <div><span style={{ color: "#6b7280" }}>Resistance:</span> {data ? Math.round(data.resistance_ohm) : "—"} Ω</div>
        </div>

        <div style={{ marginTop: 12, color: "#6b7280", fontSize: 13 }}>
          Divider: 3V3 → <b>NTC</b> → node → <b>10k</b> → GND (node → ADC GP26).
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

const btnBase: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  fontSize: 14,
  fontWeight: 600,
  border: "1px solid transparent",
  cursor: "pointer",
};
const btnDark: React.CSSProperties = { ...btnBase, color: "#fff", background: "#111827" };

const errorBox: React.CSSProperties = {
  background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b",
  padding: 12, borderRadius: 10, marginBottom: 12, fontSize: 14,
};
