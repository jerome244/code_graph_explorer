"use client";

import { useEffect, useState } from "react";

type LedState = "on" | "off" | "blinking" | "unknown";
const LS_KEY = "pico-target-base"; // localStorage key shared by all pico pages

export default function PicoLedPage() {
  const [status, setStatus] = useState<LedState>("unknown");
  const [hz, setHz] = useState<number>(2);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [base, setBase] = useState<string>("");
  const [editBase, setEditBase] = useState<string>("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_KEY) || "";
      setBase(saved);
      setEditBase(saved);
    } catch {}
  }, []);

  function saveBase() {
    const raw = editBase.trim();
    if (!raw) {
      setBase("");
      localStorage.removeItem(LS_KEY);
      return;
    }
    let normalized = raw;
    if (!/^https?:\/\//i.test(normalized)) normalized = "http://" + normalized;
    normalized = normalized.replace(/\/+$/, "");
    setBase(normalized);
    localStorage.setItem(LS_KEY, normalized);
  }

  async function call(path: string) {
    if (!base) {
      setError("Set device target first");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const sep = path.includes("?") ? "&" : "?";
      const r = await fetch(`/api/pico${path}${sep}target=${encodeURIComponent(base)}`, { method: "GET" });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
      setStatus((data?.state as LedState) || status);
    } catch (e: any) {
      setError(e?.message || "Failed to reach Pico");
    } finally {
      setLoading(false);
    }
  }

  async function refresh() {
    await call("/api/status");
  }

  useEffect(() => {
    if (!base) return;
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base]);

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
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 16 }}>
        LED Test
      </h1>

      {/* Target config */}
      <div
        style={{
          display: "grid",
          gap: 8,
          padding: 16,
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          background: "#f9fafb",
          marginBottom: 16,
        }}
      >
        <div style={{ fontWeight: 700 }}>Device target</div>
        <div style={{ fontSize: 14, color: "#6b7280" }}>
          Calls are proxied via <code>/api/pico</code> using <code>?target=...</code>
        </div>
        <div style={{ fontSize: 14 }}>
          Current: <code>{base || "(not set)"}</code>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={editBase}
            onChange={(e) => setEditBase(e.target.value)}
            placeholder="http://192.168.1.131 or http://picow.local"
            style={{
              flex: 1,
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid #d1d5db",
            }}
          />
          <button onClick={saveBase} style={btnStyle}>Save</button>
          <button onClick={() => setEditBase(base)} style={btnSecondaryStyle}>Use current</button>
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <button onClick={() => call("/api/led?state=on")}  disabled={loading || !base} style={btnStyle}>Turn ON</button>
        <button onClick={() => call("/api/led?state=off")} disabled={loading || !base} style={btnStyle}>Turn OFF</button>
        <button onClick={() => call(`/api/blink?hz=${hz}`)} disabled={loading || !base} style={btnStyle}>Blink</button>
        <button onClick={refresh} disabled={loading || !base} style={btnSecondaryStyle}>Refresh</button>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>
          Blink frequency: {hz} Hz
        </label>
        <input
          type="range"
          min={1}
          max={20}
          step={1}
          value={hz}
          onChange={(e) => setHz(parseInt(e.target.value))}
          style={{ width: "100%" }}
        />
      </div>

      <div
        style={{
          marginTop: 16,
          padding: 16,
          borderRadius: 8,
          background: "#f9fafb",
          border: "1px solid #e5e7eb",
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 8 }}>LED Status</div>
        <div>
          {base ? (status === "unknown" ? "—" : status.toUpperCase()) : "Set device target first"}
          {loading ? " (working...)" : ""}
        </div>
        {error && <div style={{ color: "#b91c1c", marginTop: 8 }}>Error: {error}</div>}
      </div>
    </main>
  );
}

const btnStyle: React.CSSProperties = {
  background: "#2563eb",
  color: "#fff",
  padding: "10px 14px",
  borderRadius: 8,
  border: "none",
  fontWeight: 600,
  cursor: "pointer",
};

const btnSecondaryStyle: React.CSSProperties = {
  background: "#f3f4f6",
  color: "#111827",
  padding: "10px 14px",
  borderRadius: 8,
  border: "1px solid #e5e7eb",
  fontWeight: 600,
  cursor: "pointer",
};
