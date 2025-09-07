"use client";

import * as React from "react";
import { normalizeBase, proxyText } from "./_lib/picoProxy";
import { useLocalStorage } from "./_lib/useLocalStorage";
import { GpioCard } from "./_components/GpioCard";
import { PwmCard } from "./_components/PwmCard";
import { JoystickCard } from "./_components/JoystickCard";
import { PressButton } from "./_components/ui";

export default function Page() {
  const [host, setHost] = useLocalStorage("pico_host", "http://pico.local");
  const [status, setStatus] = React.useState("Disconnected");
  const [topBusy, setTopBusy] = React.useState(false);
  const base = normalizeBase(host);

  async function ping() {
    setTopBusy(true);
    setStatus("Pinging...");
    try { await proxyText(`${base}/`); setStatus("Online"); }
    catch (e: any) { setStatus(`Offline: ${e?.message || String(e)}`); }
    finally { setTopBusy(false); }
  }

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 12 }}>Raspberry&nbsp;Pi Pico&nbsp;W</h1>

      <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>Pico Host / IP</label>
      <input
        value={host}
        onChange={(e) => setHost(e.target.value)}
        placeholder="http://192.168.1.131"
        style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 8, padding: "10px 12px", marginBottom: 12, fontFamily: "ui-monospace,Menlo,Consolas,monospace" }}
      />

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <PressButton
          busy={topBusy}
          onClick={() => proxyText(`${base}/LED_BUILTIN/ON`).then(()=>setStatus("LED ON")).catch((e)=>setStatus(String(e)))}
        >
          LED ON
        </PressButton>
        <PressButton
          busy={topBusy}
          onClick={() => proxyText(`${base}/LED_BUILTIN/OFF`).then(()=>setStatus("LED OFF")).catch((e)=>setStatus(String(e)))}
        >
          LED OFF
        </PressButton>
        <PressButton busy={topBusy} onClick={ping}>
          Ping Device
        </PressButton>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <GpioCard base={base} onStatus={setStatus} />
        <PwmCard  base={base} onStatus={setStatus} />
      </div>

      <JoystickCard base={base} onStatus={setStatus} />

      <div style={{ fontSize: 14, color: "#111827", marginTop: 16 }}>
        Status: <span style={{ fontWeight: 700 }}>{status}</span>
      </div>
    </div>
  );
}
