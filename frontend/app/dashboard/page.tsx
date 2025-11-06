// app/dashboard/page.tsx
import { cookies } from "next/headers";
import RefreshOnMount from "../(auth)/RefreshOnMount";

type ProjectListItem = {
  id: number;
  name: string;
  updated_at?: string;
  file_count?: number;
  owner_username?: string;
  my_role?: "owner" | "editor" | "viewer" | "none" | string;
};

async function getMe() {
  const access = cookies().get("access")?.value;
  if (!access) return null;

  const r = await fetch(`${process.env.DJANGO_API_BASE}/api/auth/me/`, {
    headers: { Authorization: `Bearer ${access}` },
    cache: "no-store",
  });
  if (!r.ok) return null;
  return r.json();
}

async function getRecentProjects(): Promise<ProjectListItem[]> {
  const access = cookies().get("access")?.value;
  if (!access) return [];
  const r = await fetch(`${process.env.DJANGO_API_BASE}/api/projects/`, {
    headers: { Authorization: `Bearer ${access}` },
    cache: "no-store",
  });
  if (!r.ok) return [];

  const data = await r.json();
  const items: ProjectListItem[] = Array.isArray(data) ? data : data.results || [];
  // Ensure newest first then take 4 (your API already orders by -updated_at)
  items.sort((a, b) => {
    const ta = a.updated_at ? new Date(a.updated_at).getTime() : 0;
    const tb = b.updated_at ? new Date(b.updated_at).getTime() : 0;
    return tb - ta;
  });
  return items.slice(0, 4);
}

export default async function Dashboard() {
  const me = await getMe();
  const recent = me ? await getRecentProjects() : [];

  return (
    <main style={mainStyle}>
      <h1 style={headingStyle}>Dashboard</h1>

      {!me ? (
        <>
          <RefreshOnMount />
          <p style={loadingStyle}>Loading…</p>
        </>
      ) : (
        <div style={contentStyle}>
          <p style={userInfoStyle}>
            Welcome, <strong>{me.username}</strong> ({me.email || "no email"})
          </p>

          {/* Last 4 projects */}
          <section style={sectionStyle}>
            <div style={sectionHeaderStyle}>
              <h2 style={sectionTitleStyle}>Recent projects</h2>
              <a href="/projects" style={viewAllLinkStyle}>View all →</a>
            </div>

            {recent.length === 0 ? (
              <div style={emptyStateStyle}>
                <p style={{ margin: 0 }}>No projects yet. Save one from the Graph page to see it here.</p>
              </div>
            ) : (
              <div style={cardGridStyle}>
                {recent.map((p) => (
                  <article key={p.id} style={cardStyle}>
                    <div style={thumbStyle}>
                      <div style={thumbInitialStyle}>{(p.name || "P").slice(0, 1).toUpperCase()}</div>
                    </div>
                    <div style={cardBodyStyle}>
                      <h3 style={cardTitleStyle}>{p.name}</h3>
                      <p style={cardSubtitleStyle}>
                        {p.owner_username ? `Owner: ${p.owner_username}` : "Owner unknown"}
                        {typeof p.file_count === "number" ? ` • files: ${p.file_count}` : ""}
                        {p.my_role ? ` • role: ${p.my_role}` : ""}
                      </p>
                      {p.updated_at && (
                        <p style={metaStyle}>
                          Last updated: {new Date(p.updated_at).toLocaleString()}
                        </p>
                      )}
                      <div style={cardActionsStyle}>
<a href={`/graph?projectId=${p.id}`} style={primaryBtnStyle}>Open in Graph</a>                        <a href={`/projects/${p.id}/share`} style={ghostBtnStyle}>Share</a>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          {/* Logout button removed */}
        </div>
      )}
    </main>
  );
}

/* — styles — */
const mainStyle = { maxWidth: "960px", margin: "2rem auto", padding: "0 16px 24px", backgroundColor: "#fff", boxShadow: "0 4px 12px rgba(0,0,0,.1)", borderRadius: 8 };
const headingStyle = { fontSize: 36, fontWeight: 700, color: "#333", textAlign: "center", margin: "16px 0" };
const loadingStyle = { fontSize: 16, color: "#4b5563", textAlign: "center" };
const contentStyle = { padding: 16 };
const userInfoStyle = { fontSize: 18, color: "#4b5563", marginBottom: 20, textAlign: "center" };
const sectionStyle = { margin: "12px 0 24px" };
const sectionHeaderStyle = { display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 };
const sectionTitleStyle = { fontSize: 22, margin: 0, fontWeight: 700, color: "#111827" };
const viewAllLinkStyle = { fontSize: 14, textDecoration: "none", color: "#2563eb" };
const emptyStateStyle = { border: "1px dashed #e5e7eb", borderRadius: 8, padding: 16, textAlign: "center", color: "#6b7280" };

const cardGridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 };
const cardStyle = { display: "flex", flexDirection: "column", border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden", background: "#fafafa" };
const thumbStyle = { width: "100%", height: 120, background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center" };
const thumbInitialStyle = { width: 64, height: 64, borderRadius: "50%", background: "#e5e7eb", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 24, color: "#374151" };
const cardBodyStyle = { padding: 12, display: "flex", flexDirection: "column", gap: 6 };
const cardTitleStyle = { margin: 0, fontSize: 16, fontWeight: 700, color: "#111827", lineHeight: 1.25 };
const cardSubtitleStyle = { margin: 0, fontSize: 13, color: "#6b7280" };
const metaStyle = { margin: 0, fontSize: 12, color: "#9ca3af" };
const cardActionsStyle = { marginTop: 8, display: "flex", gap: 8 };
const primaryBtnStyle = { display: "inline-block", padding: "8px 12px", fontSize: 14, backgroundColor: "#2563eb", color: "#fff", borderRadius: 8, textDecoration: "none" };
const ghostBtnStyle = { display: "inline-block", padding: "8px 12px", fontSize: 14, backgroundColor: "transparent", color: "#2563eb", borderRadius: 8, border: "1px solid #bfdbfe", textDecoration: "none" };
