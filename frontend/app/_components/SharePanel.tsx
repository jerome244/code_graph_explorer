"use client";

import { useEffect, useMemo, useState } from "react";

type Role = "owner" | "editor" | "viewer" | "none";
type User = { id: number; username: string };
type Project = {
  id: number;
  name: string;
  owner: User;
  editors: User[];
  shared_with: User[]; // viewers (includes editors too)
  my_role?: Role;
};

async function json<T>(res: Response): Promise<T> {
  const t = await res.text();
  try { return JSON.parse(t) as T; } catch { throw new Error(t || res.statusText); }
}

export default function SharePanel({ projectId }: { projectId: number | string }) {
  const [project, setProject] = useState<Project | null>(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isOwner = project?.my_role === "owner";

  const collab = useMemo(() => {
    if (!project) return { editors: [] as User[], viewers: [] as User[] };
    const editorIds = new Set(project.editors.map(u => u.id));
    const viewersOnly = project.shared_with.filter(u => !editorIds.has(u.id));
    return { editors: project.editors, viewers: viewersOnly };
  }, [project]);

  async function loadProject() {
    try {
      setError(null);
      const r = await fetch(`/api/projects/${projectId}`);
      if (!r.ok) throw new Error(await r.text());
      setProject(await r.json());
    } catch (e: any) {
      setError(e?.message || "Failed to load project");
    }
  }

  useEffect(() => { loadProject(); /* eslint-disable-next-line */ }, [projectId]);

  // search minimal debounce
  useEffect(() => {
    const h = setTimeout(async () => {
      if (!q.trim()) return setResults([]);
      try {
        const r = await fetch(`/api/auth/users/search/?q=${encodeURIComponent(q.trim())}`);
        if (!r.ok) throw new Error(await r.text());
        const list: User[] = await r.json();
        // filter out existing collaborators and owner
        const skipIds = new Set<number>([project?.owner.id ?? -1, ...(project?.shared_with ?? []).map(u => u.id)]);
        setResults(list.filter(u => !skipIds.has(u.id)));
      } catch (e: any) {
        setError(e?.message || "Search failed");
      }
    }, 300);
    return () => clearTimeout(h);
  }, [q, project]);

  async function share(usernames: string[], mode: "add" | "remove" | "replace", role: "viewer" | "editor") {
    setBusy(true);
    try {
      setError(null);
      const r = await fetch(`/api/projects/${projectId}/share/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usernames, mode, role }),
      });
      if (!r.ok) throw new Error(await r.text());
      await loadProject();
      setQ(""); setResults([]);
    } catch (e: any) {
      try {
        const d = JSON.parse(e.message);
        if (d?.detail) setError(typeof d.detail === "string" ? d.detail : JSON.stringify(d.detail));
        else if (Array.isArray(d?.missing)) setError(`Missing: ${d.missing.join(", ")}`);
        else setError(e.message);
      } catch { setError(e.message); }
    } finally {
      setBusy(false);
    }
  }

  function Row({ u, role }: { u: User; role: "viewer" | "editor" }) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 8px", borderTop: "1px solid #eee" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 24, height: 24, borderRadius: 999, background: "#eee", display: "grid", placeItems: "center", fontSize: 12 }}>
            {u.username[0]?.toUpperCase()}
          </div>
          <div style={{ fontWeight: 600 }}>{u.username}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <select
            value={role}
            onChange={(e) => {
              const val = e.target.value as "viewer" | "editor";
              if (val === role) return;
              if (val === "editor") share([u.username], "add", "editor");
              else share([u.username], "remove", "editor"); // demote to viewer
            }}
            disabled={!isOwner || busy}
          >
            <option value="viewer">Viewer</option>
            <option value="editor">Editor</option>
          </select>
          <button
            onClick={() => share([u.username], "remove", role === "editor" ? "editor" : "viewer")}
            disabled={!isOwner || busy}
            title="Remove"
            style={{ border: "1px solid #ddd", background: "white", padding: "4px 6px", borderRadius: 6 }}
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>Project</div>
          <div style={{ fontWeight: 600 }}>{project?.name ?? "—"}</div>
        </div>
        <div style={{ fontSize: 12, textTransform: "capitalize", background: "#f3f4f6", borderRadius: 999, padding: "2px 8px" }}>
          {project?.my_role ?? "—"}
        </div>
      </div>

      {error && <div style={{ marginTop: 8, color: "#b91c1c", fontSize: 14 }}>{error}</div>}

      {/* Search */}
      <div style={{ marginTop: 12 }}>
        <label htmlFor="userSearch" style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 4 }}>
          Add people by username
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            id="userSearch"
            placeholder="Search usernames…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            disabled={!isOwner || busy}
            style={{ flex: 1, border: "1px solid #ddd", borderRadius: 8, padding: "8px 10px" }}
          />
          <button
            onClick={() => {/* no-op, search is live */}}
            disabled
            style={{ border: "1px solid #eee", background: "#f9fafb", padding: "8px 10px", borderRadius: 8, color: "#9ca3af" }}
          >
            Search
          </button>
        </div>
        {!!results.length && (
          <div style={{ border: "1px solid #eee", borderRadius: 8, marginTop: 8, maxHeight: 180, overflow: "auto" }}>
            {results.map((u) => (
              <div key={u.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 8px", borderTop: "1px solid #eee" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 24, height: 24, borderRadius: 999, background: "#eee", display: "grid", placeItems: "center", fontSize: 12 }}>
                    {u.username[0]?.toUpperCase()}
                  </div>
                  <div style={{ fontWeight: 600 }}>{u.username}</div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => share([u.username], "add", "viewer")}
                    disabled={!isOwner || busy}
                    style={{ border: "1px solid #ddd", background: "white", padding: "6px 10px", borderRadius: 6 }}
                  >
                    Add as viewer
                  </button>
                  <button
                    onClick={() => share([u.username], "add", "editor")}
                    disabled={!isOwner || busy}
                    style={{ border: "1px solid #ddd", background: "white", padding: "6px 10px", borderRadius: 6 }}
                  >
                    Add as editor
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Editors */}
      <div style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>Editors</div>
        <div style={{ border: "1px solid #eee", borderRadius: 8, marginTop: 6 }}>
          {(!collab.editors.length) && <div style={{ padding: 8, color: "#6b7280", fontSize: 14 }}>No editors yet.</div>}
          {collab.editors.map((u) => <Row key={u.id} u={u} role="editor" />)}
        </div>
      </div>

      {/* Viewers */}
      <div style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>Viewers</div>
        <div style={{ border: "1px solid #eee", borderRadius: 8, marginTop: 6 }}>
          {(!collab.viewers.length) && <div style={{ padding: 8, color: "#6b7280", fontSize: 14 }}>No viewers yet.</div>}
          {collab.viewers.map((u) => <Row key={u.id} u={u} role="viewer" />)}
        </div>
      </div>
    </div>
  );
}
