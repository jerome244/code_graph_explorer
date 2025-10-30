// frontend/app/profile/page.tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

// Next 14: cookies() is sync
function apiHeaders(init?: HeadersInit) {
  const access = cookies().get("access")?.value;
  if (!access) redirect("/login?next=/profile");
  const h = new Headers(init);
  h.set("Authorization", `Bearer ${access}`);
  return h;
}

async function apiFetch(path: string, init: RequestInit = {}) {
  return fetch(`${process.env.DJANGO_API_BASE}${path}`, {
    ...init,
    headers: apiHeaders(init.headers),
    cache: "no-store",
  });
}

async function getMe() {
  const r = await apiFetch("/api/auth/me/");
  if (!r.ok) return null;
  return r.json();
}

type SocialInfo = { followers_count?: number; following_count?: number };
async function getSocialCounts(username: string): Promise<SocialInfo | null> {
  const r = await apiFetch(`/api/auth/users/${encodeURIComponent(username)}/`);
  if (!r.ok) return null;
  return r.json();
}

const dark = {
  pageBg: "#0b1020",
  text: "#e6e8ee",
  subText: "rgba(230,232,238,0.75)",
  glow: "radial-gradient(1200px 400px at 50% -10%, rgba(124,143,255,0.12), rgba(11,16,32,0))",
  panelBg: "rgba(255,255,255,0.06)",
  panelBorder: "rgba(255,255,255,0.10)",
  panelHeaderBg: "rgba(255,255,255,0.08)",
  accent: "#9bb8ff",
  primary: "#2563eb",
  primaryBorder: "#1d4ed8",
} as const;

const mainStyle: React.CSSProperties = {
  maxWidth: 900,
  margin: "32px auto",
  padding: "0 16px 40px",
  color: dark.text,
  background: dark.glow,
  minHeight: "calc(100vh - 56px)",
};

const headingRow: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: 12,
  marginBottom: 10,
};

const h1Style: React.CSSProperties = {
  fontSize: 30,
  fontWeight: 800,
  marginBottom: 8,
  backgroundImage: "linear-gradient(180deg, #fff, rgba(255,255,255,0.72))",
  WebkitBackgroundClip: "text",
  color: "transparent",
  letterSpacing: "-0.01em",
};

const subStyle: React.CSSProperties = {
  color: dark.subText,
  marginBottom: 24,
  lineHeight: 1.6,
};

const btnGhost: React.CSSProperties = {
  textDecoration: "none",
  padding: "9px 12px",
  borderRadius: 10,
  border: `1px solid ${dark.panelBorder}`,
  background: dark.panelBg,
  color: dark.text,
  fontWeight: 700,
};

const btnPrimary: React.CSSProperties = {
  textDecoration: "none",
  padding: "9px 12px",
  borderRadius: 10,
  border: `1px solid ${dark.primaryBorder}`,
  background: dark.primary,
  color: "#fff",
  fontWeight: 800,
  marginLeft: 8,
};

const card: React.CSSProperties = {
  border: `1px solid ${dark.panelBorder}`,
  borderRadius: 12,
  padding: 16,
  background: dark.panelBg,
  boxShadow: "0 8px 30px rgba(0,0,0,0.25)",
};

const h2: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 800,
  marginBottom: 12,
  color: dark.text,
};

export default async function ProfilePage() {
  const me = await getMe();
  if (!me) redirect("/login?next=/profile");
  const social = me?.username ? await getSocialCounts(me.username) : null;

  return (
    <main style={mainStyle}>
      <div style={headingRow}>
        <h1 style={h1Style}>Your Profile</h1>
        <a href="/settings/profile" style={{ ...btnGhost, marginLeft: "auto" }}>
          Edit profile
        </a>
        <a href="/messages" style={btnPrimary}>
          Open messages
        </a>
      </div>

      <p style={subStyle}>
        See your social stats here. Use “Open messages” to read and reply in the dedicated page.
      </p>

      {/* Social only */}
      <section style={card}>
        <h2 style={h2}>Social</h2>
        {social ? (
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <div>
              <strong>{social.followers_count ?? 0}</strong> followers
            </div>
            <div>
              <strong>{social.following_count ?? 0}</strong> following
            </div>
            <a
              href={`/users/${me.username}`}
              style={{
                marginLeft: "auto",
                textDecoration: "none",
                fontWeight: 700,
                color: dark.accent,
              }}
            >
              View my public profile →
            </a>
          </div>
        ) : (
          <div style={{ color: dark.subText }}>Followers data not available.</div>
        )}
      </section>

      <style>{`
        :root { background-color: ${dark.pageBg}; }
        a:hover { transform: translateY(-1px); }
      `}</style>
    </main>
  );
}
