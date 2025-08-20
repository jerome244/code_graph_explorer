"use client";
import { useEffect, useState } from "react";

type Project = {
  id: string;
  name: string;
  description?: string;
  graph: any;
  source_language?: string;
  created_at: string;
  updated_at: string;
};

export default function ProjectsDropdown(props: {
  onLoad: (p: Project) => void;
  onDeleted?: (id: string) => void;
  onRenamed?: (p: Project) => void;
}) {
  const { onLoad, onDeleted, onRenamed } = props;
  const [items, setItems] = useState<Project[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    setLoading(true); setErr(null);
    try {
      const res = await fetch("/api/projects", { credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || "Failed to list projects");
      setItems(Array.isArray(data) ? data : data.results || []);
    } catch (e: any) {
      setErr(e.message || "Failed to list projects");
    } finally { setLoading(false); }
  }

  useEffect(() => { refresh(); }, []);

  async function del(id: string) {
    if (!confirm("Delete this project?")) return;
    const res = await fetch(`/api/projects/${id}`, { method: "DELETE", credentials: "include" });
    if (!res.ok) {
      const text = await res.text();
      alert(`Delete failed: ${text}`);
      return;
    }
    setItems((x) => x.filter((p) => p.id !== id));
    onDeleted?.(id);
  }

  async function rename(p: Project) {
    const name = prompt("New project name:", p.name);
    if (!name || name === p.name) return;
    const res = await fetch(`/api/projects/${p.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ ...p, name }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data?.detail || data?.name?.[0] || "Rename failed");
      return;
    }
    setItems((xs) => xs.map((it) => (it.id === p.id ? data : it)));
    onRenamed?.(data);
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          padding: "6px 10px",
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          background: "white",
          color: "#111827" // make trigger text visible on white
        }}
        title="My Projects"
      >
        Load ▾
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "110%", left: 0, zIndex: 10,
          width: 320, maxHeight: 300, overflow: "auto",
          background: "white", border: "1px solid #e5e7eb", borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,.08)",
          color: "#111827" // default text color inside dropdown
        }}>
          <div style={{ padding: 8, borderBottom: "1px solid #e5e7eb", fontSize: 12, color: "#6b7280" }}>
            {loading ? "Loading…" : err ? err : `${items.length} project(s)`}
          </div>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {items.map((p) => (
              <li
                key={p.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto auto",
                  gap: 8,
                  padding: 8,
                  borderBottom: "1px solid #f3f4f6"
                }}
              >
                <button
                  onClick={() => { onLoad(p); setOpen(false); }}
                  style={{
                    textAlign: "left",
                    background: "transparent",
                    border: 0,
                    cursor: "pointer",
                    color: "#111827" // ensure project name is dark
                  }}
                  title={new Date(p.updated_at).toLocaleString()}
                >
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>
                    Updated {new Date(p.updated_at).toLocaleString()}
                  </div>
                </button>
                <button
                  onClick={() => rename(p)}
                  style={{ fontSize: 12, background: "transparent", border: 0, cursor: "pointer", color: "#111827" }}
                >
                  Rename
                </button>
                <button
                  onClick={() => del(p.id)}
                  style={{ fontSize: 12, color: "#dc2626", background: "transparent", border: 0, cursor: "pointer" }}
                >
                  Delete
                </button>
              </li>
            ))}
            {items.length === 0 && !loading && (
              <li style={{ padding: 12, fontSize: 12, color: "#6b7280" }}>No projects yet.</li>
            )}
          </ul>
          <div style={{ padding: 8 }}>
            <button
              onClick={refresh}
              style={{
                fontSize: 12,
                border: "1px solid #e5e7eb",
                borderRadius: 6,
                background: "white",
                padding: "4px 8px",
                color: "#111827"
              }}
            >
              Refresh
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
