import Link from "next/link";

export default function GamesPage() {
  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "32px 16px" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>Games</h1>
      <p style={{ marginBottom: 24 }}>
        Choose a game to explore (public pages).
      </p>

      <ul style={{ display: "grid", gap: 12, listStyle: "none", padding: 0 }}>
        <li>
          <Link
            href="/games/minecraft"
            style={{
              display: "inline-block",
              padding: "10px 14px",
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              textDecoration: "none",
              color: "#111827",
            }}
          >
            Minecraft
          </Link>
        </li>
        {/* Add more game links here as needed */}
      </ul>
    </main>
  );
}
