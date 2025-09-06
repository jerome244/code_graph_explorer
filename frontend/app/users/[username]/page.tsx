// app/users/[username]/page.tsx
import { headers, cookies } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import ProfileActions from "./ProfileActions";
import MessagesPanel from "./MessagesPanel";

type UserPublic = {
  // optional when enriched endpoint is available
  followers_count?: number;
  following_count?: number;
  is_following?: boolean;

  id: number;
  username: string;
  bio?: string | null;
  joined?: string | null;
  avatar_url?: string | null;
};

type ProjectLite = {
  id: number;
  name: string;
  owner_username: string;
  file_count?: number;
  my_role?: string;
  updated_at?: string | null;
};

function absoluteUrl(path: string) {
  const h = headers();
  const base =
    process.env.NEXT_PUBLIC_BASE_URL ||
    `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  return `${base}${path}`;
}

function authHeader() {
  const access = cookies().get("access")?.value;
  return access ? { Authorization: `Bearer ${access}` } : {};
}

async function getUser(username: string): Promise<UserPublic | null> {
  const r = await fetch(absoluteUrl(`/api/users/${encodeURIComponent(username)}`), {
    cache: "no-store",
    headers: authHeader(),
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`User fetch failed: ${r.status}`);
  return r.json();
}

async function getMeUsername(): Promise<string | null> {
  const r = await fetch(absoluteUrl(`/api/auth/me`), {
    cache: "no-store",
    headers: authHeader(),
  });
  if (!r.ok) return null;
  const me = await r.json();
  return me?.username ?? null;
}

async function getLastProjects(username: string): Promise<ProjectLite[]> {
  const r = await fetch(absoluteUrl(`/api/users/${encodeURIComponent(username)}/projects?limit=4`), {
    cache: "no-store",
    headers: authHeader(),
  });
  if (!r.ok) return [];
  return r.json();
}

export default async function UserProfilePage({ params }: { params: { username: string } }) {
  const [user, meUsername, projects] = await Promise.all([
    getUser(params.username),
    getMeUsername(),
    getLastProjects(params.username),
  ]);
  if (!user) return notFound();

  return (
    <main style={{ maxWidth: 980, margin: "24px auto", padding: "0 16px" }}>
      {/* Header */}
      <header style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div
          aria-hidden
          style={{
            width: 64, height: 64, borderRadius: 999, background: "#eef2ff",
            display: "grid", placeItems: "center", fontWeight: 800, fontSize: 24, color: "#4f46e5",
          }}
        >
          {user.username?.[0]?.toUpperCase() ?? "?"}
        </div>
        <div>
          <h1 style={{ margin: 0 }}>{user.username}</h1>
          {user.joined && (
            <div style={{ color: "#6b7280", fontSize: 13 }}>
              Joined {new Date(user.joined).toLocaleDateString()}
            </div>
          )}
        </div>
      </header>

      {/* Follow / Message actions + follower counts */}
      <ProfileActions
        username={user.username}
        isFollowing={!!user.is_following}
        followers={user.followers_count ?? 0}
        following={user.following_count ?? 0}
      />

      {/* Bio */}
      {user.bio && (
        <section style={{ marginTop: 16 }}>
          <h2 style={{ fontSize: 16, marginBottom: 6 }}>Bio</h2>
          <p style={{ marginTop: 0, whiteSpace: "pre-wrap" }}>{user.bio}</p>
        </section>
      )}

      {/* Conversation with this user */}
      <MessagesPanel otherUsername={user.username} meUsername={meUsername} />

      {/* Latest projects */}
      <section style={{ marginTop: 24 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8 }}>
          <h2 style={{ fontSize: 18, margin: 0 }}>Latest projects</h2>
          <span style={{ color: "#6b7280", fontSize: 13 }}>
            {projects.length ? `${projects.length} shown` : "None yet"}
          </span>
        </div>

        {projects.length === 0 ? (
          <div style={{ color: "#6b7280", fontSize: 14 }}>No public/visible projects to show.</div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
              gap: 12,
            }}
          >
            {projects.slice(0, 4).map((p) => (
              <article
                key={p.id}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 12,
                  padding: 14,
                  background: "white",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <h3 style={{ margin: 0, fontSize: 16, lineHeight: 1.2 }}>{p.name}</h3>
                  {p.updated_at && (
                    <time
                      dateTime={p.updated_at}
                      style={{ color: "#9ca3af", fontSize: 11, whiteSpace: "nowrap" }}
                      title={new Date(p.updated_at).toLocaleString()}
                    >
                      {new Date(p.updated_at).toLocaleDateString()}
                    </time>
                  )}
                </div>

                <div style={{ color: "#6b7280", fontSize: 13, marginTop: 6 }}>
                  files: {p.file_count ?? "—"}
                  {p.my_role ? <> • role: {p.my_role}</> : null}
                </div>

                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <Link
                    href={`/graph?projectId=${p.id}`}
                    style={{
                      textDecoration: "none",
                      border: "1px solid #e5e7eb",
                      background: "#111827",
                      color: "white",
                      padding: "6px 10px",
                      borderRadius: 8,
                      fontSize: 13,
                    }}
                  >
                    Open
                  </Link>
                  <Link
                    href={`/projects/${p.id}/share`}
                    style={{
                      textDecoration: "none",
                      border: "1px solid #e5e7eb",
                      background: "white",
                      color: "#111827",
                      padding: "6px 10px",
                      borderRadius: 8,
                      fontSize: 13,
                    }}
                  >
                    Share…
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

export function generateMetadata({ params }: { params: { username: string } }) {
  return { title: `${params.username} • Profile` };
}
