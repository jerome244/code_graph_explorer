// frontend/app/pico/thermo-motor/components/MotorAnim.tsx
"use client";
import React from "react";

export default function MotorAnim({ running }: { running: boolean }) {
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
