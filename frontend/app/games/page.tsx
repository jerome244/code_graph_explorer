import Link from "next/link";

export default function GamesPage() {
  const dark = {
    pageBg: "#0b1020",
    text: "#e6e8ee",
    subText: "rgba(230,232,238,0.75)",
    panelBg: "rgba(255,255,255,0.06)",
    panelBorder: "rgba(255,255,255,0.10)",
    cardHoverBg: "rgba(255,255,255,0.10)",
    accent: "#9bb8ff",
    glow: "radial-gradient(1200px 400px at 50% -10%, rgba(124,143,255,0.12), rgba(11,16,32,0))",
  } as const;

  const mainStyle: React.CSSProperties = {
    maxWidth: 960,
    margin: "0 auto",
    padding: "32px 16px",
    minHeight: "calc(100vh - 56px)",
    color: dark.text,
    background: dark.glow,
  };

  const headingStyle: React.CSSProperties = {
    fontSize: 28,
    fontWeight: 800,
    marginBottom: 8,
    letterSpacing: "-0.01em",
    backgroundImage: "linear-gradient(180deg, #fff, rgba(255,255,255,0.7))",
    WebkitBackgroundClip: "text",
    color: "transparent",
  };

  const subStyle: React.CSSProperties = {
    marginBottom: 24,
    color: dark.subText,
    fontSize: 15,
    lineHeight: 1.6,
  };

  const listStyle: React.CSSProperties = {
    display: "grid",
    gap: 12,
    listStyle: "none",
    padding: 0,
  };

  const linkCardStyle: React.CSSProperties = {
    display: "block",
    padding: "12px 16px",
    borderRadius: 12,
    textDecoration: "none",
    background: dark.panelBg,
    border: `1px solid ${dark.panelBorder}`,
    color: dark.text,
    transition: "transform 120ms ease, background-color 160ms ease, border-color 160ms ease",
  };

  return (
    <main style={mainStyle}>
      <h1 style={headingStyle}>Games</h1>
      <p style={subStyle}>Choose a game to explore (public pages).</p>

      <ul style={listStyle}>
        <li>
          <Link href="/games/minecraft" style={linkCardStyle} className="game-link">
            Minecraft
          </Link>
        </li>
        {/* Add more game links here as needed */}
      </ul>

      <style>{`
        :root { background-color: ${dark.pageBg}; }
        .game-link:hover {
          background-color: ${dark.cardHoverBg};
          border-color: ${dark.panelBorder};
          transform: translateY(-1px);
        }
      `}</style>
    </main>
  );
}
