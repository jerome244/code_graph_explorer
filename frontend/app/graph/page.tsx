// frontend/app/graph/page.tsx
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
import { treeToCy } from "@/lib/cyto";
import SaveButton from "@/components/projects/SaveButton";
import ProjectsDropdown from "@/components/projects/ProjectsDropdown";
import ShareButton from "@/components/projects/ShareButton";
import { useProjectSocket } from "@/lib/useProjectSocket";

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

export default function GraphPage() {
  const [tree, setTree] = useState<TreeNode>({ name: "root", path: "", kind: "folder", children: [] });
  const [elements, setElements] = useState<ElementDefinition[]>([]);
  const [status, setStatus] = useState<string>("No file loaded");
  const [hiddenMap, setHiddenMap] = useState<Record<string, boolean>>({});
  const [files, setFiles] = useState<Record<string, string>>({});

  // Save-related state
  const [project, setProject] = useState<Project | null>(null);
  const [projectName, setProjectName] = useState<string>("My Code Graph");

  const hiddenIds = useMemo(() => Object.keys(hiddenMap).filter((k) => hiddenMap[k]), [hiddenMap]);

  // --- Hook up realtime (only activates when project?.id is set) ---
  const { send, status: wsStatus, peers } = useProjectSocket(project?.id ?? "", {
    onSnapshot: ({ graph }) => {
      const g = graph || {};
      setTree(g.tree || { name: "root", path: "", kind: "folder", children: [] });
      setElements(g.elements || []);
      setFiles(g.files || {});
      const hm = Object.fromEntries((g.hiddenIds || []).map((id: string) => [id, true]));
      setHiddenMap(hm);
    },
    onUpdateFile: (path, content) => {
      setFiles((prev) => {
        const next = { ...prev, [path]: content };
        try {
          const res = treeToCy(tree, next) as any;
          const newEls: ElementDefinition[] = Array.isArray(res) ? res : res.elements;
          setElements(newEls);
        } catch (e) {
          console.error("Rebuild graph failed:", e);
        }
        return next;
      });
    },
    onHideNode: (path, hidden) => setHiddenMap((prev) => ({ ...prev, [path]: hidden })),
    onMoveNode: (id, position) => {
      setElements((prev) =>
        prev.map((el) => {
          const data: any = (el as any).data;
          return data?.id === id ? { ...el, position } : el;
        })
      );
    },
    onStatusChange: (st) => {
      if (st === "open") setStatus((s) => (s.includes("• Live") ? s : `${s} • Live`));
    },
  });

  // ---- Parsing callbacks ----
  const onParsed = useCallback(
    (res: { tree: TreeNode; elements: ElementDefinition[]; count: number; files: Record<string, string> }) => {
      setTree(res.tree);
      setElements(res.elements);
      setFiles(res.files);
      setHiddenMap({}); // reset
      setStatus(`${res.count} files loaded`);
      // Reset current project context on new dataset
      setProject(null);
      setProjectName("My Code Graph");
    },
    []
  );

  const onToggleFile = useCallback(
    (path: string) => {
      setHiddenMap((prev) => {
        const nextHidden = !prev[path];
        if (project?.id) {
          send({ type: "HIDE_NODE", payload: { path, hidden: nextHidden } });
        }
        return { ...prev, [path]: nextHidden };
      });
    },
    [project?.id, send]
  );

  const onHideNode = useCallback(
    (path: string) => {
      setHiddenMap((prev) => {
        if (project?.id) {
          send({ type: "HIDE_NODE", payload: { path, hidden: true } });
        }
        return { ...prev, [path]: true };
      });
    },
    [project?.id, send]
  );

  const onUpdateFile = useCallback(
    (path: string, content: string) => {
      if (project?.id) {
        send({ type: "UPDATE_FILE", payload: { path, content } });
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
    [tree, project?.id, send]
  );

  const onMoveNode = useCallback(
    (id: string, position: { x: number; y: number }) => {
      if (project?.id) {
        send({ type: "MOVE_NODE", payload: { id, position } });
      }
      // Optimistic local update
      setElements((prev) =>
        prev.map((el) => {
          const data: any = (el as any).data;
          return data?.id === id ? { ...el, position } : el;
        })
      );
    },
    [project?.id, send]
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

  // Send a snapshot when the socket opens (optional)
  useEffect(() => {
    if (wsStatus === "open" && project?.id) {
      send({ type: "SNAPSHOT", payload: { graph: { tree, elements, files, hiddenIds } } });
    }
  }, [wsStatus, project?.id, tree, elements, files, hiddenIds, send]);

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
        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
          {status}
          {project?.id ? (
            <span> • Socket: {wsStatus}{peers ? ` • Peers: ${peers}` : ""}</span>
          ) : null}
        </div>
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
            graph={{ tree, elements, files, hiddenIds }}
            onSaved={(p) => {
              setProject(p);
              setProjectName(p.name);
              try {
                const t = new Date(p.updated_at).toLocaleTimeString();
                setStatus(`Saved at ${t} • Live`);
              } catch {
                setStatus((s) => (s.includes("• Live") ? "Saved • Live" : "Saved • Live"));
              }
              if (p?.id) {
                send({ type: "SNAPSHOT", payload: { graph: { tree, elements, files, hiddenIds } } });
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
          elements={elements}
          hiddenIds={hiddenIds}
          files={files}
          onHideNode={onHideNode}
          onUpdateFile={onUpdateFile}
          onMoveNode={onMoveNode}
        />
      </section>
    </main>
  );
}
