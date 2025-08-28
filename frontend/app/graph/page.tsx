"use client";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { TreeNode } from "@/app/api/graph/upload/route";
import UploadDropzone from "./components/UploadDropzone";
import FileTree from "./components/FileTree";
import GraphView from "./components/GraphView";
import ShareButton from "./components/ShareButton";
import Link from "next/link";

type Role = "owner" | "viewer" | "editor" | null;

type ProjectMeta = {
  id: number;
  name: string;
  is_owner: boolean;
  role: Role;
  owner?: { id: number; username: string };
};

export default function GraphPage() {
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [nodes, setNodes] = useState<any[]>([]);
  const [edges, setEdges] = useState<any[]>([]);
  const [isAuthed, setIsAuthed] = useState(false);

  // Save
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("");

  // Load
  type P = {
    id: number;
    name: string;
    created_at: string;
    updated_at: string;
    file_count: number;
    is_owner?: boolean;
    role?: Role;
    owner?: { id: number; username: string };
    data?: any;
  };
  const [projects, setProjects] = useState<P[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [loadMsg, setLoadMsg] = useState<string | null>(null);

  // For Share button + badges
  const [currentProject, setCurrentProject] = useState<ProjectMeta | null>(null);

  const params = useSearchParams();
  const paramId = useMemo(() => params.get("id"), [params]);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" }).then((r) => setIsAuthed(r.ok));
  }, []);

  // helper: derive ProjectMeta from the list when detail lacks fields
  function metaFromList(id: string | number): ProjectMeta | null {
    const p = projects.find((x) => String(x.id) === String(id));
    if (!p) return null;
    return {
      id: p.id,
      name: p.name,
      is_owner: Boolean(p.is_owner),
      role: (p.role ?? (p.is_owner ? "owner" : null)) as Role,
      owner: p.owner,
    };
  }

  // Load list; if ?id= provided, set meta early and then fetch detail
  useEffect(() => {
    if (!isAuthed) return;
    (async () => {
      const r = await fetch("/api/projects/list", { cache: "no-store" });
      if (!r.ok) return;
      const list: P[] = await r.json();
      setProjects(list);

      if (paramId && list.some((p) => String(p.id) === paramId)) {
        setSelectedId(paramId);
        const m = metaFromList(paramId);
        if (m) setCurrentProject(m); // lets the Share button decide visibility immediately
        loadById(paramId);
      }
    })();
  }, [isAuthed, paramId]);

  async function saveProject() {
    setSaveMsg(null);
    if (!tree || nodes.length === 0) {
      setSaveMsg("Nothing to save yet — upload a project first.");
      return;
    }
    setSaving(true);
    const name = projectName.trim() || "Untitled project";
    const r = await fetch("/api/projects/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, data: { tree, nodes, edges } }),
    });
    const data = await r.json().catch(() => ({}));
    setSaving(false);
    if (!r.ok) {
      setSaveMsg(typeof (data as any)?.error === "string" ? (data as any).error : "Save failed");
      return;
    }
    setSaveMsg(`Saved ✓ — Project #${(data as any).id} "${(data as any).name}"`);

    // refresh list
    const list: P[] = await fetch("/api/projects/list", { cache: "no-store" }).then((x) => (x.ok ? x.json() : []));
    setProjects(list);
    setSelectedId(String((data as any).id));

    // you are owner of a freshly saved project → Share visible
    setCurrentProject({
      id: (data as any).id,
      name: (data as any).name,
      is_owner: true,
      role: "owner",
    });
  }

  async function loadById(id: string) {
    setLoadMsg(null);
    const r = await fetch(`/api/projects/${id}`, { cache: "no-store" });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      setLoadMsg(typeof (data as any)?.error === "string" ? (data as any).error : "Load failed");
      return;
    }
    const payload = (data as any)?.data || data; // accept either shape
    if (!payload?.tree || !payload?.nodes) {
      setLoadMsg("Project data missing");
      return;
    }
    setTree(payload.tree);
    setNodes(payload.nodes);
    setEdges(payload.edges || []);
    setLoadMsg(`Loaded ✓ — ${(data as any).name ?? "Project"}`);

    // prefer detail meta; fallback to list
    const isOwner = (data as any).is_owner;
    const role = (data as any).role;
    const owner = (data as any).owner;
    const name = (data as any).name;

    if (typeof isOwner === "boolean" || role || owner || name) {
      setCurrentProject({
        id: Number(id),
        name: name ?? `Project #${id}`,
        is_owner: Boolean(isOwner),
        role: (role ?? (isOwner ? "owner" : null)) as Role,
        owner,
      });
    } else {
      const m = metaFromList(id);
      if (m) setCurrentProject(m);
    }
  }

  // keep meta in sync when user changes dropdown before pressing "Load"
  useEffect(() => {
    if (!selectedId) return;
    const m = metaFromList(selectedId);
    if (m) setCurrentProject(m);
  }, [selectedId, projects]);

  return (
    <div className="graph-layout">
      <aside className="graph-sidebar">
        <div className="sidebar-header">
          <h2>Project Tree</h2>
        </div>
        {tree ? <FileTree node={tree} /> : <p className="dz-sub">Upload or load a project to see the tree.</p>}
      </aside>

      <main className="graph-main">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: ".75rem" }}>
          <h1 className="page-title">Graph Explorer</h1>
          {isAuthed && currentProject?.id ? (
            <ShareButton projectId={currentProject.id} isOwner={Boolean(currentProject.is_owner)} />
          ) : null}
        </div>

        {currentProject && !currentProject.is_owner && (
          <div className="dz-sub" style={{ marginTop: "-.5rem", marginBottom: ".5rem" }}>
            Access: <strong>{currentProject.role ?? "viewer"}</strong>
            {currentProject.owner?.username ? <> · Shared by <strong>{currentProject.owner.username}</strong></> : null}
          </div>
        )}

        <UploadDropzone
          onResult={(data) => {
            setTree(data.tree);
            setNodes(data.nodes);
            setEdges(data.edges);
            setSaveMsg(null);
            setLoadMsg(null);
            // fresh upload → not tied to an existing project until saved
            setCurrentProject(null);
            setSelectedId("");
          }}
        />

        {isAuthed && (
          <div className="card" style={{ display: "grid", gap: ".75rem" }}>
            <h3 style={{ fontSize: "1.05rem", fontWeight: 700 }}>Save / Load</h3>

            {/* Save */}
            <div style={{ display: "flex", gap: ".5rem", alignItems: "center" }}>
              <input
                type="text"
                placeholder="Project name"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                style={{
                  flex: 1,
                  border: "1px solid var(--border)",
                  borderRadius: "12px",
                  padding: ".6rem .8rem",
                  background: "transparent",
                }}
              />
              <button className="btn primary" onClick={saveProject} disabled={saving}>
                {saving ? "Saving…" : "Save project"}
              </button>
            </div>
            {saveMsg && <p className="dz-sub">{saveMsg}</p>}

            {/* Load */}
            <div style={{ display: "flex", gap: ".5rem", alignItems: "center" }}>
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                style={{
                  flex: 1,
                  border: "1px solid var(--border)",
                  borderRadius: "12px",
                  padding: ".6rem .8rem",
                  background: "transparent",
                }}
              >
                <option value="" disabled>
                  {projects.length ? "Choose a project to load" : "No saved projects yet"}
                </option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {new Date(p.created_at).toLocaleString()}
                    {p.is_owner === false && p.owner?.username ? ` — shared by ${p.owner.username}` : ""}
                  </option>
                ))}
              </select>
              <button className="btn" onClick={() => selectedId && loadById(selectedId)} disabled={!selectedId}>
                Load
              </button>
              {selectedId && (
                <Link className="btn" href={`/graph?id=${selectedId}`}>
                  Open link
                </Link>
              )}
            </div>
            {loadMsg && <p className="dz-sub">{loadMsg}</p>}
          </div>
        )}

        <div className="card" style={{ height: "70vh", padding: 0 }}>
          <GraphView nodes={nodes} edges={edges} />
        </div>
      </main>
    </div>
  );
}
