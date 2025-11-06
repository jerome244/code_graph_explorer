"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

/** Shared UI bits */
const pageWrap: React.CSSProperties = { maxWidth: 980, margin: "32px auto", padding: 24 };
const headerBar: React.CSSProperties = { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 16 };
const card: React.CSSProperties = { display: "grid", gap: 10, padding: 16, border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", boxShadow: "0 6px 16px rgba(0,0,0,0.06)" };
const cardTitle: React.CSSProperties = { fontSize: 18, fontWeight: 700, color: "#111827" };
const cardDesc: React.CSSProperties = { color: "#6b7280", fontSize: 14 };
const row: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" };
const btnLight: React.CSSProperties = { padding: "10px 12px", borderRadius: 10, fontWeight: 600, cursor: "pointer", color: "#111827", background: "#fff", border: "1px solid #e5e7eb" };
const errorBox: React.CSSProperties = { background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", padding: 12, borderRadius: 10, fontSize: 14 };
const pill: React.CSSProperties = { padding: "6px 10px", borderRadius: 999, border: "1px solid #e5e7eb", background: "#f9fafb", fontSize: 12, color: "#374151", fontWeight: 600 };

/** LocalStorage for base URL (same key as your other pages) */
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

type BmpReading = {
  ok: boolean;
  temp_c: number;
  pressure_pa: number;
  pressure_hpa: number;
  altitude_m: number;
  oss: 0 | 1 | 2 | 3;
};

export default function PicoBMP180() {
  const { input, setInput, baseURL } = useBaseURL();
  const [reading, setReading] = useState<BmpReading | null>(null);
  const [slp, setSLP] = useState<number>(1013.25); // sea-level pressure hPa
  const [oss, setOSS] = useState<0 | 1 | 2 | 3>(3);
  const [auto, setAuto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const inflightRef = useRef(false);

  /** Proxy helper (sends header + ?target= for your proxy) */
  async function jget<T = any>(picoPath: string, qs?: Record<string, string | number>): Promise<T> {
    if (!baseURL) throw new Error("Missing Pico base URL");
    const usp = new URLSearchParams();
    if (qs) for (const [k, v] of Object.entries(qs)) usp.set(k, String(v));
    if (!usp.has("t")) usp.set("t", "12000");
    usp.set("target", baseURL);
    const url = `/api/pico${picoPath}?${usp.toString()}`;
    const r = await fetch(url, { method: "GET", headers: { "X-Pico-Base": baseURL }, cache: "no-store" });
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return r.json();
  }

  const readOnce = async () => {
    if (!baseURL) return;
    try {
      const js = await jget<BmpReading>(`/api/bmp180/read`, { slp, oss });
      setReading(js);
      setErr("");
    } catch (e: any) {
      setErr(e?.message || "Request failed");
    }
  };

  // ping status on baseURL change
  useEffect(() => {
    if (!baseURL) return;
    (async () => {
      try { await jget(`/api/bmp180/status`); setErr(""); }
      catch { setErr("BMP180 not detected (status)."); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseURL]);

  // auto polling
  useEffect(() => {
    if (!baseURL || !auto) return;
    const tick = async () => {
      if (inflightRef.current) return;
      inflightRef.current = true;
      try { await readOnce(); } finally { inflightRef.current = false; }
    };
    const id = setInterval(tick, 2000);
    tick();
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseURL, auto, oss, slp]);

  return (
    <main style={pageWrap}>
      <div style={headerBar}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 4 }}>Barometer (BMP180)</h1>
          <p style={{ color: "#6b7280" }}>Pressure, temperature & altitude via I²C @ 0x77.</p>
        </div>
        <Link href="/pico" style={{ color: "#374151", textDecoration: "none" }}>
          ← Back
        </Link>
      </div>

      <div style={{ ...card, marginBottom: 16 }}>
        <div style={row}>
          <input
            placeholder="http://pico-w.local or 192.168.1.42"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            style={{ width: 320, padding: 10, border: "1px solid #e5e7eb", borderRadius: 10 }}
          />
          <button
            onClick={async () => { setBusy(true); await readOnce(); setBusy(false); }}
            style={btnLight}
            disabled={!baseURL || busy}
          >
            {busy ? "Reading…" : "Read"}
          </button>
          <label style={{ color: "#374151" }}>
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Auto 2s
          </label>
          <span style={pill}>OSS: {oss}</span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 16 }}>
        <div style={card}>
          <div style={{ fontSize: 32 }}>🏔️</div>
          <div style={cardTitle}>Live Reading</div>
          <div style={{ ...cardDesc, marginBottom: 8 }}>
            Endpoints: <code>/api/bmp180/status</code>, <code>/api/bmp180/read</code>
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: "#111827" }}>
              {reading ? `${reading.pressure_hpa.toFixed(2)} hPa` : "— hPa"}
            </div>
            <div style={{ color: "#374151" }}>
              Temperature: <b>{reading ? `${reading.temp_c.toFixed(2)} °C` : "—"}</b>
            </div>
            <div style={{ color: "#374151" }}>
              Altitude: <b>{reading ? `${reading.altitude_m.toFixed(1)} m` : "—"}</b>
            </div>
          </div>

          <div style={{ ...row, marginTop: 12 }}>
            <label style={{ color: "#374151" }}>
              SLP (hPa):
              <input
                type="number"
                step={0.01}
                min={300}
                max={1100}
                value={slp}
                onChange={(e) => setSLP(Number(e.target.value))}
                style={{ width: 140, marginLeft: 8, padding: 8, borderRadius: 10, border: "1px solid #e5e7eb" }}
              />
            </label>

            <label style={{ color: "#374151" }}>
              OSS:
              <select
                value={oss}
                onChange={(e) => setOSS(Number(e.target.value) as 0 | 1 | 2 | 3)}
                style={{ marginLeft: 8, padding: 8, borderRadius: 10, border: "1px solid #e5e7eb" }}
              >
                <option value={0}>0 (ULP)</option>
                <option value={1}>1 (STD)</option>
                <option value={2}>2 (HIGHRES)</option>
                <option value={3}>3 (UHR)</option>
              </select>
            </label>
          </div>

          {!!err && <div style={{ ...errorBox, marginTop: 12 }}>{err}</div>}
        </div>
      </div>
    </main>
  );
}
