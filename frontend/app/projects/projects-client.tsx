// /app/projects/projects-client.tsx
"use client";

import { useState } from "react";

type Project = {
  id: number;
  name: string;
  owner_username?: string;
  file_count?: number;
  my_role?: "owner" | "editor" | "viewer" | string;
};

export default function ProjectsClient({ initialProjects }: { initialProjects: Project[] }) {
  const [projects, setProjects] = useState<Project[]>(initialProjects || []);
  const [busyId, setBusyId] = useState<number | null>(null);

  const deleteProject = async (p: Project) => {
    if (p.my_role !== "owner") return;
    if (!confirm(`Delete “${p.name}”? This cannot be undone.`)) return;

    const prev = projects;
    setBusyId(p.id);
    setProjects(prev.filter(x => x.id !== p.id)); // optimistic

    try {
      let r = await fetch(`/api/projects/${p.id}`, { method: "DELETE" });
      if (r.status === 401) {
        await fetch("/api/auth/refresh", { method: "POST" }).catch(() => {});
        r = await fetch(`/api/projects/${p.id}`, { method: "DELETE" });
      }
      if (!r.ok) {
        setProjects(prev); // rollback
        throw new Error(await safeText(r) || `Delete failed (${r.status})`);
      }
    } catch (e: any) {
      alert(e?.message || "Delete failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <main style={{ maxWidth: 800, margin: "2rem auto", padding: "0 16px" }}>
      <h1>My Projects</h1>
      {!projects.length ? (
        <p>No projects yet.</p>
      ) : (
        <ul style={{ padding: 0, listStyle: "none" }}>
          {projects.map(p => (
            <li key={p.id} style={{ border: "1px solid #eee", borderRadius: 8, padding: 12, marginTop: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    owner: {p.owner_username} • files: {p.file_count} • role: {p.my_role}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <a
                    href={`/graph?projectId=${p.id}`}
                    style={{ border: "1px solid #ddd", padding: "6px 10px", borderRadius: 6, background: "white" }}
                  >
                    Open
                  </a>
                  <a
                    href={`/projects/${p.id}/share`}
                    style={{ border: "1px solid #ddd", padding: "6px 10px", borderRadius: 6, background: "white" }}
                  >
                    Share…
                  </a>
                  {p.my_role === "owner" && (
                    <button
                      onClick={() => deleteProject(p)}
                      disabled={busyId === p.id}
                      style={{
                        border: "1px solid #ef4444",
                        padding: "6px 10px",
                        borderRadius: 6,
                        background: "#ef4444",
                        color: "white",
                        opacity: busyId === p.id ? 0.6 : 1,
                        cursor: busyId === p.id ? "not-allowed" : "pointer",
                      }}
                      title={busyId === p.id ? "Deleting…" : "Delete project"}
                    >
                      {busyId === p.id ? "Deleting…" : "Delete"}
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

async function safeText(r: Response) {
  try { return await r.text(); } catch { return ""; }
}
