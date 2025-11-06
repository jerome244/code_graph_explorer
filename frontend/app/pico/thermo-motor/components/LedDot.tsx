// frontend/app/pico/thermo-motor/components/LedDot.tsx
"use client";
import React from "react";

export default function LedDot({ color, on, label }: { color: "red" | "green"; on: boolean; label: string }) {
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
