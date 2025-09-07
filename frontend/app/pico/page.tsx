"use client";

import { useEffect, useMemo, useState } from "react";

function useLocalStorage(key: string, initial: string) {
  const [value, setValue] = useState<string>(() => {
    if (typeof window === "undefined") return initial;
    try { return window.localStorage.getItem(key) ?? initial; } catch { return initial; }
  });
  useEffect(() => { try { window.localStorage.setItem(key, value); } catch {} }, [key, value]);
  return [value, setValue] as const;
}

async function callProxy(url: string) {
  const res = await fetch("/api/pico", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) throw new Error(`Proxy ${res.status}: ${await res.text().catch(()=>"")}`);
  return res.text();
}

// Allowed & commonly broken-out pins on Pico/Pico W
const PIN_OPTIONS = [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,26,27,28];

export default function PicoPage() {
  const [host, setHost] = useLocalStorage("pico_host", "http://pico.local");
  const [pin, setPin] = useLocalStorage("pico_pin", "15");
  const [status, setStatus] = useState("Disconnected");
  const [busy, setBusy] = useState(false);
  const base = useMemo(() => host.replace(/\/+$/, ""), [host]);

  async function send(path: string) {
    setBusy(true); setStatus("Sending...");
    try { await callProxy(`${base}${path}`); setStatus(`OK: ${path}`); }
    catch (e: any) { setStatus(`Failed: ${e?.message || String(e)}`); }
    finally { setBusy(false); }
  }

  async function ping() {
    setBusy(true); setStatus("Pinging...");
    try { await callProxy(`${base}/`); setStatus("Online"); }
    catch (e: any) { setStatus(`Offline: ${e?.message || String(e)}`); }
    finally { setBusy(false); }
  }

  const pinNum = Number(pin) || 15;

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 12 }}>Raspberry&nbsp;Pi Pico&nbsp;W</h1>
      <p style={{ color: "#4b5563", marginBottom: 24 }}>
        Securely control the on-board LED and any GPIO pin via your server-side proxy.
      </p>

      <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>Pico Host / IP</label>
      <input
        value={host}
        onChange={(e) => setHost(e.target.value)}
        placeholder="http://192.168.1.131"
        style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 8, padding: "10px 12px", marginBottom: 12, fontFamily: "ui-monospace,Menlo,Consolas,monospace" }}
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
          <h2 style={{ fontWeight: 700, marginBottom: 12 }}>On-board LED</h2>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button onClick={() => send("/LED_BUILTIN/ON")}  disabled={busy} style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#f1f5f9", cursor: busy?"not-allowed":"pointer" }}>LED ON</button>
            <button onClick={() => send("/LED_BUILTIN/OFF")} disabled={busy} style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#f1f5f9", cursor: busy?"not-allowed":"pointer" }}>LED OFF</button>
          </div>
        </div>

        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
          <h2 style={{ fontWeight: 700, marginBottom: 12 }}>GPIO Pin</h2>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
            <label style={{ fontWeight: 600 }}>Pin:</label>
            <select value={pin} onChange={(e)=>setPin(e.target.value)} style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb" }}>
              {PIN_OPTIONS.map(p => <option key={p} value={p}>GP{p}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button onClick={() => send(`/GPIO/${pinNum}/ON`)}  disabled={busy} style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#f1f5f9", cursor: busy?"not-allowed":"pointer" }}>Pin ON</button>
            <button onClick={() => send(`/GPIO/${pinNum}/OFF`)} disabled={busy} style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#f1f5f9", cursor: busy?"not-allowed":"pointer" }}>Pin OFF</button>
          </div>
          <p style={{ fontSize: 12, color: "#6b7280", marginTop: 10 }}>
            Wire your LED: <strong>GP{pinNum} → 220Ω → LED anode</strong>, LED cathode → GND. High = ON.
          </p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <button onClick={ping} disabled={busy} style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#f1f5f9", cursor: busy?"not-allowed":"pointer" }}>Ping Device</button>
      </div>

      <div style={{ fontSize: 14, color: "#111827", marginBottom: 24 }}>
        Status: <span style={{ fontWeight: 700 }}>{status}</span>
      </div>

      <details>
        <summary style={{ cursor: "pointer", fontWeight: 600, marginBottom: 8 }}>Notes</summary>
        <div style={{ fontSize: 14, color: "#374151", lineHeight: 1.6 }}>
          <p>This page calls your HTTPS <code>/api/pico</code> proxy, which then reaches your Pico on <code>http://192.168.x.x</code>. No mixed content.</p>
          <p>Valid pins: GP0–GP22, GP26–GP28. Avoid GP23–GP25 for general IO on Pico W.</p>
        </div>
      </details>
    </div>
  );
}
