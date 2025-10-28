"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type LastRfid = {
  uid: string | null;
  at_ms?: number;      // millis when seen on device
  age_ms?: number;     // device-calculated age, optional
};

const LS_KEY = "pico-target-base"; // shared with LED page

export default function PicoRfidPage() {
  const [base, setBase] = useState("");
  const [editBase, setEditBase] = useState("");
  const [last, setLast] = useState<LastRfid>({ uid: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [auto, setAuto] = useState(true);

  // load target
  useEffect(() => {
    const saved = localStorage.getItem(LS_KEY) || "";
    setBase(saved);
    setEditBase(saved);
  }, []);

  const normalizedTarget = useMemo(() => {
    if (!base) return "";
    let b = base;
    if (!/^https?:\/\//i.test(b)) b = "http://" + b;
    return b.replace(/\/+$/, "");
  }, [base]);

  function saveBase() {
    const raw = editBase.trim();
    if (!raw) {
      setBase("");
      localStorage.removeItem(LS_KEY);
      return;
    }
    let b = raw;
    if (!/^https?:\/\//i.test(b)) b = "http://" + b;
    b = b.replace(/\/+$/, "");
    setBase(b);
    localStorage.setItem(LS_KEY, b);
  }

  async function fetchLast() {
    if (!normalizedTarget) {
      setError("Set device target first");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/pico/api/rfid/last?target=${encodeURIComponent(normalizedTarget)}`,
        { method: "GET" }
      );
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
      setLast({
        uid: data?.uid ?? null,
        at_ms: data?.at_ms,
        age_ms: data?.age_ms,
      });
    } catch (e: any) {
      setError(e?.message || "Failed to fetch last RFID");
    } finally {
      setLoading(false);
    }
  }

  async function clearLast() {
    if (!normalizedTarget) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/pico/api/rfid/clear?target=${encodeURIComponent(normalizedTarget)}`
      );
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
      setLast({ uid: null });
    } catch (e: any) {
      setError(e?.message || "Failed to clear");
    } finally {
      setLoading(false);
    }
  }

  // optional "scan now" (triggers an immediate read attempt)
  async function scanNow() {
    if (!normalizedTarget) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/pico/api/rfid/scan?target=${encodeURIComponent(normalizedTarget)}`
      );
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
      if (data?.uid !== undefined) {
        setLast({ uid: data.uid, at_ms: data.at_ms, age_ms: data.age_ms });
      }
    } catch (e: any) {
      setError(e?.message || "Failed to scan");
    } finally {
      setLoading(false);
    }
  }

  // auto refresh every 2s when enabled
  useEffect(() => {
    if (!normalizedTarget || !auto) return;
    const id = setInterval(fetchLast, 2000);
    fetchLast(); // kick
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalizedTarget, auto]);

  return (
    <main
      style={{
        maxWidth: 720,
        margin: "32px auto",
        padding: 24,
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
        background: "#fff",
      }}
    >
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 16 }}>RFID</h1>

      {/* Target config */}
      <div style={cardBox}>
        <div style={{ fontWeight: 700 }}>Device target</div>
        <div style={{ fontSize: 14, color: "#6b7280" }}>
          Uses <code>/api/pico</code> with <code>?target=…</code>
        </div>
        <div style={{ fontSize: 14 }}>Current: <code>{normalizedTarget || "(not set)"}</code></div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={editBase}
            onChange={(e) => setEditBase(e.target.value)}
            placeholder="http://192.168.1.131 or http://picow.local"
            style={{ flex: 1, padding: "10px 12px", borderRadius: 8, border: "1px solid #d1d5db" }}
          />
          <button onClick={saveBase} style={btnPrimary}>Save</button>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <button onClick={fetchLast} disabled={!base || loading} style={btnPrimary}>Refresh</button>
        <button onClick={scanNow} disabled={!base || loading} style={btnPrimary}>Scan Now</button>
        <button onClick={() => setAuto(a => !a)} disabled={!base} style={btnSecondary}>
          {auto ? "Stop Auto-Refresh" : "Start Auto-Refresh"}
        </button>
        <button onClick={clearLast} disabled={!base || loading} style={btnSecondary}>Clear Last</button>
      </div>

      {/* Result */}
      <div style={cardBox}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Last Tag</div>
        <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
          UID: {last.uid ?? "—"}
        </div>
        {last.at_ms !== undefined && (
          <div style={{ color: "#6b7280" }}>
            at_ms: {last.at_ms}{last.age_ms !== undefined ? ` (age ${last.age_ms} ms)` : ""}
          </div>
        )}
        {error && <div style={{ color: "#b91c1c", marginTop: 8 }}>Error: {error}</div>}
        {loading && <div style={{ color: "#6b7280", marginTop: 8 }}>working…</div>}
      </div>
    </main>
  );
}

const cardBox: React.CSSProperties = {
  display: "grid",
  gap: 8,
  padding: 16,
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  background: "#f9fafb",
  marginBottom: 16,
};

const btnPrimary: React.CSSProperties = {
  background: "#2563eb",
  color: "#fff",
  padding: "10px 14px",
  borderRadius: 8,
  border: "none",
  fontWeight: 600,
  cursor: "pointer",
};
const btnSecondary: React.CSSProperties = {
  background: "#f3f4f6",
  color: "#111827",
  padding: "10px 14px",
  borderRadius: 8,
  border: "1px solid #e5e7eb",
  fontWeight: 600,
  cursor: "pointer",
};
