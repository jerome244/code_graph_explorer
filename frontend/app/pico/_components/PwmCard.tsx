"use client";
import { useState } from "react";
import { proxyText } from "../_lib/picoProxy";
import { useLocalStorage } from "../_lib/useLocalStorage";
import { PressButton } from "./ui";

const PIN_OPTIONS = [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,26,27,28];

export function PwmCard({ base, onStatus }: { base: string; onStatus: (s: string)=>void }) {
  const [pwmPin, setPwmPin] = useLocalStorage("pico_pwm_pin", "15");
  const [pwmDuty, setPwmDuty] = useLocalStorage("pwm_duty", "50");
  const [busy, setBusy] = useState(false);

  const pin = Number(pwmPin) || 15;
  const dutyNum = Math.max(0, Math.min(100, Number(pwmDuty) || 0));

  async function send(path: string) {
    setBusy(true); onStatus("Sending...");
    try { await proxyText(`${base}${path}`); onStatus(`OK: ${path}`); }
    catch (e:any){ onStatus(`Failed: ${e?.message||String(e)}`); }
    finally { setBusy(false); }
  }

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
      <h2 style={{ fontWeight: 700, marginBottom: 12 }}>PWM</h2>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <label style={{ fontWeight: 600 }}>Pin:</label>
        <select value={pwmPin} onChange={(e)=>setPwmPin(e.target.value)} style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb" }}>
          {PIN_OPTIONS.map(p => <option key={p} value={p}>GP{p}</option>)}
        </select>
        <label style={{ fontWeight: 600, marginLeft: 16 }}>Duty:</label>
        <input type="range" min={0} max={100} value={dutyNum} onChange={(e)=>setPwmDuty(e.target.value)} style={{ width: 200 }} />
        <span style={{ width: 48, textAlign: "right" }}>{dutyNum}%</span>
        <PressButton onClick={()=>send(`/PWM/${pin}/${dutyNum}`)} busy={busy}>Set</PressButton>
        <PressButton onClick={()=>send(`/PWMOFF/${pin}`)} busy={busy}>Stop</PressButton>
      </div>
      <p style={{ fontSize: 12, color: "#6b7280" }}>
        Use a pin wired to an LED (via 220Ω) to dim it. Duty is 0–100%.
      </p>
    </div>
  );
}
