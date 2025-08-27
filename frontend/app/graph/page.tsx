"use client";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { TreeNode } from "@/app/api/graph/upload/route";
import UploadDropzone from "./components/UploadDropzone";
import FileTree from "./components/FileTree";
import GraphView from "./components/GraphView";
import Link from "next/link";

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
  type P = { id: number; name: string; created_at: string; updated_at: string; file_count: number; data?: any };
  const [projects, setProjects] = useState<P[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [loadMsg, setLoadMsg] = useState<string | null>(null);

  const params = useSearchParams();
  const paramId = useMemo(() => params.get("id"), [params]);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" }).then(async (r) => {
      setIsAuthed(r.ok);
    });
  }, []);

  // Fetch the user's projects when authed
  useEffect(() => {
    if (!isAuthed) return;
    (async () => {
      const r = await fetch("/api/projects/list", { cache: "no-store" });
      if (!r.ok) return;
      const list: P[] = await r.json();
      setProjects(list);
      // If URL has ?id=, try to auto-load it
      if (paramId && list.some((p) => String(p.id) === paramId)) {
        setSelectedId(paramId);
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
      setSaveMsg(typeof data?.error === "string" ? data.error : "Save failed");
      return;
    }
    setSaveMsg(`Saved ✓ — Project #${data.id} "${data.name}"`);
    // Refresh list so it appears in the loader
    const list = await fetch("/api/projects/list", { cache: "no-store" }).then((x) => x.ok ? x.json() : []);
    setProjects(list);
    setSelectedId(String(data.id));
  }

  async function loadById(id: string) {
    setLoadMsg(null);
    const r = await fetch(`/api/projects/${id}`, { cache: "no-store" });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      setLoadMsg(typeof data?.error === "string" ? data.error : "Load failed");
      return;
    }
    const payload = data?.data || data; // accept either shape
    if (!payload?.tree || !payload?.nodes) {
      setLoadMsg("Project data missing");
      return;
    }
    setTree(payload.tree);
    setNodes(payload.nodes);
    setEdges(payload.edges || []);
    setLoadMsg(`Loaded ✓ — ${data.name ?? "Project"}`);
  }

  return (
    <div className="graph-layout">
      <aside className="graph-sidebar">
        <div className="sidebar-header">
          <h2>Project Tree</h2>
          <Link href="/" className="underline">Home</Link>
        </div>
        {tree ? <FileTree node={tree} /> : <p className="dz-sub">Upload or load a project to see the tree.</p>}
      </aside>

      <main className="graph-main">
        <h1 className="page-title">Graph Explorer</h1>

        <UploadDropzone
          onResult={(data) => {
            setTree(data.tree);
            setNodes(data.nodes);
            setEdges(data.edges);
            setSaveMsg(null);
            setLoadMsg(null);
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
