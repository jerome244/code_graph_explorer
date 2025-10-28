// frontend/app/pico/thermo-motor/lib/hooks.ts
"use client";

import { useEffect, useMemo, useState } from "react";
import { LS_KEY, LS_LOG, LS_LOG_SEEN } from "./storage";
import type { LogFilters, LogItem, LogKind, LogLevel, TimePreset } from "./types";

export function useBaseURL() {
  const [raw, setRaw] = useState("");
  useEffect(() => { const s = localStorage.getItem(LS_KEY); if (s) setRaw(s); }, []);
  const baseURL = useMemo(() => {
    const s = raw.trim(); if (!s) return "";
    return /^https?:\/\//i.test(s) ? s.replace(/\/$/, "") : `http://${s}`;
  }, [raw]);
  const save = (v: string) => { setRaw(v); localStorage.setItem(LS_KEY, v); };
  return { input: raw, setInput: save, baseURL } as const;
}

export function useLogger() {
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
    try { const js = JSON.parse(localStorage.getItem(LS_LOG) || "[]"); if (Array.isArray(js)) setLogs(js); } catch {}
  }, []);

  function persist(arr: LogItem[]) { localStorage.setItem(LS_LOG, JSON.stringify(arr)); }

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
    const a = document.createElement("a"); a.href = url; a.download = "pico-log.json"; a.click();
    URL.revokeObjectURL(url);
  }

  function markAllRead() {
    const ts = Date.now();
    setSeenTs(ts);
    localStorage.setItem(LS_LOG_SEEN, String(ts));
  }

  const unread = (() => {
    let warn = 0, err = 0;
    for (const it of logs) {
      if (it.ts <= seenTs) continue;
      if (it.level === "warn") warn++;
      if (it.level === "error") err++;
    }
    return { warn, err, total: warn + err };
  })();

  const filtered = (() => {
    const now = Date.now();
    const since = ((time: TimePreset) => {
      switch (time) {
        case "5m": return now - 5 * 60_000;
        case "15m": return now - 15 * 60_000;
        case "1h": return now - 60 * 60_000;
        case "24h": return now - 24 * 60 * 60_000;
        default: return 0;
      }
    })(filters.time);
    const q = filters.q.trim().toLowerCase();
    return [...logs].filter(it => {
      if (!filters.kinds[it.kind]) return false;
      if (filters.level !== "all" && it.level !== filters.level) return false;
      if (since && it.ts < since) return false;
      if (q && !(it.msg.toLowerCase().includes(q) || JSON.stringify(it.data || {}).toLowerCase().includes(q))) return false;
      return true;
    }).sort((a, b) => b.ts - a.ts);
  })();

  return { logs, filtered, filters, setFilters, push, clear, exportJSON, unread, markAllRead };
}
