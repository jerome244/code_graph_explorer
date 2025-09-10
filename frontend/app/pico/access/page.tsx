"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";

// Shared with other pages
const LS_KEY = "pico_baseURL";

// Access-control keys (all localStorage, client-side)
const LS_ALLOW = "pico_rfid_allow";      // JSON array of { uid:string, label?:string }
const LS_LOCK  = "pico_secure_lock";     // "1" | "0"
const LS_TTL   = "pico_secure_ttl";      // number seconds, default 300
const LS_SESS  = "pico_secure_session";  // { uid, grantedAt, expiresAt }

type AllowItem = { uid: string; label?: string };

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

function readAllow(): AllowItem[] {
  try { return JSON.parse(localStorage.getItem(LS_ALLOW) || "[]"); } catch { return []; }
}
function writeAllow(a: AllowItem[]) { localStorage.setItem(LS_ALLOW, JSON.stringify(a)); }
function isLocked(): boolean { return localStorage.getItem(LS_LOCK) === "1"; }
function setLocked(v: boolean) { localStorage.setItem(LS_LOCK, v ? "1" : "0"); }
function readTTL(): number { const n = Number(localStorage.getItem(LS_TTL)); return Number.isFinite(n) && n > 0 ? n : 300; }
function writeTTL(n: number) { localStorage.setItem(LS_TTL, String(Math.max(10, Math.min(86400, Math.floor(n))))); }
function readSession() {
  try {
    const js = JSON.parse(localStorage.getItem(LS_SESS) || "null");
    if (!js) return null;
    if (Date.now() >= js.expiresAt) return null;
    return js as { uid: string; grantedAt: number; expiresAt: number };
  } catch { return null; }
}
function grantSession(uid: string, ttlSec: number) {
  const now = Date.now();
  localStorage.setItem(LS_SESS, JSON.stringify({ uid, grantedAt: now, expiresAt: now + ttlSec * 1000 }));
}
function revokeSession() { localStorage.removeItem(LS_SESS); }

