"use client";
import { useEffect, useState } from "react";

type Project = {
  id: string;
  name: string;
  updated_at: string;
  graph: any;
};

export default function ProjectsPage() {
  const [items, setItems] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/projects", { credentials: "include" });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.detail || "Failed to list projects");
        setItems(Array.isArray(data) ? data : data.results || []);
      } catch (e: any) {
        setErr(e.message || "Failed to list projects");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <main style={{ maxWidth: 720, margin: "40px auto", padding: 16 }}>
      <h1 style={{ marginTop: 0 }}>My Projects</h1>
      {loading && <div>Loading…</div>}
      {err && <div style={{ color: "#dc2626" }}>{err}</div>}
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {items.map((p) => (
          <li key={p.id} style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 0", borderBottom: "1px solid #eee" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{p.name}</div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>
                Updated {new Date(p.updated_at).toLocaleString()}
              </div>
            </div>
            <a href={`/graph?project=${p.id}`} style={{ border: "1px solid #e5e7eb", borderRadius: 6, padding: "6px 10px", textDecoration: "none" }}>
              Open
            </a>
          </li>
        ))}
        {!loading && items.length === 0 && <li>No projects yet.</li>}
      </ul>
    </main>
  );
}
