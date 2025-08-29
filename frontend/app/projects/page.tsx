import { cookies } from "next/headers";

async function getProjects() {
  const access = cookies().get("access")?.value;
  if (!access) return [];
  const r = await fetch(`${process.env.DJANGO_API_BASE}/api/projects/`, { headers: { Authorization: `Bearer ${access}` }, cache: "no-store" });
  if (!r.ok) return [];
  return r.json();
}

export default async function ProjectsPage() {
  const projects: any[] = await getProjects();

  return (
    <main style={{ maxWidth: 800, margin: "2rem auto", padding: "0 16px" }}>
      <h1>My Projects</h1>
      {!projects.length ? <p>No projects yet.</p> : (
        <ul style={{ padding: 0, listStyle: "none" }}>
          {projects.map(p => (
            <li key={p.id} style={{ border: "1px solid #eee", borderRadius: 8, padding: 12, marginTop: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>owner: {p.owner_username} • files: {p.file_count} • role: {p.my_role}</div>
                </div>
                <a href={`/projects/${p.id}/share`} style={{ border: "1px solid #ddd", padding: "6px 10px", borderRadius: 6, background: "white" }}>
                  Share…
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
