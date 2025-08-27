"use client";
import { useEffect, useState } from "react";
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
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("");

  useEffect(() => {
    // check auth via our proxy
    fetch("/api/auth/me", { cache: "no-store" }).then((r) => setIsAuthed(r.ok));
  }, []);

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
  }

  return (
    <div className="graph-layout">
      <aside className="graph-sidebar">
        <div className="sidebar-header">
          <h2>Project Tree</h2>
          <Link href="/" className="underline">Home</Link>
        </div>
        {tree ? <FileTree node={tree} /> : <p className="dz-sub">Upload a .zip to see the tree.</p>}
      </aside>

      <main className="graph-main">
        <h1 className="page-title">Graph Explorer</h1>

        <UploadDropzone
          onResult={(data) => {
            setTree(data.tree);
            setNodes(data.nodes);
            setEdges(data.edges);
            setSaveMsg(null);
          }}
        />

        {/* Save UI: appears only if authenticated */}
        {isAuthed && (
          <div className="card" style={{ display: "grid", gap: ".5rem" }}>
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
          </div>
        )}

        <div className="card" style={{ height: "70vh", padding: 0 }}>
          <GraphView nodes={nodes} edges={edges} />
        </div>
      </main>
    </div>
  );
}
