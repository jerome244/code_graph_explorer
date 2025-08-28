// frontend/app/graph/page.tsx
"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { TreeNode } from "@/app/api/graph/upload/route";
import UploadDropzone from "./components/UploadDropzone";
import FileTree from "./components/FileTree";
import GraphView from "./components/GraphView";
import ShareButton from "@/components/ShareButton";
import Link from "next/link";

type Role = "owner" | "viewer" | "editor" | null;

type ProjectMeta = {
  id: number;
  name: string;
  is_owner: boolean;
  role: Role;
  owner?: { id: number; username: string };
};

type PresenceUser = { id: number; username: string };
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

export default function GraphPage() {
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [nodes, setNodes] = useState<any[]>([]);
  const [edges, setEdges] = useState<any[]>([]);
  const [isAuthed, setIsAuthed] = useState(false);

  // Save / Load UI
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("");
  const [projects, setProjects] = useState<P[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [loadMsg, setLoadMsg] = useState<string | null>(null);

  // Current project (for sharing/presence)
  const [currentProject, setCurrentProject] = useState<ProjectMeta | null>(null);

  // --- REALTIME ---
  const wsRef = useRef<WebSocket | null>(null);
  const [wsStatus, setWsStatus] = useState<"idle" | "connecting" | "open" | "closed">("idle");
  const [presence, setPresence] = useState<PresenceUser[]>([]);
  const clientId = useMemo(
    () =>
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? (crypto as any).randomUUID()
        : Math.random().toString(36).slice(2),
    []
  );
  const graphApiRef = useRef<{ moveNode: (id: string, x: number, y: number) => void } | null>(null);

  // Authoritative latest positions from WS (for this project)
  const positionsRef = useRef<Record<string, { x: number; y: number }>>({});

  const params = useSearchParams();
  const paramId = useMemo(() => params.get("id"), [params]);

  // ---------- Auth + Projects ----------
  function metaFromList(list: P[], id: string | number): ProjectMeta | null {
    const p = list.find((x) => String(x.id) === String(id));
    if (!p) return null;
    return {
      id: p.id,
      name: p.name,
      is_owner: !!p.is_owner,
      role: (p.role ?? (p.is_owner ? "owner" : null)) as Role,
      owner: p.owner,
    };
  }

  const refreshAuthAndProjects = async () => {
    const r = await fetch("/api/auth/me", { cache: "no-store" });
    const authed = r.ok;
    setIsAuthed(authed);
    if (authed) {
      const rr = await fetch("/api/projects/list", { cache: "no-store" });
      if (rr.ok) {
        const list: P[] = await rr.json();
        setProjects(list);
        if (paramId && list.some((p) => String(p.id) === paramId)) {
          setSelectedId(paramId);
          const m = metaFromList(list, paramId);
          if (m) setCurrentProject(m);
        }
      }
    } else {
      setProjects([]);
      setSelectedId("");
      setCurrentProject(null);
    }
  };

  useEffect(() => {
    refreshAuthAndProjects();
    const onAuthChanged = () => refreshAuthAndProjects();
    const onFocus = () => refreshAuthAndProjects();
    const onVisible = () => { if (!document.hidden) refreshAuthAndProjects(); };
    window.addEventListener("auth:changed", onAuthChanged);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("auth:changed", onAuthChanged);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramId]);

  useEffect(() => {
    if (!isAuthed) return;
    (async () => {
      const r = await fetch("/api/projects/list", { cache: "no-store" });
      if (!r.ok) return;
      const list: P[] = await r.json();
      setProjects(list);

      if (paramId && list.some((p) => String(p.id) === paramId)) {
        setSelectedId(paramId);
        const m = metaFromList(list, paramId);
        if (m) setCurrentProject(m);
        loadById(paramId);
      }
    })();
  }, [isAuthed, paramId]);

  // ---------- Save / Load ----------
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
    const list: P[] = await fetch("/api/projects/list", { cache: "no-store" }).then((x) => (x.ok ? x.json() : []));
    setProjects(list);
    setSelectedId(String((data as any).id));
    setCurrentProject({ id: (data as any).id, name: (data as any).name, is_owner: true, role: "owner" });
  }

  // Merge helper: overlay positionsRef on any nodes array
  function withLivePositions(baseNodes: any[]) {
    const pos = positionsRef.current;
    if (!pos || Object.keys(pos).length === 0) return baseNodes;
    return baseNodes.map((n) => {
      const nid = String(n?.data?.id ?? n?.id);
      const p = pos[nid];
      if (!p) return n;
      return { ...n, position: { ...(n.position || {}), x: Number(p.x), y: Number(p.y) } };
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
    const payload = (data as any)?.data || data;
    if (!payload?.tree || !payload?.nodes) {
      setLoadMsg("Project data missing");
      return;
    }

    // IMPORTANT: apply live WS positions (if any) over loaded nodes
    const mergedNodes = withLivePositions(payload.nodes);

    setTree(payload.tree);
    setNodes(mergedNodes);
    setEdges(payload.edges || []);
    setLoadMsg(`Loaded ✓ — ${(data as any).name ?? "Project"}`);

    const isOwner = (data as any).is_owner;
    const role = (data as any).role;
    const owner = (data as any).owner;
    const name = (data as any).name;

    if (typeof isOwner === "boolean" || role || owner || name) {
      setCurrentProject({
        id: Number(id),
        name: name ?? `Project #${id}`,
        is_owner: !!isOwner,
        role: (role ?? (isOwner ? "owner" : null)) as Role,
        owner,
      });
    } else {
      const m = metaFromList(projects, id);
      if (m) setCurrentProject(m);
    }
  }

  useEffect(() => {
    if (!selectedId) return;
    const m = metaFromList(projects, selectedId);
    if (m) setCurrentProject(m);
  }, [selectedId, projects]);

  // ---------- Realtime helpers ----------
  function updateNodePos(list: any[], nodeId: string, x: number, y: number) {
    return list.map((n) => {
      const nid = n?.data?.id ?? n?.id;
      if (String(nid) !== String(nodeId)) return n;
      return { ...n, position: { ...(n.position || {}), x, y } };
    });
  }

  // Apply full snapshot from server on join + remember it
  function applyPositionsSnapshot(positions: Record<string, { x: number; y: number }>) {
    positionsRef.current = { ...positions };
    // visually update Cytoscape now
    Object.entries(positions || {}).forEach(([id, p]) => {
      graphApiRef.current?.moveNode(String(id), Number(p.x), Number(p.y));
    });
    // mirror into React so future rebuilds keep positions
    setNodes((prev) => withLivePositions(prev));
  }

  function sendNodeMove(nodeId: string, x: number, y: number) {
    const ws = wsRef.current;
    if (ws && ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type: "node_move", clientId, nodeId, x, y }));
    }
  }

  function commitNodeMove(nodeId: string, x: number, y: number) {
    // update local authoritative map too
    positionsRef.current[nodeId] = { x, y };
    setNodes((prev) => updateNodePos(prev, nodeId, x, y));
  }

  function applyRemoteMove(nodeId: string, x: number, y: number) {
    positionsRef.current[nodeId] = { x, y };
    graphApiRef.current?.moveNode(nodeId, x, y);
    setNodes((prev) => updateNodePos(prev, nodeId, x, y));
  }

  // ---------- WebSocket lifecycle ----------
  useEffect(() => {
    const pid = currentProject?.id;
    if (!pid || !isAuthed) return;

    setWsStatus("connecting");
    setPresence([]);
    positionsRef.current = {}; // clear previous project's positions

    (async () => {
      const t = await fetch(`/api/projects/${pid}/ws-ticket`, { method: "POST" });
      if (!t.ok) {
        setWsStatus("closed");
        return;
      }
      const { ticket, ws_url } = await t.json();
      const ws = new WebSocket(`${ws_url}?ticket=${encodeURIComponent(ticket)}`);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsStatus("open");
        ws.send(JSON.stringify({ type: "hello", clientId }));
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);

          if (msg.event === "positions_state" && msg.positions) {
            applyPositionsSnapshot(msg.positions);
            return;
          }

          if (msg.event === "presence_state" && Array.isArray(msg.users)) {
            setPresence(msg.users.map((u: any) => ({ id: Number(u.id), username: String(u.username) })));
            return;
          }

          if (msg.event === "presence") {
            setPresence((prev) => {
              if (msg.action === "join") {
                const exists = prev.some((u) => u.id === msg.userId);
                return exists ? prev : [...prev, { id: msg.userId, username: msg.username }];
              }
              if (msg.action === "leave") return prev.filter((u) => u.id !== msg.userId);
              return prev;
            });
            return;
          }

          if (msg.event === "node_move") {
            if (msg.clientId && msg.clientId === clientId) return; // ignore our echo
            applyRemoteMove(msg.nodeId, msg.x, msg.y);
            return;
          }
        } catch {
          // ignore parse errors
        }
      };

      ws.onclose = () => setWsStatus("closed");
      ws.onerror = () => setWsStatus("closed");
    })();

    return () => {
      try { wsRef.current?.close(); } catch {}
      wsRef.current = null;
      setWsStatus("closed");
    };
  }, [currentProject?.id, isAuthed, clientId]);

  // ---------- Presence pill ----------
  const presenceText =
    presence.length === 0
      ? "Just you"
      : presence.length === 1
      ? presence[0].username
      : presence.length === 2
      ? `${presence[0].username}, ${presence[1].username}`
      : `${presence[0].username}, ${presence[1].username} +${presence.length - 2}`;

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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: ".75rem" }}>
          <h1 className="page-title">Graph Explorer</h1>
          <div style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
            {currentProject?.id ? (
              <div
                className="dz-sub"
                title={presence.map((u) => u.username).join(", ") || "Only you"}
                style={{ border: "1px solid var(--border)", borderRadius: "999px", padding: ".2rem .6rem", opacity: wsStatus === "open" ? 1 : 0.6 }}
              >
                {wsStatus === "open" ? "Live" : wsStatus === "connecting" ? "Connecting…" : "Offline"} • {presenceText}
              </div>
            ) : null}
            {isAuthed && currentProject?.id ? (
              <ShareButton projectId={currentProject.id} isOwner={Boolean(currentProject.is_owner)} />
            ) : null}
          </div>
        </div>

        {currentProject && !currentProject.is_owner && (
          <div className="dz-sub" style={{ marginTop: "-.5rem", marginBottom: ".5rem" }}>
            Access: <strong>{currentProject.role ?? "viewer"}</strong>
            {currentProject.owner?.username ? <> · Shared by <strong>{currentProject.owner.username}</strong></> : null}
          </div>
        )}

        <UploadDropzone
          onResult={(data) => {
            positionsRef.current = {}; // new upload isn't tied to live session yet
            setTree(data.tree);
            setNodes(data.nodes);
            setEdges(data.edges);
            setSaveMsg(null);
            setLoadMsg(null);
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
                style={{ flex: 1, border: "1px solid var(--border)", borderRadius: "12px", padding: ".6rem .8rem", background: "transparent" }}
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
                style={{ flex: 1, border: "1px solid var(--border)", borderRadius: "12px", padding: ".6rem .8rem", background: "transparent" }}
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
          <GraphView
            nodes={nodes}
            edges={edges}
            onNodeMove={(id, pos) => sendNodeMove(id, pos.x, pos.y)}
            onNodeMoveEnd={(id, pos) => commitNodeMove(id, pos.x, pos.y)}
            onReady={(api) => (graphApiRef.current = api)}
          />
        </div>
      </main>
    </div>
  );
}
