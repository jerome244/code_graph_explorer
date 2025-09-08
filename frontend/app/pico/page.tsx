import Link from "next/link";

const cards: Array<{ href: string; title: string; desc: string; emoji: string }> = [
  {
    href: "/pico/led",
    title: "LED Test",
    desc: "Turn ON/OFF or Blink the onboard LED.",
    emoji: "💡",
  },
  {
    href: "/pico/network",
    title: "Network",
    desc: "View and set the device URL used by the proxy.",
    emoji: "🌐",
  },
  {
    href: "/pico/info",
    title: "Device Info",
    desc: "(placeholder) Show firmware, IP, uptime, etc.",
    emoji: "ℹ️",
  },
];

export default function PicoDashboard() {
  return (
    <main
      style={{
        maxWidth: 900,
        margin: "32px auto",
        padding: 24,
      }}
    >
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>
        Raspberry Pi Pico W
      </h1>
      <p style={{ color: "#6b7280", marginBottom: 24 }}>
        Choose a tool:
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: 16,
        }}
      >
        <Link href="/pico/led" style={{ textDecoration: "none" }}>
          <div
            style={{
              display: "grid",
              gap: 8,
              padding: 16,
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              background: "#fff",
              boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
              height: "100%",
            }}
          >
            <div style={{ fontSize: 32 }}>💡</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#111827" }}>
              LED Test
            </div>
            <div style={{ color: "#6b7280" }}>
              Turn ON/OFF or Blink the onboard LED.
            </div>
          </div>
        </Link>
      </div>
    </main>
  );
}

