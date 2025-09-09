"use client";

import Link from "next/link";
import React from "react";

export default function PicoDashboard() {
  return (
    <main style={{ maxWidth: 900, margin: "32px auto", padding: 24 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>
        Raspberry Pi Pico W
      </h1>
      <p style={{ color: "#6b7280", marginBottom: 24 }}>Choose a tool:</p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: 16,
        }}
      >
        {/* LED card (existing) */}
        <Link href="/pico/led" style={{ textDecoration: "none" }}>
          <div style={cardStyle}>
            <div style={{ fontSize: 32 }}>💡</div>
            <div style={cardTitle}>LED Test</div>
            <div style={cardDesc}>Turn ON/OFF or Blink the onboard LED.</div>
          </div>
        </Link>

        {/* RFID card */}
        <Link href="/pico/rfid" style={{ textDecoration: "none" }}>
          <div style={cardStyle}>
            <div style={{ fontSize: 32 }}>🪪</div>
            <div style={cardTitle}>RFID</div>
            <div style={cardDesc}>Read tag UID via MFRC522 and view last scan.</div>
          </div>
        </Link>

        {/* NEW: Motor (Relay) card */}
        <Link href="/pico/motor" style={{ textDecoration: "none" }}>
          <div style={cardStyle}>
            <div style={{ fontSize: 32 }}>🛞</div>
            <div style={cardTitle}>Motor (Relay)</div>
            <div style={cardDesc}>
              Control a 3.3V relay coil via NPN and pulse the motor.
            </div>
          </div>
        </Link>
      </div>
    </main>
  );
}

const cardStyle: React.CSSProperties = {
  display: "grid",
  gap: 8,
  padding: 16,
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  background: "#fff",
  boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
  height: "100%",
};
const cardTitle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  color: "#111827",
};
const cardDesc: React.CSSProperties = { color: "#6b7280" };
