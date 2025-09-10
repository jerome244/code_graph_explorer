// frontend/app/pico/components/LcdGreeter.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";

/** localStorage key we already use elsewhere */
const LS_KEY = "pico_baseURL";

/** Minimal proxy same as other pages, but self-contained */
async function jgetPico<T = any>(
  baseURL: string,
  picoPath: string,
  qs?: Record<string, string | number>
): Promise<T> {
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

export default function LcdGreeter() {
  const [baseURL, setBaseURL] = useState<string>("");
  const [ok, setOk] = useState<boolean>(false);
  const [err, setErr] = useState<string>("");
  const lastSetRef = useRef<number>(0);

  useEffect(() => {
    const s = localStorage.getItem(LS_KEY) || "";
    setBaseURL(s.trim().replace(/\/$/, "").replace(/^https?:\/\//i, (m) => m) || s.trim());
  }, []);

  useEffect(() => {
    if (!baseURL) return;

    (async () => {
      try {
        // Ensure LCD is ready
        const st = await jgetPico<{ ready: boolean }>(baseURL, "/api/lcd/status");
        if (!st.ready) {
          await jgetPico(baseURL, "/api/lcd/init", { addr: "0x27", cols: 16, rows: 2 });
        }
        // Make sure backlight is on
        await jgetPico(baseURL, "/api/lcd/backlight", { state: "on" });

        // Avoid spamming if user navigates quickly
        if (Date.now() - lastSetRef.current > 400) {
          await jgetPico(baseURL, "/api/lcd/set", { row: 0, align: "left", text: "Pico Dashboard" });
          await jgetPico(baseURL, "/api/lcd/set", { row: 1, align: "left", text: "Select a tool…" });
          lastSetRef.current = Date.now();
        }
        setOk(true);
        setErr("");
      } catch (e: any) {
        setErr(e?.message || "LCD init failed");
        setOk(false);
      }
    })();
  }, [baseURL]);

  // Invisible helper (no UI), but leave a tiny footprint for debugging in dev
  if (process.env.NODE_ENV === "development") {
    return (
      <div style={{ fontSize: 12, color: ok ? "#059669" : "#b45309", marginTop: 8 }}>
        LCD: {ok ? "ready" : err ? `error: ${err}` : "…"}
      </div>
    );
  }
  return null;
}
