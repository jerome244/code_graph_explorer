// frontend/app/pico/page.tsx
import Link from "next/link";
import LcdGreeter from "./thermo-motor/components/LcdGreeter";

export default function PicoDashboard() {
  return (
    <main style={{ maxWidth: 900, margin: "32px auto", padding: 24 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>
        Raspberry Pi Pico W
      </h1>
      <p style={{ color: "#6b7280", marginBottom: 24 }}>Choose a tool:</p>

      {/* Ensures the LCD is initialized, backlight on, and shows a greeting */}
      <LcdGreeter />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: 16,
        }}
      >
        {/* LED */}
        <Link href="/pico/led" style={{ textDecoration: "none" }}>
          <div style={cardStyle}>
            <div style={{ fontSize: 32 }}>💡</div>
            <div style={cardTitle}>LED Test</div>
            <div style={cardDesc}>Turn ON/OFF or Blink the onboard LED.</div>
          </div>
        </Link>

        {/* RFID */}
        <Link href="/pico/rfid" style={{ textDecoration: "none" }}>
          <div style={cardStyle}>
            <div style={{ fontSize: 32 }}>🪪</div>
            <div style={cardTitle}>RFID</div>
            <div style={cardDesc}>Read tag UID via MFRC522 and view last scan.</div>
          </div>
        </Link>

        {/* Motor (Relay) */}
        <Link href="/pico/motor" style={{ textDecoration: "none" }}>
          <div style={cardStyle}>
            <div style={{ fontSize: 32 }}>🛞</div>
            <div style={cardTitle}>Motor (Relay)</div>
            <div style={cardDesc}>Control a 3.3V relay coil via NPN.</div>
          </div>
        </Link>

        {/* Thermistor */}
        <Link href="/pico/thermistor" style={{ textDecoration: "none" }}>
          <div style={cardStyle}>
            <div style={{ fontSize: 32 }}>🌡️</div>
            <div style={cardTitle}>Thermistor</div>
            <div style={cardDesc}>Read temperature via ADC (10k NTC).</div>
          </div>
        </Link>

        {/* Buzzer */}
        <Link href="/pico/buzzer" style={{ textDecoration: "none" }}>
          <div style={cardStyle}>
            <div style={{ fontSize: 32 }}>🔔</div>
            <div style={cardTitle}>Buzzer</div>
            <div style={cardDesc}>Beep or start/stop an alarm pattern.</div>
          </div>
        </Link>

        {/* DHT11 */}
        <Link href="/pico/dht11" style={{ textDecoration: "none" }}>
          <div style={cardStyle}>
            <div style={{ fontSize: 32 }}>🌡️💧</div>
            <div style={cardTitle}>DHT11</div>
            <div style={cardDesc}>Read temperature & humidity.</div>
          </div>
        </Link>

        {/* LCD1602 */}
        <Link href="/pico/lcd1602" style={{ textDecoration: "none" }}>
          <div style={cardStyle}>
            <div style={{ fontSize: 32 }}>🔤</div>
            <div style={cardTitle}>LCD1602</div>
            <div style={cardDesc}>I²C 16×2 text display controls.</div>
          </div>
        </Link>

        {/* Dual LEDs */}
        <Link href="/pico/leds" style={{ textDecoration: "none" }}>
          <div style={cardStyle}>
            <div style={{ fontSize: 32 }}>🔴🟢</div>
            <div style={cardTitle}>Dual LEDs</div>
            <div style={cardDesc}>Control separate red & green LEDs.</div>
          </div>
        </Link>

        {/* Thermo + Motor (Auto) */}
        <Link href="/pico/thermo-motor" style={{ textDecoration: "none" }}>
          <div style={cardStyle}>
            <div style={{ fontSize: 32 }}>♨️🛞</div>
            <div style={cardTitle}>Thermo ⇄ Motor</div>
            <div style={cardDesc}>Set a temp; auto start/stop motor.</div>
          </div>
        </Link>

        {/* Access Control (RFID) */}
        <Link href="/pico/access" style={{ textDecoration: "none" }}>
          <div style={cardStyle}>
            <div style={{ fontSize: 32 }}>🔒🪪</div>
            <div style={cardTitle}>Access Control</div>
            <div style={cardDesc}>Manage RFID allowlist & lock Thermo ⇄ Motor.</div>
          </div>
        </Link>

        {/* BMP180 */}
        <Link href="/pico/bmp180" style={{ textDecoration: "none" }}>
          <div style={cardStyle}>
            <div style={{ fontSize: 32 }}>⛰️</div>
            <div style={cardTitle}>BMP180</div>
            <div style={cardDesc}>Read pressure/altitude (I²C 0x77).</div>
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
const cardTitle: React.CSSProperties = { fontSize: 18, fontWeight: 700, color: "#111827" };
const cardDesc: React.CSSProperties = { color: "#6b7280" };
