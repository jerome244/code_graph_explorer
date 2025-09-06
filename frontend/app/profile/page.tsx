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

export default async function ProfilePage() {
  const me = await getMe();
  if (!me) redirect("/login?next=/profile");
  const social = me?.username ? await getSocialCounts(me.username) : null;

  return (
    <main style={{ maxWidth: 880, margin: "32px auto", padding: "0 16px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Your Profile</h1>
        <a
          href="/settings/profile"
          style={{
            marginLeft: "auto",
            textDecoration: "none",
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #e5e7eb",
            background: "#fff",
            color: "#111827",
            fontWeight: 600,
          }}
        >
          Edit profile
        </a>
        <a
          href="/messages"
          style={{
            textDecoration: "none",
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #2563eb",
            background: "#2563eb",
            color: "#fff",
            fontWeight: 700,
            marginLeft: 8,
          }}
        >
          Open messages
        </a>
      </div>

      <p style={{ color: "#6b7280", marginBottom: 24 }}>
        See your social stats here. Use “Open messages” to read and reply in the dedicated page.
      </p>

      {/* Social only */}
      <section style={card}>
        <h2 style={h2}>Social</h2>
        {social ? (
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <div><strong>{social.followers_count ?? 0}</strong> followers</div>
            <div><strong>{social.following_count ?? 0}</strong> following</div>
            <a
              href={`/users/${me.username}`}
              style={{ marginLeft: "auto", textDecoration: "none", fontWeight: 600 }}
            >
              View my public profile →
            </a>
          </div>
        ) : (
          <div style={{ color: "#6b7280" }}>Followers data not available.</div>
        )}
      </section>
    </main>
  );
}

const card: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: 16,
  background: "#fff",
};
const h2: React.CSSProperties = { fontSize: 18, fontWeight: 700, marginBottom: 12 };