// API helper
async function jgetPico<T=any>(baseURL: string, picoPath: string, qs?: Record<string,string|number>): Promise<T> {
  if (!baseURL) throw new Error("Missing Pico base URL");
  const usp = new URLSearchParams();
  if (qs) for (const [k,v] of Object.entries(qs)) usp.set(k, String(v));
  if (!usp.has("t")) usp.set("t", "12000");
  usp.set("target", baseURL);
  const url = `/api/pico${picoPath}?${usp.toString()}`;
  const r = await fetch(url, { method: "GET", headers: { "X-Pico-Base": baseURL }, cache: "no-store" });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

type ScanResp = { uid: string|null; at_ms: number; age_ms: number };

export default function AccessControlPage() {
  const { input, setInput, baseURL } = useBaseURL();

  const [allow, setAllow] = useState<AllowItem[]>([]);
  const [locked, setLockState] = useState(false);
  const [ttl, setTTL] = useState(300);
  const [lastUID, setLastUID] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setAllow(readAllow());
    setLockState(isLocked());
    setTTL(readTTL());
    const s = readSession();
    if (s) setLastUID(s.uid);
  }, []);

  function saveAllow(a: AllowItem[]) { setAllow(a); writeAllow(a); }

  async function scan(ms = 2000): Promise<string|null> {
    setError("");
    try {
      const js = await jgetPico<ScanResp>(baseURL, "/api/rfid/scan", { ms });
      setLastUID(js.uid);
      return js.uid;
    } catch (e: any) {
      setError(e?.message || "Scan failed");
      return null;
    }
  }

  function addUID(uid: string, label?: string) {
    const exists = allow.some(x => x.uid === uid);
    if (exists) return;
    const a = [...allow, { uid, label }];
    saveAllow(a);
  }
  function removeUID(uid: string) {
    const a = allow.filter(x => x.uid !== uid);
    saveAllow(a);
  }

  async function scanAndAdd() {
    setBusy(true);
    const uid = await scan(3000);
    if (uid) {
      const label = prompt(`Tag ${uid}\nOptional label:`, "");
      addUID(uid, label || undefined);
    }
    setBusy(false);
  }

  async function scanAndGrant() {
    if (!locked) { alert("Lock is disabled; Thermo ⇄ Motor doesn’t require a tag."); return; }
    setBusy(true);
    const uid = await scan(3000);
    if (uid && allow.some(x => x.uid === uid)) {
      grantSession(uid, ttl);
      alert(`Access granted for ${Math.round(ttl)}s\nUID: ${uid}`);
    } else if (uid) {
      alert(`UID ${uid} is not in allowlist.`);
    }
    setBusy(false);
  }

  return (
    <main style={{ maxWidth: 980, margin: "32px auto", padding: 24 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 4 }}>Access Control</h1>
          <p style={{ color: "#6b7280" }}>Manage RFID allowlist and require a tag to open <b>Thermo ⇄ Motor</b>.</p>
        </div>
        <Link href="/pico" style={{ color: "#374151", textDecoration: "none" }}>← Back</Link>
      </div>

      {/* Connection bar */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <input
          placeholder="http://pico-w.local or 192.168.1.42"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          style={{ width: 320, padding: 10, border: "1px solid #e5e7eb", borderRadius: 10 }}
        />
        <button
          onClick={async () => { setBusy(true); try { await jgetPico(baseURL, "/api/status"); setError(""); } catch(e:any){ setError(e?.message || "Ping failed"); } finally { setBusy(false); } }}
          style={{ padding: "10px 12px", borderRadius: 10, fontWeight: 600, color: "#fff", background: "#111827", border: "1px solid transparent" }}
        >Ping</button>
        <span style={{ color: "#6b7280", fontSize: 12 }}>Last UID: <b>{lastUID || "—"}</b></span>
      </div>

      {!!error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", padding: 12, borderRadius: 10, marginBottom: 12, fontSize: 14 }}>
          <b>Request failed</b>
          <div style={{ fontFamily: "ui-monospace, Menlo, monospace" }}>{error}</div>
        </div>
      )}

      {/* Lock settings */}
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", alignItems: "start" }}>
        <div style={card}>
          <div style={{ fontSize: 32 }}>🔒</div>
          <div style={cardTitle}>Thermo ⇄ Motor Lock</div>
          <div style={{ color: "#6b7280", fontSize: 14, marginBottom: 8 }}>
            When enabled, the Thermo ⇄ Motor page requires an allowed RFID tag. A valid scan grants a temporary session.
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 8, color: "#374151" }}>
            <input
              type="checkbox"
              checked={locked}
              onChange={(e) => { const v = e.target.checked; setLockState(v); setLocked(v); }}
            />
            Require RFID for Thermo ⇄ Motor
          </label>

          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
            <div style={{ color: "#6b7280", width: 150 }}>Session TTL (sec)</div>
            <input
              type="number"
              min={10}
              max={86400}
              step={10}
              value={ttl}
              onChange={(e) => { const n = Number(e.target.value); setTTL(n); writeTTL(n); }}
              style={{ width: 140, padding: 10, border: "1px solid #e5e7eb", borderRadius: 10 }}
            />
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <button disabled={busy || !baseURL} onClick={scanAndGrant} style={btnPrimary}>Scan & Grant</button>
            <button onClick={() => { revokeSession(); alert("Session revoked"); }} style={btnLight}>Revoke Session</button>
            <Link href="/pico/thermo-motor" style={{ textDecoration: "none" }}>
              <div style={btnDark}>Open Thermo ⇄ Motor</div>
            </Link>
          </div>
        </div>

        {/* Allowlist */}
        <div style={card}>
          <div style={{ fontSize: 32 }}>🪪</div>
          <div style={cardTitle}>Allowed Tags</div>
          <div style={{ color: "#6b7280", fontSize: 14, marginBottom: 8 }}>
            Add tags by scanning, optionally give them labels.
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
            <button disabled={busy || !baseURL} onClick={scanAndAdd} style={btnPrimary}>Scan & Add</button>
            <button
              onClick={() => {
                const uid = prompt("Enter UID (format xx:xx:xx:xx...)", "");
                if (uid) addUID(uid.trim());
              }}
              style={btnLight}
            >
              Add by UID…
            </button>
          </div>

          {allow.length === 0 ? (
            <div style={{ color: "#6b7280" }}>No tags yet. Scan one to add it.</div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {allow.map((x) => (
                <div key={x.uid} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid #e5e7eb", borderRadius: 10, padding: 10 }}>
                  <div style={{ display: "grid" }}>
                    <div style={{ fontWeight: 700, color: "#111827" }}>{x.label || "(no label)"}</div>
                    <div style={{ fontFamily: "ui-monospace, Menlo, monospace", color: "#6b7280" }}>{x.uid}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => {
                        const label = prompt("Edit label:", x.label || "");
                        const a = allow.map(it => it.uid === x.uid ? { ...it, label: label || undefined } : it);
                        saveAllow(a);
                      }}
                      style={btnLight}
                    >Rename</button>
                    <button onClick={() => removeUID(x.uid)} style={btnDanger}>Remove</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

// small style tokens
const card: React.CSSProperties = {
  display: "grid", gap: 10, padding: 16, border: "1px solid #e5e7eb",
  borderRadius: 12, background: "#fff", boxShadow: "0 6px 16px rgba(0,0,0,0.06)",
};
const cardTitle: React.CSSProperties = { fontSize: 18, fontWeight: 700, color: "#111827" };
const btnPrimary: React.CSSProperties = { padding: "10px 12px", borderRadius: 10, fontWeight: 600, color: "#fff", background: "#111827", border: "1px solid transparent", cursor: "pointer" };
const btnLight: React.CSSProperties   = { padding: "10px 12px", borderRadius: 10, fontWeight: 600, color: "#111827", background: "#fff", border: "1px solid #e5e7eb", cursor: "pointer" };
const btnDanger: React.CSSProperties  = { padding: "10px 12px", borderRadius: 10, fontWeight: 600, color: "#fff", background: "#dc2626", border: "1px solid transparent", cursor: "pointer" };
const btnDark: React.CSSProperties    = { padding: "10px 12px", borderRadius: 10, fontWeight: 600, color: "#fff", background: "#111827", border: "1px solid transparent", cursor: "pointer", display: "inline-flex", alignItems: "center" };
