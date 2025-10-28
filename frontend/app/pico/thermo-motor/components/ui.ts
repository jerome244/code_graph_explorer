// frontend/app/pico/thermo-motor/components/ui.ts
import React from "react";

export const pageWrap: React.CSSProperties = { maxWidth: 980, margin: "32px auto", padding: 24 };
export const headerBar: React.CSSProperties = { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 16 };
export const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16, alignItems: "start" };
export const card: React.CSSProperties = { display: "grid", gap: 10, padding: 16, border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", boxShadow: "0 6px 16px rgba(0,0,0,0.06)" };
export const cardTitle: React.CSSProperties = { fontSize: 18, fontWeight: 700, color: "#111827" };
export const cardDesc: React.CSSProperties = { color: "#6b7280", fontSize: 14 };
export const row: React.CSSProperties = { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" };
export const hint: React.CSSProperties = { color: "#6b7280", fontSize: 12 };
export const pill: React.CSSProperties = { padding: "6px 10px", borderRadius: 999, border: "1px solid #e5e7eb", background: "#f9fafb", fontSize: 12, color: "#374151", fontWeight: 600 };

const btnBase: React.CSSProperties = { padding: "10px 12px", borderRadius: 10, fontWeight: 600, cursor: "pointer" };
export const btnDark: React.CSSProperties = { ...btnBase, color: "#fff", background: "#111827", border: "1px solid transparent" };
export const btnLight: React.CSSProperties = { ...btnBase, color: "#111827", background: "#fff", border: "1px solid #e5e7eb" };
export const btnWarn: React.CSSProperties = { ...btnBase, color: "#fff", background: "#dc2626", border: "1px solid transparent" };
export const btnSafe: React.CSSProperties = { ...btnBase, color: "#fff", background: "#059669", border: "1px solid transparent" };

export const errorBox: React.CSSProperties = { background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", padding: 12, borderRadius: 10, marginTop: 12, fontSize: 14 };
