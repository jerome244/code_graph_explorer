"use client";
import { useState } from "react";
import { proxyText } from "../_lib/picoProxy";
import { useLocalStorage } from "../_lib/useLocalStorage";
import { PressButton } from "./ui";

const PIN_OPTIONS = [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,26,27,28];

export function GpioCard({ base, onStatus }: { base: string; onStatus: (s: string)=>void }) {
  const [pin, setPin] = useLocalStorage("pico_pin", "15");
  const [busy, setBusy] = useState(false);
  const pinNum = Number(pin) || 15;

  async function send(path: string) {
    setBusy(true); onStatus("Sending...");
    try { await proxyText(`${base}${path}`); onStatus(`OK: ${path}`); }
    catch (e:any){ onStatus(`Failed: ${e?.message||String(e)}`); }
    finally { setBusy(false); }
  }

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
      <h2 style={{ fontWeight: 700, marginBottom: 12 }}>GPIO Pin</h2>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
        <label style={{ fontWeight: 600 }}>Pin:</label>
        <select value={pin} onChange={(e)=>setPin(e.target.value)} style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb" }}>
          {PIN_OPTIONS.map(p => <option key={p} value={p}>GP{p}</option>)}
        </select>
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <PressButton onClick={() => send(`/GPIO/${pinNum}/ON`)}  busy={busy}>Pin ON</PressButton>
        <PressButton onClick={() => send(`/GPIO/${pinNum}/OFF`)} busy={busy}>Pin OFF</PressButton>
      </div>
      <p style={{ fontSize: 12, color: "#6b7280", marginTop: 10 }}>
        For an LED: <strong>GP{pinNum} → 220Ω → LED anode</strong>, LED cathode → GND. High = ON.
      </p>
    </div>
  );
}
