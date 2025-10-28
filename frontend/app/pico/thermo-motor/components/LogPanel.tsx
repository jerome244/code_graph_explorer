// app/pico/thermo-motor/components/LogPanel.tsx
"use client";
import React from "react";
import { card, btnLight, btnWarn } from "./ui";
import type { LogFilters, LogItem, LogKind, LogLevel, TimePreset } from "../lib/types";

function levelColor(level: LogLevel): React.CSSProperties {
  const base: React.CSSProperties = { fontWeight: 800 };
  if (level === "error") return { ...base, color: "#b91c1c" };
  if (level === "warn")  return { ...base, color: "#b45309" };
  return { ...base, color: "#064e3b" };
}

// local name to avoid clashes
function badgeStyle(kind: LogKind) {
  const base: React.CSSProperties = { padding: "2px 8px", borderRadius: 999, fontSize: 12, fontWeight: 700 };
  const map: Record<LogKind, React.CSSProperties> = {
    access: { ...base, background: "#eef2ff", color: "#3730a3" },
    motor:  { ...base, background: "#ecfdf5", color: "#065f46" },
    buzzer: { ...base, background: "#fff7ed", color: "#9a3412" },
    system: { ...base, background: "#f1f5f9", color: "#0f172a" },
  };
  return map[kind];
}

export default function LogPanel({
  filtered, filters, setFilters, clear, exportJSON, unread, markAllRead,
}: {
  filtered: LogItem[];
  filters: LogFilters;
  setFilters: React.Dispatch<React.SetStateAction<LogFilters>>;
  clear: () => void;
  exportJSON: () => void;
  unread: { warn: number; err: number; total: number };
  markAllRead: () => void;
}) {
  return (
    <div style={{ ...card, gridColumn: "1 / -1" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#111827" }}>
          Log {unread.total ? <span style={{ marginLeft: 8, fontSize: 12, color: "#b45309" }}>(Unread W:{unread.warn} E:{unread.err})</span> : null}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={markAllRead} style={btnLight}>Mark all read</button>
          <button onClick={exportJSON} style={btnLight}>Export JSON</button>
          <button onClick={clear} style={btnWarn}>Clear</button>
        </div>
      </div>

      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr auto", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {(["access","motor","buzzer","system"] as LogKind[]).map(k => (
            <label key={k} style={{ display:"flex", alignItems:"center", gap:6, color:"#374151" }}>
              <input
                type="checkbox"
                checked={filters.kinds[k]}
                onChange={(e)=>setFilters(s => ({ ...s, kinds: { ...s.kinds, [k]: e.target.checked } }))}
              /> {k}
            </label>
          ))}
          <select value={filters.level} onChange={(e)=>setFilters(s => ({ ...s, level: e.target.value as any }))} style={{ padding: 8, borderRadius: 10, border: "1px solid #e5e7eb" }}>
            <option value="all">Level: all</option><option value="info">info</option><option value="warn">warn</option><option value="error">error</option>
          </select>
          <select value={filters.time} onChange={(e)=>setFilters(s => ({ ...s, time: e.target.value as TimePreset }))} style={{ padding: 8, borderRadius: 10, border: "1px solid #e5e7eb" }}>
            <option value="5m">Last 5m</option><option value="15m">Last 15m</option><option value="1h">Last 1h</option><option value="24h">Last 24h</option><option value="all">All</option>
          </select>
          <input placeholder="Search…" value={filters.q} onChange={(e)=>setFilters(s => ({ ...s, q: e.target.value }))} style={{ minWidth: 200, padding: 8, borderRadius: 10, border: "1px solid #e5e7eb" }} />
        </div>
      </div>

      <div style={{ display: "grid", gap: 8, marginTop: 6, maxHeight: 380, overflow: "auto" }}>
        {filtered.length === 0 ? (
          <div style={{ color: "#6b7280" }}>No log entries.</div>
        ) : filtered.map(it => (
          <div key={it.id} style={{ display: "grid", gridTemplateColumns: "160px 90px 1fr", gap: 10, alignItems: "baseline", border: "1px solid #e5e7eb", borderRadius: 10, padding: 10 }}>
            <div style={{ color: "#374151", fontFamily: "ui-monospace, Menlo, monospace", fontSize: 12 }}>
              {new Date(it.ts).toLocaleString()}
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={badgeStyle(it.kind)}>{it.kind.toUpperCase()}</span>
              <span style={levelColor(it.level)}>{it.level}</span>
            </div>
            <div>
              <div style={{ color: "#111827", fontWeight: 600 }}>{it.msg}</div>
              {it.data ? <pre style={{ margin: 0, color: "#6b7280", fontSize: 12, overflow: "auto" }}>{JSON.stringify(it.data, null, 2)}</pre> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
