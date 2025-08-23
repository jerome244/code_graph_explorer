// app/page.tsx
import Link from "next/link";
import { apiFetch } from "@/lib/api";

type Me = {
  id: number;
  username: string;
  first_name?: string | null;
  role?: "USER" | "ADMIN";
};

export default async function HomePage() {
  let me: Me | null = null;
  try {
    me = await apiFetch("/api/users/me/");
  } catch {
    me = null;
  }

  return (
    <main style={{ padding: 24, maxWidth: 960, margin: "0 auto" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 24,
        }}
      >
        <h1 style={{ margin: 0 }}>Code Graph Explorer</h1>
        <nav style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link
            href="/graph"
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #e5e7eb",
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            Go to Graph
          </Link>

          {/* Games */}
          <Link
            href="/doom"
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #e5e7eb",
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            Play Doom-like
          </Link>
          <Link
            href="/pong"
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #e5e7eb",
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            Play Pong
          </Link>
          <Link
            href="/kart"
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #e5e7eb",
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            Play Mini Kart
          </Link>
          <Link
            href="/craft"
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #e5e7eb",
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            Play Craft
          </Link>
          <Link
            href="/brawler"
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #e5e7eb",
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            Play Brawler
          </Link>
          <Link
            href="/betting"
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #e5e7eb",
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            Sports Odds
          </Link>

          <Link
            href="/osint"
            style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #e5e7eb", textDecoration: "none", fontWeight: 600 }}
          >
            OSINT Lab
          </Link>

          {me ? (
            <form action="/api/users/logout" method="post">
              <button type="submit">Logout</button>
            </form>
          ) : (
            <>
              <Link
                href="/login"
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                  textDecoration: "none",
                  fontWeight: 600,
                }}
              >
                Login
              </Link>
              <Link
                href="/register"
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                  textDecoration: "none",
                  fontWeight: 600,
                }}
              >
                Register
              </Link>
            </>
          )}
        </nav>
      </header>

      {me ? (
        <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
          <h2 style={{ marginTop: 0 }}>Welcome, {me.first_name || me.username} 👋</h2>
          <p style={{ color: "#6b7280" }}>You’re signed in. Jump into the Graph any time.</p>
        </section>
      ) : (
        <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
          <h2 style={{ marginTop: 0 }}>Explore without an account</h2>
          <p style={{ color: "#6b7280" }}>
            You can upload a ZIP or import from GitHub on the Graph page without registering. Accounts are only needed if you want
            auth-protected features later.
          </p>
        </section>
      )}
    </main>
  );
}
