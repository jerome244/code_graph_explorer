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
 *  LOGGING: hook + panel
 *  ────────────────────────────────────────────────────────────*/
function useLogger() {
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [filters, setFilters] = useState<LogFilters>({
    kinds: { access: true, motor: true, buzzer: true, system: true },
    level: "all",
    q: "",
    time: "1h",
  });

  // load once
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
      // keep last 500
      if (arr.length > 500) arr.splice(0, arr.length - 500);
      persist(arr);
      return arr;
    });
  }

  function clear() { setLogs([]); persist([]); }

  function exportJSON() {
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "pico-log.json"; a.click();
    URL.revokeObjectURL(url);
  }

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

  return { logs, filtered, filters, setFilters, push, clear, exportJSON };
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
  filtered, filters, setFilters, clear, exportJSON,
}: {
  filtered: LogItem[];
  filters: LogFilters;
  setFilters: React.Dispatch<React.SetStateAction<LogFilters>>;
  clear: () => void;
  exportJSON: () => void;
}) {
  return (
    <div style={{ ...card, gridColumn: "1 / -1" }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: "#111827" }}>Log</div>

      {/* Filters */}
      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr auto", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <label style={{ ...row, color: "#374151" }}>
            <input
              type="checkbox"
              checked={filters.kinds.access}
              onChange={(e)=>setFilters(s => ({ ...s, kinds: { ...s.kinds, access: e.target.checked } }))}
            /> Access
          </label>
          <label style={{ ...row, color: "#374151" }}>
            <input
              type="checkbox"
              checked={filters.kinds.motor}
              onChange={(e)=>setFilters(s => ({ ...s, kinds: { ...s.kinds, motor: e.target.checked } }))}
            /> Motor
          </label>
          <label style={{ ...row, color: "#374151" }}>
            <input
              type="checkbox"
              checked={filters.kinds.buzzer}
              onChange={(e)=>setFilters(s => ({ ...s, kinds: { ...s.kinds, buzzer: e.target.checked } }))}
            /> Buzzer
          </label>
          <label style={{ ...row, color: "#374151" }}>
            <input
              type="checkbox"
              checked={filters.kinds.system}
              onChange={(e)=>setFilters(s => ({ ...s, kinds: { ...s.kinds, system: e.target.checked } }))}
            /> System
          </label>

          <select
            value={filters.level}
            onChange={(e)=>setFilters(s => ({ ...s, level: e.target.value as any }))}
            style={{ padding: 8, borderRadius: 10, border: "1px solid #e5e7eb" }}
          >
            <option value="all">Level: all</option>
            <option value="info">info</option>
            <option value="warn">warn</option>
            <option value="error">error</option>
          </select>

          <select
            value={filters.time}
            onChange={(e)=>setFilters(s => ({ ...s, time: e.target.value as TimePreset }))}
            style={{ padding: 8, borderRadius: 10, border: "1px solid #e5e7eb" }}
          >
            <option value="5m">Last 5m</option>
            <option value="15m">Last 15m</option>
            <option value="1h">Last 1h</option>
            <option value="24h">Last 24h</option>
            <option value="all">All</option>
          </select>

          <input
            placeholder="Search…"
            value={filters.q}
            onChange={(e)=>setFilters(s => ({ ...s, q: e.target.value }))}
            style={{ minWidth: 200, padding: 8, borderRadius: 10, border: "1px solid #e5e7eb" }}
          />
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={exportJSON} style={btnLight}>Export JSON</button>
          <button onClick={clear} style={btnWarn}>Clear</button>
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
 *  OUTER WRAPPER: handles RFID gate, logger, renders child
 *  ────────────────────────────────────────────────────────────*/
export default function ThermoMotorPage() {
  const { input, setInput, baseURL } = useBaseURL();
  const logger = useLogger();

  // Gate state (always mounted)
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
          <p style={{ color: "#6b7280" }}>
            {locked ? "This page is protected by RFID. " : ""}
            Motor auto ON/OFF around target; LEDs show zone; buzzer alarms at critical temp.
          </p>
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

      {/* Log always visible (shows gate & app events) */}
      <LogPanel
        filtered={logger.filtered}
        filters={logger.filters}
        setFilters={logger.setFilters}
        clear={logger.clear}
        exportJSON={logger.exportJSON}
      />
    </main>
  );
}

/** ─────────────────────────────────────────────────────────────
 *  CHILD: the full thermo/motor/buzzer app (adds log hooks)
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
  const [buzzLatch, setBuzzLatch] = useState(false); // auto-stop by default

  const [busy, setBusy] = useState(false);

  // Refs
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

  // Local proxy helper
  async function jget<T=any>(p: string, qs?: Record<string,string|number>) {
    return jgetPico<T>(baseURL, p, qs);
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
      // (optional) could log LED changes; skipping to avoid noise
    } catch {}
  }

  // Initial connect
  useEffect(() => {
    if (!baseURL) return;
    (async () => {
      try { await readThermistor(); await readMotorStatus(); await readBuzzerStatus(); }
      catch (e:any) { setError(e?.message || "Request failed"); logger.push("system","error","Initial connect failed", { error: String(e?.message || e) }); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseURL]);

  // Poll loop
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
        }
      } catch (e:any) {
        setError(e?.message || "Request failed");
        const now = Date.now();
        if (now - lastErrLogRef.current > 5000) {
          logger.push("system","error","Poll failed", { error: String(e?.message || e) });
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
  }, [baseURL, auto, syncLEDs, buzzEnable, buzzLatch]);

  async function safe<T>(fn: () => Promise<T>) {
    if (busy) return;
    setBusy(true);
    try { return await fn(); }
    catch (e:any) { setError(e?.message || "Request failed"); logger.push("system","error","Action failed", { error: String(e?.message || e) }); }
    finally { setBusy(false); }
  }

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
