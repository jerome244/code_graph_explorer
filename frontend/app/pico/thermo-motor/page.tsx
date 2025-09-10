"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

/** ─────────────────────────────────────────────────────────────
 *  Shared styling
 *  ────────────────────────────────────────────────────────────*/
const pageWrap: React.CSSProperties = { maxWidth: 980, margin: "32px auto", padding: 24 };
const headerBar: React.CSSProperties = { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 16 };
const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16, alignItems: "start" };
const card: React.CSSProperties = { display: "grid", gap: 10, padding: 16, border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", boxShadow: "0 6px 16px rgba(0,0,0,0.06)" };
const cardTitle: React.CSSProperties = { fontSize: 18, fontWeight: 700, color: "#111827" };
const cardDesc: React.CSSProperties = { color: "#6b7280", fontSize: 14 };
const row: React.CSSProperties = { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" };
const hint: React.CSSProperties = { color: "#6b7280", fontSize: 12 };
const pill: React.CSSProperties = { padding: "6px 10px", borderRadius: 999, border: "1px solid #e5e7eb", background: "#f9fafb", fontSize: 12, color: "#374151", fontWeight: 600 };
const btn: React.CSSProperties = { padding: "10px 12px", borderRadius: 10, fontWeight: 600, cursor: "pointer" };
const btnDark: React.CSSProperties = { ...btn, color: "#fff", background: "#111827", border: "1px solid transparent" };
const btnLight: React.CSSProperties = { ...btn, color: "#111827", background: "#fff", border: "1px solid #e5e7eb" };
const btnWarn: React.CSSProperties = { ...btn, color: "#fff", background: "#dc2626", border: "1px solid transparent" };
const btnSafe: React.CSSProperties = { ...btn, color: "#fff", background: "#059669", border: "1px solid transparent" };
const errorBox: React.CSSProperties = { background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", padding: 12, borderRadius: 10, marginTop: 12, fontSize: 14 };

/** ─────────────────────────────────────────────────────────────
 *  LocalStorage keys
 *  ────────────────────────────────────────────────────────────*/
const LS_KEY   = "pico_baseURL";
const LS_ALLOW = "pico_rfid_allow";
const LS_LOCK  = "pico_secure_lock";
const LS_TTL   = "pico_secure_ttl";
const LS_SESS  = "pico_secure_session";
const LS_LOG   = "pico_event_log";
const LS_LOG_SEEN = "pico_event_seen";

/** ─────────────────────────────────────────────────────────────
 *  Types
 *  ────────────────────────────────────────────────────────────*/
type AllowItem = { uid: string; label?: string };
type OnOff = "on" | "off";
type MotorState = "on" | "off" | "unknown";
type Thermo = { raw:number; raw_bits:number; voltage:number; resistance_ohm:number; temp_c:number };

type LogLevel = "info" | "warn" | "error";
type LogKind  = "access" | "motor" | "buzzer" | "system";
type LogItem  = { id: string; ts: number; level: LogLevel; kind: LogKind; msg: string; data?: any };

type TimePreset = "all" | "5m" | "15m" | "1h" | "24h";
type LogFilters = {
  kinds: Record<LogKind, boolean>;
  level: LogLevel | "all";
  q: string;
  time: TimePreset;
};

/** ─────────────────────────────────────────────────────────────
 *  Helpers: baseURL & access-control
 *  ────────────────────────────────────────────────────────────*/
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
function isLocked(): boolean { return localStorage.getItem(LS_LOCK) === "1"; }
function readTTL(): number { const n = Number(localStorage.getItem(LS_TTL)); return Number.isFinite(n) && n > 0 ? n : 300; }
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

/** Pico proxy helper */
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

/** ─────────────────────────────────────────────────────────────
 *  LOGGING with unread support
 *  ────────────────────────────────────────────────────────────*/
function useLogger() {
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [filters, setFilters] = useState<LogFilters>({
    kinds: { access: true, motor: true, buzzer: true, system: true },
    level: "all",
    q: "",
    time: "1h",
  });
  const [seenTs, setSeenTs] = useState<number>(() => {
    const n = Number(localStorage.getItem(LS_LOG_SEEN)); return Number.isFinite(n) ? n : 0;
  });

  useEffect(() => {
    try {
      const js = JSON.parse(localStorage.getItem(LS_LOG) || "[]");
      if (Array.isArray(js)) setLogs(js);
    } catch {/* noop */}
  }, []);

  function persist(arr: LogItem[]) {
    localStorage.setItem(LS_LOG, JSON.stringify(arr));
  }

  function push(kind: LogKind, level: LogLevel, msg: string, data?: any) {
    const item: LogItem = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      ts: Date.now(),
      level, kind, msg, data
    };
    setLogs(prev => {
      const arr = [...prev, item];
      if (arr.length > 500) arr.splice(0, arr.length - 500);
      persist(arr);
      return arr;
    });
  }

  function clear() { setLogs([]); persist([]); markAllRead(); }
  function exportJSON() {
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "pico-log.json"; a.click();
    URL.revokeObjectURL(url);
  }

  function markAllRead() {
    const ts = Date.now();
    setSeenTs(ts);
    localStorage.setItem(LS_LOG_SEEN, String(ts));
  }

  const unread = useMemo(() => {
    let warn = 0, err = 0;
    for (const it of logs) {
      if (it.ts <= seenTs) continue;
      if (it.level === "warn") warn++;
      if (it.level === "error") err++;
    }
    return { warn, err, total: warn + err };
  }, [logs, seenTs]);

  const filtered = useMemo(() => {
    const now = Date.now();
    const since = (() => {
      switch (filters.time) {
        case "5m":  return now - 5 * 60_000;
        case "15m": return now - 15 * 60_000;
        case "1h":  return now - 60 * 60_000;
        case "24h": return now - 24 * 60 * 60_000;
        default:    return 0;
      }
    })();
    const q = filters.q.trim().toLowerCase();
    return [...logs].filter(it => {
      if (!filters.kinds[it.kind]) return false;
      if (filters.level !== "all" && it.level !== filters.level) return false;
      if (since && it.ts < since) return false;
      if (q && !(it.msg.toLowerCase().includes(q) || JSON.stringify(it.data||{}).toLowerCase().includes(q))) return false;
      return true;
    }).sort((a,b) => b.ts - a.ts);
  }, [logs, filters]);

  return { logs, filtered, filters, setFilters, push, clear, exportJSON, unread, markAllRead };
}

function badge(kind: LogKind) {
  const base: React.CSSProperties = { padding: "2px 8px", borderRadius: 999, fontSize: 12, fontWeight: 700 };
  const map: Record<LogKind, React.CSSProperties> = {
    access: { ...base, background: "#eef2ff", color: "#3730a3" },
    motor:  { ...base, background: "#ecfdf5", color: "#065f46" },
    buzzer: { ...base, background: "#fff7ed", color: "#9a3412" },
    system: { ...base, background: "#f1f5f9", color: "#0f172a" },
  };
  return map[kind];
}
function levelColor(level: LogLevel) {
  const base: React.CSSProperties = { fontWeight: 800 };
  if (level === "error") return { ...base, color: "#b91c1c" };
  if (level === "warn")  return { ...base, color: "#b45309" };
  return { ...base, color: "#064e3b" };
}

function LogPanel({
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

      {/* Filters */}
      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr auto", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <label style={{ ...row, color: "#374151" }}>
            <input type="checkbox" checked={filters.kinds.access} onChange={(e)=>setFilters(s => ({ ...s, kinds: { ...s.kinds, access: e.target.checked } }))} /> Access
          </label>
          <label style={{ ...row, color: "#374151" }}>
            <input type="checkbox" checked={filters.kinds.motor} onChange={(e)=>setFilters(s => ({ ...s, kinds: { ...s.kinds, motor: e.target.checked } }))} /> Motor
          </label>
          <label style={{ ...row, color: "#374151" }}>
            <input type="checkbox" checked={filters.kinds.buzzer} onChange={(e)=>setFilters(s => ({ ...s, kinds: { ...s.kinds, buzzer: e.target.checked } }))} /> Buzzer
          </label>
          <label style={{ ...row, color: "#374151" }}>
            <input type="checkbox" checked={filters.kinds.system} onChange={(e)=>setFilters(s => ({ ...s, kinds: { ...s.kinds, system: e.target.checked } }))} /> System
          </label>

          <select value={filters.level} onChange={(e)=>setFilters(s => ({ ...s, level: e.target.value as any }))} style={{ padding: 8, borderRadius: 10, border: "1px solid #e5e7eb" }}>
            <option value="all">Level: all</option>
            <option value="info">info</option>
            <option value="warn">warn</option>
            <option value="error">error</option>
          </select>

          <select value={filters.time} onChange={(e)=>setFilters(s => ({ ...s, time: e.target.value as TimePreset }))} style={{ padding: 8, borderRadius: 10, border: "1px solid #e5e7eb" }}>
            <option value="5m">Last 5m</option>
            <option value="15m">Last 15m</option>
            <option value="1h">Last 1h</option>
            <option value="24h">Last 24h</option>
            <option value="all">All</option>
          </select>

          <input placeholder="Search…" value={filters.q} onChange={(e)=>setFilters(s => ({ ...s, q: e.target.value }))} style={{ minWidth: 200, padding: 8, borderRadius: 10, border: "1px solid #e5e7eb" }} />
        </div>
      </div>

      {/* List */}
      <div style={{ display: "grid", gap: 8, marginTop: 6, maxHeight: 380, overflow: "auto" }}>
        {filtered.length === 0 ? (
          <div style={{ color: "#6b7280" }}>No log entries.</div>
        ) : filtered.map(it => (
          <div key={it.id} style={{ display: "grid", gridTemplateColumns: "160px 90px 1fr", gap: 10, alignItems: "baseline", border: "1px solid #e5e7eb", borderRadius: 10, padding: 10 }}>
            <div style={{ color: "#374151", fontFamily: "ui-monospace, Menlo, monospace", fontSize: 12 }}>
              {new Date(it.ts).toLocaleString()}
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={badge(it.kind)}>{it.kind.toUpperCase()}</span>
              <span style={levelColor(it.level)}>{it.level}</span>
            </div>
            <div>
              <div style={{ color: "#111827", fontWeight: 600 }}>{it.msg}</div>
              {it.data ? (
                <pre style={{ margin: 0, color: "#6b7280", fontSize: 12, overflow: "auto" }}>{JSON.stringify(it.data, null, 2)}</pre>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** ─────────────────────────────────────────────────────────────
 *  PAGE (RFID gate + app + log)
 *  ────────────────────────────────────────────────────────────*/
export default function ThermoMotorPage() {
  const { input, setInput, baseURL } = useBaseURL();
  const logger = useLogger();

  // Gate state
  const [locked, setLocked] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [allow, setAllow] = useState<AllowItem[]>([]);
  const [ttl, setTTL] = useState(300);
  const [gateBusy, setGateBusy] = useState(false);
  const [gateError, setGateError] = useState("");

  useEffect(() => {
    const lk = isLocked();
    setLocked(lk);
    setAllow(readAllow());
    setTTL(readTTL());
    const s = readSession();
    setAuthorized(!lk || !!s);
  }, []);

  async function scanGrant() {
    setGateError("");
    setGateBusy(true);
    try {
      const js = await jgetPico<{ uid: string|null; at_ms: number; age_ms: number }>(baseURL, "/api/rfid/scan", { ms: 3000 });
      if (!js.uid) { setGateError("No tag detected. Hold the card on the reader."); return; }
      if (!allow.some(x => x.uid === js.uid)) { setGateError(`UID ${js.uid} is not allowed.`); logger.push("access","warn","Denied tag", { uid: js.uid }); return; }
      grantSession(js.uid, ttl);
      setAuthorized(true);
      logger.push("access","info","Access granted", { uid: js.uid, ttl });
    } catch (e: any) {
      setGateError(e?.message || "Scan failed");
      logger.push("access","error","Scan failed", { error: String(e?.message || e) });
    } finally {
      setGateBusy(false);
    }
  }

  return (
    <main style={pageWrap}>
      {/* Header */}
      <div style={headerBar}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 4 }}>Thermo ⇄ Motor + Safety</h1>
        </div>
        <Link href="/pico" style={{ color: "#374151", textDecoration: "none" }}>← Back</Link>
      </div>

      {/* Gate or App */}
      {locked && !authorized ? (
        <>
          <div style={{ ...card, marginBottom: 16 }}>
            <div style={row}>
              <input
                placeholder="http://pico-w.local or 192.168.1.42"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                style={{ width: 320, padding: 10, border: "1px solid #e5e7eb", borderRadius: 10 }}
              />
              <button onClick={scanGrant} disabled={!baseURL || gateBusy} style={btnDark}>
                {gateBusy ? "Scanning…" : "Scan to Enter"}
              </button>
              <Link href="/pico/access" style={{ marginLeft: 8, color: "#374151", textDecoration: "none" }}>
                Manage Access →
              </Link>
            </div>
            {!!gateError && (
              <div style={{ ...errorBox, marginTop: 12 }}>
                <b>Access denied</b>
                <div style={{ fontFamily: "ui-monospace, Menlo, monospace" }}>{gateError}</div>
              </div>
            )}
          </div>
        </>
      ) : (
        <ThermoMotorProtected
          baseURL={baseURL}
          input={input}
          setInput={setInput}
          onRelock={() => { revokeSession(); setAuthorized(false); logger.push("access","info","Session revoked manually"); }}
          logger={logger}
        />
      )}

      {/* Log panel shows both gate & app events */}
      <LogPanel
        filtered={logger.filtered}
        filters={logger.filters}
        setFilters={logger.setFilters}
        clear={logger.clear}
        exportJSON={logger.exportJSON}
        unread={logger.unread}
        markAllRead={logger.markAllRead}
      />
    </main>
  );
}

/** ─────────────────────────────────────────────────────────────
 *  Tiny UI components (animations)
 *  ────────────────────────────────────────────────────────────*/
function MotorAnim({ running }: { running: boolean }) {
  return (
    <div className="motor-wrap" title={running ? "Motor: ON" : "Motor: OFF"}>
      <svg viewBox="0 0 100 100" className={`motor ${running ? "spin" : ""}`} aria-hidden>
        <circle cx="50" cy="50" r="28" fill="currentColor" opacity="0.1" />
        <g fill="currentColor">
          <path d="M50 18 l6 8 10-2 3 10 9 4-4 9 7 7-7 7 4 9-9 4-3 10-10-2-6 8-6-8-10 2-3-10-9-4 4-9-7-7 7-7-4-9 9-4 3-10 10 2z" />
          <circle cx="50" cy="50" r="8" />
        </g>
      </svg>
      <div className="motor-label">{running ? "Running" : "Stopped"}</div>
      <style jsx>{`
        .motor-wrap { display:flex; flex-direction:column; align-items:center; gap:6px; color:#111827; }
        .motor { width: 70px; height: 70px; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 1.1s linear infinite; transform-origin: 50% 50%; }
        .motor-label { font-size: 12px; color: #6b7280; font-weight: 600; }
      `}</style>
    </div>
  );
}

function LedDot({ color, on, label }: { color: "red" | "green"; on: boolean; label: string }) {
  return (
    <div className="led-wrap" title={`${label}: ${on ? "ON" : "OFF"}`}>
      <div className={`led ${color} ${on ? "on" : "off"}`} />
      <div className="led-label">{label}</div>
      <style jsx>{`
        .led-wrap { display:flex; flex-direction:column; align-items:center; gap:6px; min-width:54px; }
        .led { width: 26px; height: 26px; border-radius: 999px; border: 1px solid #e5e7eb; }
        .led.red.off { background: #fee2e2; border-color:#fecaca; }
        .led.red.on  { background: #dc2626; border-color:#dc2626; box-shadow: 0 0 10px rgba(220,38,38,.9), 0 0 20px rgba(220,38,38,.5); animation: glow 1.2s ease-in-out infinite; }
        .led.green.off { background: #dcfce7; border-color:#bbf7d0; }
        .led.green.on  { background: #059669; border-color:#059669; box-shadow: 0 0 10px rgba(5,150,105,.9), 0 0 20px rgba(5,150,105,.5); animation: glow 1.2s ease-in-out infinite; }
        .led-label { font-size: 12px; color: #6b7280; font-weight: 600; }
        @keyframes glow { 0%,100% { filter: brightness(1); } 50% { filter: brightness(1.35); } }
      `}</style>
    </div>
  );
}

/** ─────────────────────────────────────────────────────────────
 *  CHILD APP: controls + LCD mirroring + animations
 *  ────────────────────────────────────────────────────────────*/
function ThermoMotorProtected({
  baseURL,
  input,
  setInput,
  onRelock,
  logger,
}: {
  baseURL: string;
  input: string;
  setInput: (v: string) => void;
  onRelock: () => void;
  logger: ReturnType<typeof useLogger>;
}) {
  const [thermo, setThermo] = useState<Thermo | null>(null);
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

  // LCD toggles
  const [lcdSync, setLcdSync] = useState(true);
  const [lcdAlerts, setLcdAlerts] = useState(true);

  const [busy, setBusy] = useState(false);

  // Refs / guards
  const targetRef = useRef(targetC); useEffect(()=>{targetRef.current=targetC;},[targetC]);
  const hystRef   = useRef(hyst);    useEffect(()=>{hystRef.current=hyst;},[hyst]);
  const autoRef   = useRef(auto);    useEffect(()=>{autoRef.current=auto;},[auto]);
  const motorRef  = useRef<MotorState>(motor); useEffect(()=>{motorRef.current=motor;},[motor]);

  const inflightRef = useRef(false);
  const cooldownUntilRef = useRef(0);
  const backoffUntilRef  = useRef(0);

  const lastLEDRef = useRef<{ red: OnOff; green: OnOff }>({ red: "off", green: "off" });
  const ledCooldownUntilRef = useRef(0);

  const critRef = useRef(critC);         useEffect(()=>{critRef.current=critC;},[critC]);
  const critHystRef = useRef(critHyst);  useEffect(()=>{critHystRef.current=critHyst;},[critHyst]);
  const buzzEnableRef = useRef(buzzEnable); useEffect(()=>{buzzEnableRef.current=buzzEnable;},[buzzEnable]);
  const buzzLatchRef  = useRef(buzzLatch);  useEffect(()=>{buzzLatchRef.current=buzzLatch;},[buzzLatch]);
  const buzzOnRef = useRef(buzzOnMs);    useEffect(()=>{buzzOnRef.current=buzzOnMs;},[buzzOnMs]);
  const buzzOffRef = useRef(buzzOffMs);  useEffect(()=>{buzzOffRef.current=buzzOffMs;},[buzzOffMs]);
  const alarmActiveRef = useRef(false);
  const buzzCooldownUntilRef = useRef(0);
  const buzzerRef = useRef<{ state: OnOff; alarm: boolean }>({ state: "off", alarm: false });
  useEffect(()=>{buzzerRef.current=buzzer;},[buzzer]);

  const lastErrLogRef = useRef(0);

  // LCD state/refs
  const lcdReadyRef = useRef(false);
  const lcdLastInitTryRef = useRef(0);
  const lcdCooldownUntilRef = useRef(0);
  const lcdAlertUntilRef = useRef(0);
  const lcdLastTextRef = useRef<{l1:string; l2:string}>({ l1: "", l2: "" });

  // Proxy bound helper
  async function jget<T=any>(p: string, qs?: Record<string,string|number>) {
    return jgetPico<T>(baseURL, p, qs);
  }

  // LCD helpers
  function cut16(s: string) {
    s = s.replace(/[^\x20-\x7E]/g, "?");
    return s.length > 16 ? s.slice(0, 16) : s;
  }
  async function lcdEnsure() {
    if (!lcdSync || !baseURL) return false;
    if (lcdReadyRef.current) return true;
    if (Date.now() - lcdLastInitTryRef.current < 1500) return false;
    lcdLastInitTryRef.current = Date.now();
    try {
      const st = await jget<{ready:boolean}>(`/api/lcd/status`);
      if (st.ready) { lcdReadyRef.current = true; return true; }
    } catch {}
    try {
      await jget(`/api/lcd/init`, { addr: "0x27", cols: 16, rows: 2 });
      lcdReadyRef.current = true;
      return true;
    } catch {
      return false;
    }
  }
  async function lcdSetRow(row: 0|1, text: string) {
    if (!lcdSync || !lcdReadyRef.current) return;
    const t = cut16(text);
    await jget(`/api/lcd/set`, { row, align: "left", text: t });
  }
  async function lcdShow(l1: string, l2: string) {
    if (!lcdSync) return;
    if (Date.now() < lcdCooldownUntilRef.current) return;
    if (!(await lcdEnsure())) return;
    const t1 = cut16(l1), t2 = cut16(l2);
    const last = lcdLastTextRef.current;
    if (last.l1 === t1 && last.l2 === t2) return;
    try {
      await lcdSetRow(0, t1);
      await lcdSetRow(1, t2);
      lcdLastTextRef.current = { l1: t1, l2: t2 };
      lcdCooldownUntilRef.current = Date.now() + 250;
    } catch {}
  }
  async function lcdClear() {
    if (!(await lcdEnsure())) return;
    try { await jget(`/api/lcd/clear`); lcdLastTextRef.current = { l1: "", l2: "" }; } catch {}
  }
  function lcdScheduleAlert(durationMs = 6000) {
    lcdAlertUntilRef.current = Date.now() + durationMs;
  }

  // API wrappers
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
  const readMotorStatus = async () => {
    const js = await jget<{state:"on"|"off"}>(`/api/relay/status`);
    setMotor(js.state); setError(""); return js.state as MotorState;
  };
  const setMotorState = async (state:"on"|"off") => {
    if (Date.now() < cooldownUntilRef.current) return;
    await jget(`/api/relay`, { state });
    setMotor(state); motorRef.current = state;
    cooldownUntilRef.current = Date.now() + 2500;
    logger.push("motor","info",`Motor ${state.toUpperCase()}`);
    setTimeout(() => { readMotorStatus().catch(()=>{}); }, 1200);
  };
  const readBuzzerStatus = async () => {
    const js = await jget<{state:OnOff; alarm:boolean}>(`/api/buzzer/status`);
    setBuzzer(js); return js;
  };
  const startAlarm = async () => {
    if (Date.now() < buzzCooldownUntilRef.current) return;
    await jget(`/api/buzzer/alarm`, { cmd: "start", on_ms: buzzOnRef.current, off_ms: buzzOffRef.current });
    alarmActiveRef.current = true;
    buzzCooldownUntilRef.current = Date.now() + 300;
    logger.push("buzzer","warn","Alarm START", { on_ms: buzzOnRef.current, off_ms: buzzOffRef.current });
    lcdScheduleAlert(8000);
    await readBuzzerStatus();
  };
  const stopAlarm = async () => {
    if (Date.now() < buzzCooldownUntilRef.current) return;
    await jget(`/api/buzzer/alarm`, { cmd: "stop" });
    alarmActiveRef.current = false;
    buzzCooldownUntilRef.current = Date.now() + 300;
    logger.push("buzzer","info","Alarm STOP");
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

  // Initial connect
  useEffect(() => {
    if (!baseURL) return;
    (async () => {
      try { 
        await readThermistor(); await readMotorStatus(); await readBuzzerStatus();
        if (lcdSync) { await lcdEnsure(); await lcdShow("Initializing...", ""); }
      } 
      catch (e:any) { setError(e?.message || "Request failed"); logger.push("system","error","Initial connect failed", { error: String(e?.message || e) }); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseURL]);

  // Poll loop + LCD updates
  useEffect(() => {
    if (!baseURL) return;
    const tick = async () => {
      if (inflightRef.current) return;
      inflightRef.current = true;
      try {
        const t = await readThermistor();
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

          // Buzzer safety
          if (buzzEnableRef.current) {
            const crit = critRef.current;
            const clr  = critRef.current - critHystRef.current;
            const bz = buzzerRef.current;

            if (temp >= crit) {
              if (!alarmActiveRef.current || !bz.alarm || bz.state !== "on") await startAlarm();
            } else if (temp <= clr) {
              if (!buzzLatchRef.current && (alarmActiveRef.current || bz.alarm || bz.state === "on")) await stopAlarm();
            }
          } else {
            const bz = buzzerRef.current;
            if (alarmActiveRef.current || bz.alarm || bz.state === "on") await stopAlarm();
          }

          // LCD
          if (lcdSync) {
            if (lcdAlerts && Date.now() < lcdAlertUntilRef.current) {
              // keep alert
            } else {
              const tStr = `T:${temp.toFixed(1)}C`;
              const mStr = motorRef.current === "on" ? "M:ON" : motorRef.current === "off" ? "M:OFF" : "M:?";
              const l1 = `${tStr} ${mStr}`.slice(0, 16);
              const uW = logger.unread.warn;
              const uE = logger.unread.err;
              const l2 = (uW || uE) ? `W:${uW} E:${uE}` : "OK";
              await lcdShow(l1, l2);
            }
          }
        }
      } catch (e:any) {
        setError(e?.message || "Request failed");
        const now = Date.now();
        if (now - lastErrLogRef.current > 5000) {
          logger.push("system","error","Poll failed", { error: String(e?.message || e) });
          if (lcdSync && lcdAlerts) { await lcdShow("ERROR: POLL", "See log"); lcdScheduleAlert(4000); }
          lastErrLogRef.current = now;
        }
      } finally {
        inflightRef.current = false;
      }
    };
    const id = setInterval(tick, 1500);
    tick();
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseURL, auto, syncLEDs, buzzEnable, buzzLatch, lcdSync, lcdAlerts]);

  // Mirror NEW warn/error log entries to LCD
  const lastLogCountRef = useRef(0);
  useEffect(() => {
    const n = logger.logs.length;
    if (!lcdSync || !lcdAlerts || n === 0 || n === lastLogCountRef.current) return;
    const latest = logger.logs[n - 1];
    lastLogCountRef.current = n;
    if (latest.level === "warn" || latest.level === "error") {
      const lvl = latest.level.toUpperCase();
      const kind = latest.kind.toUpperCase();
      const l1 = `${lvl}: ${kind}`;
      const l2 = (latest.msg || "").toString();
      (async () => { await lcdShow(l1, l2); lcdScheduleAlert(latest.level === "error" ? 9000 : 6000); })();
    }
  }, [logger.logs, lcdSync, lcdAlerts]); // eslint-disable-line react-hooks/exhaustive-deps

  async function safe<T>(fn: () => Promise<T>) {
    if (busy) return;
    setBusy(true);
    try { return await fn(); }
    catch (e:any) { setError(e?.message || "Request failed"); logger.push("system","error","Action failed", { error: String(e?.message || e) }); }
    finally { setBusy(false); }
  }

  // Derive visual LED states for animations (matches thresholds)
  const temp = thermo?.temp_c ?? null;
  const ledRedOn   = temp !== null && temp >= targetC;
  const ledGreenOn = temp !== null && temp <= (targetC - hyst);

  return (
    <>
      {/* Connection / toggles */}
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={row}>
          <input
            placeholder="http://pico-w.local or 192.168.1.42"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            style={{ width: 320, padding: 10, border: "1px solid #e5e7eb", borderRadius: 10 }}
          />
          <button onClick={() => safe(async () => { await readThermistor(); await readMotorStatus(); await readBuzzerStatus(); })} style={btnDark}>
            Connect / Refresh
          </button>
          <span style={pill}>Motor: {motor === "unknown" ? "—" : motor.toUpperCase()}</span>
          <span style={pill}>Buzzer: {buzzer.alarm ? "ALARM" : buzzer.state.toUpperCase()}</span>
          <label style={{ ...row, color: "#374151", marginLeft: 8 }}>
            <input type="checkbox" checked={auto} onChange={(e)=>setAuto(e.target.checked)} /> Auto motor (1.5s)
          </label>
          <label style={{ ...row, color: "#374151" }}>
            <input type="checkbox" checked={syncLEDs} onChange={(e)=>setSyncLEDs(e.target.checked)} /> Sync LEDs
          </label>
          <button onClick={onRelock} style={btnLight} title="Re-lock this page">Lock Now</button>
        </div>

        {/* LCD controls */}
        <div style={{ ...row, marginTop: 8 }}>
          <label style={{ ...row, color: "#374151" }}>
            <input type="checkbox" checked={lcdSync} onChange={(e)=>setLcdSync(e.target.checked)} />
            LCD sync
          </label>
          <label style={{ ...row, color: "#374151" }}>
            <input type="checkbox" checked={lcdAlerts} onChange={(e)=>setLcdAlerts(e.target.checked)} />
            LCD alerts from logs
          </label>
          <button onClick={() => safe(async () => { await lcdEnsure(); await lcdShow("LCD TEST", "Hello!"); })} style={btnLight}>
            Test LCD
          </button>
          <button onClick={() => safe(lcdClear)} style={btnLight}>
            Clear LCD
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={grid}>
        {/* Thermistor / thresholds */}
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
            <div style={{ ...hint, marginTop: 6 }}>
              Motor ON at ≥ {targetC.toFixed(1)} °C, OFF at ≤ {(targetC - hyst).toFixed(1)} °C. LEDs follow the same thresholds.
            </div>
          </div>

          <div style={{ marginTop: 8 }}>
            <button onClick={() => safe(readThermistor)} style={btnLight} disabled={!baseURL || busy}>Manual Read</button>
          </div>
        </div>

        {/* Safety buzzer */}
        <div style={card}>
          <div style={{ fontSize: 32 }}>🔔</div>
          <div style={cardTitle}>Safety Buzzer (Critical)</div>
          <div style={{ ...cardDesc, marginBottom: 8 }}>
            Starts <code>/api/buzzer/alarm</code> when temp ≥ critical. Auto-stops at ≤ (critical − hysteresis) unless latched.
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
                <input type="checkbox" checked={buzzEnable} onChange={(e)=>setBuzzEnable(e.target.checked)} />
                Enable buzzer safety
              </label>
              <label style={{ ...row, color: "#374151" }}>
                <input type="checkbox" checked={buzzLatch} onChange={(e)=>setBuzzLatch(e.target.checked)} />
                Latch until Silence
              </label>
              <button onClick={() => safe(stopAlarm)} style={btnWarn}>Silence</button>
              <button onClick={() => safe(startAlarm)} style={btnSafe}>Test</button>
            </div>

            <div style={{ ...hint }}>
              Alarm starts at ≥ {critC.toFixed(1)} °C. Auto-stops at ≤ {(critC - critHyst).toFixed(1)} °C
              {buzzLatch ? " (latch is ON: requires Silence)" : ""}.
            </div>
          </div>
        </div>

        {/* Live Indicators */}
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
              <LedDot color="red"   on={!!ledRedOn}   label="RED" />
              <LedDot color="green" on={!!ledGreenOn} label="GREEN" />
              <div style={{ color:"#6b7280", fontSize: 13 }}>
                {temp === null ? "Awaiting reading…" :
                  ledRedOn ? "Above target (RED on)" :
                  ledGreenOn ? "Below off-threshold (GREEN on)" :
                  "Deadband (both off)"}
                { !syncLEDs && <span> — (LED sync is OFF)</span> }
              </div>
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
