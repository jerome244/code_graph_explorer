"use client";

import { useEffect, useMemo, useState } from "react";

function useLocalStorage(key: string, initial: string) {
  const [value, setValue] = useState<string>(() => {
    if (typeof window === "undefined") return initial;
    try {
      const v = window.localStorage.getItem(key);
      return v ?? initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(key, value);
    } catch {}
  }, [key, value]);
  return [value, setValue] as const;
}

async function callProxy(url: string) {
  // You can use POST or GET; POST keeps URLs out of logs/history.
  const res = await fetch("/api/pico", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Proxy ${res.status}: ${text || "error"}`);
  }
  return res.text(); // device may return "OK" or HTML
}

export default function PicoPage() {
  const [host, setHost] = useLocalStorage("pico_host", "http://pico.local");
  const [status, setStatus] = useState<string>("Disconnected");
  const [busy, setBusy] = useState<boolean>(false);
  const base = useMemo(() => host.replace(/\/+$/, ""), [host]);

  async function send(path: string) {
    setBusy(true);
    setStatus("Sending...");
    try {
      const url = `${base}${path}`;
      await callProxy(url);
      setStatus(`OK: ${path}`);
    } catch (e: any) {
      setStatus(`Failed: ${e?.message || String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function ping() {
    setBusy(true);
    setStatus("Pinging...");
    try {
      await callProxy(`${base}/`);
      setStatus("Online");
    } catch (e: any) {
      setStatus(`Offline: ${e?.message || String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 12 }}>
        Raspberry&nbsp;Pi Pico&nbsp;W
      </h1>
      <p style={{ color: "#4b5563", marginBottom: 24 }}>
        Control the onboard LED of your Pico W from this web app via a secure proxy.
      </p>

      <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
        Pico Host / IP
      </label>
      <input
        value={host}
        onChange={(e) => setHost(e.target.value)}
        placeholder="http://192.168.1.131"
        style={{
          width: "100%",
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          padding: "10px 12px",
          marginBottom: 12,
          fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
        }}
      />

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <button
          onClick={() => send("/LED_BUILTIN/ON")}
          disabled={busy}
          style={{
            padding: "10px 16px",
            borderRadius: 8,
            border: "1px solid #e5e7eb",
            background: "#f1f5f9",
            cursor: busy ? "not-allowed" : "pointer",
          }}
        >
          LED ON
        </button>
        <button
          onClick={() => send("/LED_BUILTIN/OFF")}
          disabled={busy}
          style={{
            padding: "10px 16px",
            borderRadius: 8,
            border: "1px solid #e5e7eb",
            background: "#f1f5f9",
            cursor: busy ? "not-allowed" : "pointer",
          }}
        >
          LED OFF
        </button>
        <button
          onClick={ping}
          disabled={busy}
          style={{
            padding: "10px 16px",
            borderRadius: 8,
            border: "1px solid #e5e7eb",
            background: "#f1f5f9",
            cursor: busy ? "not-allowed" : "pointer",
          }}
        >
          Ping
        </button>
      </div>

      <div style={{ fontSize: 14, color: "#111827", marginBottom: 24 }}>
        Status: <span style={{ fontWeight: 700 }}>{status}</span>
      </div>

      <details>
        <summary style={{ cursor: "pointer", fontWeight: 600, marginBottom: 8 }}>
          Notes
        </summary>
        <div style={{ fontSize: 14, color: "#374151", lineHeight: 1.6 }}>
          <p>
            Because this page is served over <strong>HTTPS</strong>, direct browser requests to
            <code> http://192.168.x.x </code> are blocked as mixed content. The app calls{" "}
            <code>/api/pico</code> on your server instead, which makes the LAN request server-side.
          </p>
        </div>
      </details>
    </div>
  );
}
