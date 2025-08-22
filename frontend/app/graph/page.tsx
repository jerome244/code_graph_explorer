// app/graph/page.tsx
"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { ElementDefinition } from "cytoscape";
import type { TreeNode } from "@/lib/fileTree";
import TreeView from "@/components/file-tree/TreeView";
import ZipUpload from "@/components/upload/ZipUpload";
import GitHubImport from "@/components/upload/GitHubImport";
import { treeToCy } from "@/lib/cyto"; // must accept (tree, files)
import SaveButton from "@/components/projects/SaveButton";
import ProjectsDropdown from "@/components/projects/ProjectsDropdown";
import ShareButton from "@/components/projects/ShareButton";
import type { CytoGraphHandle } from "@/components/graph/CytoGraph";

const CytoGraph = dynamic(() => import("@/components/graph/CytoGraph"), { ssr: false });

type Project = {
  id: string;
  name: string;
  description?: string;
  graph: any;
  source_language?: string;
  created_at: string;
  updated_at: string;
};

// ---- Realtime types/helpers ----
type RealtimeOp =
  | { type: "UPDATE_FILE"; payload: { path: string; content: string } }
  | { type: "HIDE_NODE"; payload: { path: string; hidden: boolean } }
  | { type: "MOVE_NODE"; payload: { id: string; position: { x: number; y: number } } }
  | { type: "SNAPSHOT"; payload: { graph: any; targetClientId?: string } }
  | { type: "REQUEST_SNAPSHOT"; payload: { requesterId: string } }
  | { type: "PING" }
  | { type: "PONG" };

type RealtimeMessage = RealtimeOp & { clientId?: string; ts?: number };

const WS_BASE =
  process.env.NEXT_PUBLIC_WS_BASE?.replace(/\/$/, "") ||
  (typeof window !== "undefined"
    ? `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}`
    : "");

function uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export default function GraphPage() {
  const [tree, setTree] = useState<TreeNode>({ name: "root", path: "", kind: "folder", children: [] });
  const [elements, setElements] = useState<ElementDefinition[]>([]);
  const [status, setStatus] = useState<string>("No file loaded");
  const [hiddenMap, setHiddenMap] = useState<Record<string, boolean>>({});
  const [files, setFiles] = useState<Record<string, string>>({});

  // Save-related state
  const [project, setProject] = useState<Project | null>(null);
  const [projectName, setProjectName] = useState<string>("My Code Graph");

  // Realtime
  const clientIdRef = useRef<string>(uuid());
  const wsRef = useRef<WebSocket | null>(null);
  const wsHeartbeatRef = useRef<number | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const lastPongRef = useRef<number>(0);
  const lastSnapshotTsRef = useRef<number>(0);
  const pendingSelfSnapshotTimer = useRef<number | null>(null);

  const graphRef = useRef<CytoGraphHandle | null>(null);

  const hiddenIds = useMemo(() => Object.keys(hiddenMap).filter((k) => hiddenMap[k]), [hiddenMap]);

  // ---- Parsing callbacks ----
  const onParsed = useCallback((res: { tree: TreeNode; elements: ElementDefinition[]; count: number; files: Record<string, string> }) => {
    setTree(res.tree);
    setElements(res.elements);
    setFiles(res.files);
    setHiddenMap({}); // reset hidden toggles on new upload/import
    setStatus(`${res.count} files loaded`);
    // Reset current project context on new dataset
    setProject(null);
    setProjectName("My Code Graph");
  }, []);

  const onToggleFile = useCallback(
    (path: string) => {
      setHiddenMap((prev) => {
        const nextHidden = !prev[path];
        if (project?.id && wsRef.current && wsRef.current.readyState === 1) {
          const msg: RealtimeMessage = {
            type: "HIDE_NODE",
            payload: { path, hidden: nextHidden },
            clientId: clientIdRef.current,
            ts: Date.now(),
          };
          wsRef.current.send(JSON.stringify(msg));
        }
        return { ...prev, [path]: nextHidden };
      });
    },
    [project?.id]
  );

  // Right-click in graph → hide in tree
  const onHideNode = useCallback(
    (path: string) => {
      setHiddenMap((prev) => {
        if (project?.id && wsRef.current && wsRef.current.readyState === 1) {
          const msg: RealtimeMessage = {
            type: "HIDE_NODE",
            payload: { path, hidden: true },
            clientId: clientIdRef.current,
            ts: Date.now(),
          };
          wsRef.current.send(JSON.stringify(msg));
        }
        return { ...prev, [path]: true };
      });
    },
    [project?.id]
  );

  // When a popup edit occurs, update file text and rebuild edges/lines
  const onUpdateFile = useCallback(
    (path: string, content: string) => {
      if (project?.id && wsRef.current && wsRef.current.readyState === 1) {
        const msg: RealtimeMessage = {
          type: "UPDATE_FILE",
          payload: { path, content },
          clientId: clientIdRef.current,
          ts: Date.now(),
        };
        wsRef.current.send(JSON.stringify(msg));
      }

      setFiles((prev) => {
        const nextFiles = { ...prev, [path]: content };
        try {
          const res = treeToCy(tree, nextFiles) as any;
          const newElements: ElementDefinition[] = Array.isArray(res) ? res : res.elements;
          setElements(newElements);
        } catch (e) {
          console.error("Rebuild graph failed:", e);
        }
        return nextFiles;
      });
    },
    [tree, project?.id]
  );

  // --- WS backpressure-aware sender ---
  const sendRT = useCallback((msg: RealtimeMessage) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== ws.OPEN) return;
    if (ws.bufferedAmount > 256 * 1024) return; // avoid piling frames
    ws.send(JSON.stringify(msg));
  }, []);

  // --- Move node handler (drag streaming) — broadcast only; Cytoscape already shows local drag
  const onMoveNode = useCallback(
    (id: string, position: { x: number; y: number }) => {
      sendRT({
        type: "MOVE_NODE",
        payload: { id, position },
        clientId: clientIdRef.current,
        ts: Date.now(),
      });
    },
    [sendRT]
  );


  // --- Commit once on drag end (update state for persistence + broadcast)
  const onMoveCommit = useCallback(
    (id: string, position: { x: number; y: number }) => {
      sendRT({
        type: "MOVE_NODE",
        payload: { id, position },
        clientId: clientIdRef.current,
        ts: Date.now(),
      });
    },
    [sendRT]
  );


  // --- Load by ?project=<id> ---
  const searchParams = useSearchParams();
  const loadedFromQuery = useRef(false);

  
  useEffect(() => {
    const pid = searchParams.get("project");
    if (!pid || loadedFromQuery.current) return;
    loadedFromQuery.current = true;

    (async () => {
      try {
        setStatus("Loading project…");
        const res = await fetch(`/api/projects/${pid}`, { credentials: "include" });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.detail || "Failed to load project");

        setProject(data);
        setProjectName(data.name);

        const g = data.graph || {};
        setTree(g.tree || { name: "root", path: "", kind: "folder", children: [] });
        setElements(g.elements || []);
        setFiles(g.files || {});
        const hm = Object.fromEntries((g.hiddenIds || []).map((id: string) => [id, true]));
        setHiddenMap(hm);

        setStatus(`Loaded "${data.name}"`);
      } catch (e: any) {
        console.error(e);
        setStatus(e.message || "Failed to load project");
      }
    })();
  }, [searchParams]);

  // ---- Realtime: connect when a project is present ----
  const connectSocket = useCallback(
    (projectId: string) => {
      if (!WS_BASE) return;

      const url = `${WS_BASE}/ws/projects/${encodeURIComponent(projectId)}/`;
      try {
        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
          setStatus((s) => (s.includes("• Live") ? s : `${s} • Live`));

          // Ask collaborators for the latest state (late joiner pull)
          sendRT({
            type: "REQUEST_SNAPSHOT",
            payload: { requesterId: clientIdRef.current },
            clientId: clientIdRef.current,
            ts: Date.now(),
          });

          // Fallback: if no one answers quickly, broadcast our own snapshot
          pendingSelfSnapshotTimer.current = window.setTimeout(() => {
            const graph = {
              tree,
              elements: graphRef.current?.exportElementsWithPositions?.() ?? elements,
              files,
              hiddenIds,
            };
            sendRT({
              type: "SNAPSHOT",
              payload: { graph },
              clientId: clientIdRef.current,
              ts: Date.now(),
            });
          }, 600) as unknown as number;

          // Heartbeat
          lastPongRef.current = Date.now();
          if (wsHeartbeatRef.current) window.clearInterval(wsHeartbeatRef.current);
          wsHeartbeatRef.current = window.setInterval(() => {
            if (ws.readyState !== 1) return;
            const ping: RealtimeMessage = { type: "PING", clientId: clientIdRef.current, ts: Date.now() };
            ws.send(JSON.stringify(ping));
            if (Date.now() - lastPongRef.current > 30000) {
              ws.close();
            }
          }, 10000) as unknown as number;
        };

        ws.onmessage = (e) => {
          try {
            const msg: RealtimeMessage & { payload?: any } = JSON.parse(e.data);

            // Ignore self-echoes
            if (msg.clientId && msg.clientId === clientIdRef.current) return;

            switch (msg.type) {
              case "PONG":
                lastPongRef.current = Date.now();
                break;

              case "REQUEST_SNAPSHOT": {
                const requesterId = msg.payload?.requesterId;
                if (!requesterId) break;
                // Small jitter so not everyone replies at the same time
                const jitter = 80 + Math.floor(Math.random() * 120);
                setTimeout(() => {
                  const graph = {
                    tree,
                    elements: graphRef.current?.exportElementsWithPositions?.() ?? elements,
                    files,
                    hiddenIds,
                  };
                  sendRT({
                    type: "SNAPSHOT",
                    payload: { graph, targetClientId: requesterId },
                    clientId: clientIdRef.current,
                    ts: Date.now(),
                  });
                }, jitter);
                break;
              }

              case "SNAPSHOT": {
                // Only apply if for me (or broadcast) and newer
                const target = msg.payload?.targetClientId;
                if (target && target !== clientIdRef.current) break;
                if ((msg.ts ?? 0) <= lastSnapshotTsRef.current) break;
                lastSnapshotTsRef.current = msg.ts ?? Date.now();

                const g = msg.payload?.graph || {};
                setTree(g.tree || { name: "root", path: "", kind: "folder", children: [] });
                setElements(g.elements || []);
                setFiles(g.files || {});
                const hm = Object.fromEntries((g.hiddenIds || []).map((id: string) => [id, true]));
                setHiddenMap(hm);
                setStatus((s) => (s.includes("• Live") ? s : `${s} • Live`));

                // Got a good snapshot → cancel our pending fallback
                if (pendingSelfSnapshotTimer.current) {
                  clearTimeout(pendingSelfSnapshotTimer.current);
                  pendingSelfSnapshotTimer.current = null;
                }
                break;
              }

              case "UPDATE_FILE": {
                const { path, content } = msg.payload || {};
                if (!path) break;
                setFiles((prev) => {
                  const next = { ...prev, [path]: content };
                  try {
                    const res = treeToCy(tree, next) as any;
                    const newEls: ElementDefinition[] = Array.isArray(res) ? res : res.elements;
                    setElements(newEls);
                  } catch (err) {
                    console.error("Rebuild graph failed:", err);
                  }
                  return next;
                });
                break;
              }

              case "HIDE_NODE": {
                const { path, hidden } = msg.payload || {};
                if (typeof path === "string") setHiddenMap((prev) => ({ ...prev, [path]: hidden }));
                break;
              }

              case "MOVE_NODE": {
                const { id, position } = msg.payload || {};
                if (!id || !position) break;
                // smooth, light-weight: update Cytoscape directly (no full state churn)
                graphRef.current?.applyLiveMove(id, position, { animate: true });
                break;
              }

              default:
                break;
            }
          } catch (err) {
            console.error("WS message parse/apply error:", err);
          }
        };

        ws.onclose = () => {
          if (wsHeartbeatRef.current) {
            window.clearInterval(wsHeartbeatRef.current);
            wsHeartbeatRef.current = null;
          }
          if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = window.setTimeout(() => {
            if (project?.id) connectSocket(project.id);
          }, 2000) as unknown as number;
        };

        ws.onerror = () => {
          /* let onclose handle reconnect */
        };
      } catch (err) {
        console.error("WebSocket connect error:", err);
      }
    },
    [hiddenIds, files, elements, tree, project?.id, sendRT]
  );

  // Manage lifecycle for realtime
  useEffect(() => {
    if (!project?.id) {
      if (wsRef.current && wsRef.current.readyState === 1) wsRef.current.close();
      return;
    }
    connectSocket(project.id);
    return () => {
      if (wsHeartbeatRef.current) {
        window.clearInterval(wsHeartbeatRef.current);
        wsHeartbeatRef.current = null;
      }
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {}
      }
    };
  }, [project?.id, connectSocket]);

  return (
    <main style={{ display: "grid", gridTemplateColumns: "280px 1fr", height: "100vh" }}>
      {/* Sidebar */}
      <aside style={{ borderRight: "1px solid #e5e7eb", padding: 12, overflow: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>Project files</h2>
          <Link href="/" style={{ fontSize: 12, textDecoration: "none" }}>
            Home
          </Link>
        </div>
        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>{status}</div>
        <TreeView root={tree} hiddenMap={hiddenMap} onToggleFile={onToggleFile} />
      </aside>

      {/* Main */}
      <section style={{ display: "grid", gridTemplateRows: "auto 1fr" }}>
        <div
          style={{
            padding: 12,
            borderBottom: "1px solid #e5e7eb",
            display: "flex",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <ZipUpload onParsed={onParsed} setStatus={setStatus} />
          <span style={{ fontSize: 12, color: "#6b7280" }}>.c .py .html .css .js</span>

          <div style={{ width: 1, height: 24, background: "#e5e7eb" }} />

          <GitHubImport onParsed={onParsed} setStatus={setStatus} />

          <div style={{ width: 1, height: 24, background: "#e5e7eb" }} />

          {/* Project name + Save + Load */}
          <input
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="Project name"
            style={{ border: "1px solid #e5e7eb", borderRadius: 6, padding: "4px 8px", fontSize: 13 }}
          />
          <SaveButton
            project={project}
            name={projectName}
            graph={{
              tree,
              elements: graphRef.current?.exportElementsWithPositions?.() ?? elements,
              files,
              hiddenIds
            }}
            onSaved={(p) => {
              setProject(p);
              setProjectName(p.name);
              try {
                const t = new Date(p.updated_at).toLocaleTimeString();
                setStatus(`Saved at ${t} • Live`);
              } catch {
                setStatus((s) => (s.includes("• Live") ? "Saved • Live" : "Saved • Live"));
              }
              if (p?.id && wsRef.current && wsRef.current.readyState === 1) {
                const snapshot: RealtimeMessage = {
                  type: "SNAPSHOT",
                  payload: {
                    graph: {
                      tree,
                      elements: graphRef.current?.exportElementsWithPositions?.() ?? elements,
                      files,
                      hiddenIds
                    }
                  },
                  clientId: clientIdRef.current,
                  ts: Date.now(),
                };
                wsRef.current.send(JSON.stringify(snapshot));
              }
            }}
          />
          <ShareButton projectId={project?.id} />

          <ProjectsDropdown
            onLoad={(p) => {
              setProject(p);
              setProjectName(p.name);
              try {
                const g = p.graph || {};
                setTree(g.tree || { name: "root", path: "", kind: "folder", children: [] });
                setElements(g.elements || []);
                setFiles(g.files || {});
                const hm = Object.fromEntries((g.hiddenIds || []).map((id: string) => [id, true]));
                setHiddenMap(hm);
                setStatus(`Loaded "${p.name}"`);
              } catch (e) {
                console.error("Failed to load project graph", e);
                setStatus("Failed to load project graph");
              }
            }}
            onDeleted={(id) => {
              if (project?.id === id) {
                setProject(null);
                setProjectName("My Code Graph");
                setStatus("Project deleted");
                if (wsRef.current && wsRef.current.readyState === 1) wsRef.current.close();
              }
            }}
            onRenamed={(p) => {
              if (project?.id === p.id) {
                setProjectName(p.name);
                setProject(p);
                setStatus(`Renamed to "${p.name}"`);
              }
            }}
          />

          {hiddenIds.length > 0 && (
            <span style={{ marginLeft: "auto", fontSize: 12, color: "#6b7280" }}>
              Hidden: {hiddenIds.length}
            </span>
          )}
        </div>

        <CytoGraph
          ref={graphRef}
          elements={elements}
          hiddenIds={hiddenIds}
          files={files}
          onHideNode={onHideNode}
          onUpdateFile={onUpdateFile}
          onMoveNode={onMoveNode}       // throttled while dragging (12 fps)
          onMoveCommit={onMoveCommit}   // single precise commit on release
        />
      </section>
    </main>
  );
}
