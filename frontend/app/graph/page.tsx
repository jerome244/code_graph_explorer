"use client";

import JSZip from "jszip";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as cytoscapeImport from "cytoscape";
const cytoscape = (cytoscapeImport as any).default ?? (cytoscapeImport as any);

// ------------------------------ Types & utils ------------------------------

type CyElement = cytoscape.ElementDefinition;
type PositionsMap = Record<string, { x: number; y: number }>;

const ALLOWED_EXTS = new Set([
  ".c",
  ".h",
  ".py",
  ".html",
  ".css",
  ".js",
  ".ts",
  ".tsx",
  ".jsx",
]);

type TreeNode = {
  name: string;
  path: string;
  isDir: boolean;
  children?: TreeNode[];
  ext?: string;
};

function extname(path: string) {
  const idx = path.lastIndexOf(".");
  return idx >= 0 ? path.slice(idx).toLowerCase() : "";
}
function dirname(path: string) {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}
function basename(path: string) {
  const i = path.lastIndexOf("/");
  return i === -1 ? path : path.slice(i + 1);
}
function normalize(p: string) {
  const parts = p.split("/");
  const stack: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") stack.pop();
    else stack.push(part);
  }
  return stack.join("/");
}
function resolveRelative(fromFile: string, rel: string) {
  if (!rel.startsWith(".")) return null;
  const baseDir = dirname(fromFile);
  return normalize(baseDir ? `${baseDir}/${rel}` : rel);
}

function inferEdges(filename: string, content: string): string[] {
  const edges: string[] = [];
  const ext = extname(filename);

  if (ext === ".js" || ext === ".ts" || ext === ".tsx" || ext === ".jsx") {
    const importRe = /import[^'"\n]*from\s*['"]([^'"\n]+)['"]/g;
    const requireRe = /require\(\s*['"]([^'"\n]+)['"]\s*\)/g;
    let m;
    while ((m = importRe.exec(content))) edges.push(m[1]);
    while ((m = requireRe.exec(content))) edges.push(m[1]);
  } else if (ext === ".py") {
    const fromRel = /from\s+(\.+[\w_/]+)\s+import\s+/g;
    let m;
    while ((m = fromRel.exec(content))) edges.push(m[1]);
  } else if (ext === ".html") {
    const scriptRe = /<script[^>]*src=["']([^"']+)["'][^>]*>/gi;
    const linkRe = /<link[^>]*href=["']([^"']+)["'][^>]*>/gi;
    let m;
    while ((m = scriptRe.exec(content))) edges.push(m[1]);
    while ((m = linkRe.exec(content))) edges.push(m[1]);
  } else if (ext === ".css") {
    const importRe = /@import\s+["']([^"']+)["']/g;
    let m;
    while ((m = importRe.exec(content))) edges.push(m[1]);
  } else if (ext === ".c" || ext === ".h") {
    const incRe = /#include\s+"([^"]+)"/g;
    let m;
    while ((m = incRe.exec(content))) edges.push(m[1]);
  }
  return edges;
}

function buildTree(paths: string[]): TreeNode {
  const root: TreeNode = { name: "root", path: "", isDir: true, children: [] };
  const map = new Map<string, TreeNode>([["", root]]);
  for (const p of paths) {
    const parts = p.split("/");
    let curPath = "";
    let parent = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      curPath = curPath ? `${curPath}/${part}` : part;
      const isLast = i === parts.length - 1;
      if (!map.has(curPath)) {
        const node: TreeNode = {
          name: part,
          path: curPath,
          isDir: !isLast,
          children: !isLast ? [] : undefined,
          ext: isLast ? extname(curPath) : undefined,
        };
        (parent.children = parent.children || []).push(node);
        map.set(curPath, node);
      }
      parent = map.get(curPath)!;
    }
  }
  const sortRec = (n: TreeNode) => {
    if (!n.children) return;
    n.children.sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name));
    n.children.forEach(sortRec);
  };
  sortRec(root);
  return root;
}

function TreeView({ node, onSelect }: { node: TreeNode; onSelect: (path: string) => void }) {
  if (!node.children) return null;
  return (
    <ul style={{ listStyle: "none", paddingLeft: 12 }}>
      {node.children.map((child) => (
        <li key={child.path}>
          {child.isDir ? (
            <details open>
              <summary style={{ cursor: "pointer" }}>{child.name}</summary>
              <TreeView node={child} onSelect={onSelect} />
            </details>
          ) : (
            <button
              onClick={() => onSelect(child.path)}
              style={{
                background: "none",
                border: 0,
                padding: 0,
                cursor: "pointer",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: 12,
              }}
              title={child.path}
            >
              {child.name}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

// ------------------------------ Page ------------------------------

export default function GraphPage() {
  // Graph state
  const [elements, setElements] = useState<CyElement[]>([]);
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [info, setInfo] = useState<string>("Upload a .zip to begin");
  const [selected, setSelected] = useState<string | null>(null);

  // File contents (editable) + ref (handlers see latest)
  const [fileMap, setFileMap] = useState<Record<string, string>>({});
  const fileMapRef = useRef<Record<string, string>>({});
  useEffect(() => {
    fileMapRef.current = fileMap;
  }, [fileMap]);

  // Positions (persisted on save)
  const positionsRef = useRef<PositionsMap>({});

  function snapshotPositions(): PositionsMap {
    const cy = cyRef.current;
    const out: PositionsMap = {};
    if (!cy) return out;
    cy.nodes().forEach((n) => {
      const p = n.position();
      out[n.id()] = { x: p.x, y: p.y };
    });
    return out;
  }

  // Auth/persistence
  const [authed, setAuthed] = useState(false);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [projectName, setProjectName] = useState<string>("");
  const [myProjects, setMyProjects] = useState<Array<{ id: number; name: string }>>([]);

  // multi-popups that follow nodes; editable
  type Popup = { path: string; x: number; y: number; draft: string; dirty: boolean };
  const [popups, setPopups] = useState<Popup[]>([]);
  const popupsRef = useRef<Popup[]>([]);
  useEffect(() => {
    popupsRef.current = popups;
  }, [popups]);

  // Cytoscape refs
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);

  // Styles: tiny nodes
  const cyStylesheet = useMemo<cytoscape.Stylesheet[]>(
    () => [
      {
        selector: "node",
        style: {
          label: "data(label)",
          "font-size": 8,
          "text-valign": "center",
          "text-halign": "center",
          width: 14,
          height: 14,
        },
      },
      { selector: "edge", style: { width: 1, "curve-style": "bezier", "target-arrow-shape": "triangle" } },
      { selector: "node:selected", style: { "border-width": 2, "border-color": "#2563eb" } },
      { selector: "node[?hidden]", style: { opacity: 0.2 } },
    ],
    []
  );

  // Load my projects list (guest-friendly, silent refresh)
  useEffect(() => {
    (async () => {
      try {
        let r = await fetch("/api/projects", { cache: "no-store" });
        if (r.status === 401) {
          const rr = await fetch("/api/auth/refresh", { method: "POST" });
          if (rr.ok) r = await fetch("/api/projects", { cache: "no-store" });
        }
        if (r.ok) {
          const items = await r.json();
          setMyProjects(items.map((p: any) => ({ id: p.id, name: p.name })));
          setAuthed(true);
        } else {
          setAuthed(false);
        }
      } catch {
        setAuthed(false);
      }
    })();
  }, []);

  // Create cy once (strict-mode safe)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (cyRef.current) {
      try {
        cyRef.current.stop();
        cyRef.current.destroy();
      } catch {}
      cyRef.current = null;
    }

    const cy = cytoscape({
      container,
      elements: [],
      style: cyStylesheet as any,
      wheelSensitivity: 0.2,
    });
    cyRef.current = cy;

    // Node click → toggle popup
    const onTapNode = (evt: any) => {
      const id: string = evt.target.id();
      const node = cy.$id(id);
      if (!node.length) return;

      const existing = popupsRef.current.find((p) => p.path === id);
      if (existing) {
        if (existing.dirty) savePopup(id);
        setPopups((cur) => cur.filter((p) => p.path !== id));
        return;
      }

      const rp = node.renderedPosition();
      const code = fileMapRef.current[id] ?? "";
      setPopups((cur) => [...cur, { path: id, x: rp.x, y: rp.y, draft: code, dirty: false }]);
      setSelected(id);
    };
    cy.on("tap", "node", onTapNode);

    // Popups follow nodes on pan/zoom/move
    let raf = 0;
    const scheduleFollow = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const next: Popup[] = [];
        const byPath = new Map(popupsRef.current.map((p) => [p.path, p]));
        for (const p of popupsRef.current) {
          const n = cy.$id(p.path);
          if (!n.length) continue;
          const rp = n.renderedPosition();
          const prev = byPath.get(p.path)!;
          next.push({ ...prev, x: rp.x, y: rp.y });
        }
        setPopups((prev) => {
          if (prev.length !== next.length) return next;
          for (let i = 0; i < prev.length; i++) {
            const a = prev[i],
              b = next[i];
            if (a.path !== b.path || a.x !== b.x || a.y !== b.y || a.draft !== b.draft || a.dirty !== b.dirty) return next;
          }
          return prev;
        });
      });
    };

    const ro = new ResizeObserver(() => {
      cy.resize();
      cy.fit(undefined, 20);
      scheduleFollow();
    });
    ro.observe(container);

    cy.on("pan zoom", scheduleFollow);
    cy.on("position", "node", scheduleFollow);

    return () => {
      try {
        ro.disconnect();
        cy.off("tap", "node", onTapNode);
        cy.off("pan zoom", scheduleFollow);
        cy.off("position", "node", scheduleFollow);
        cy.stop();
        cy.destroy();
      } catch {}
      cancelAnimationFrame(raf);
      cyRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cyStylesheet]);

  // Apply elements (only relayout here)
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    cy.startBatch();
    try {
      cy.elements().remove();
      if (elements.length) cy.add(elements);
    } finally {
      cy.endBatch();
    }

    if (elements.length) {
      const hasAnyPositions = elements.some((el: any) => (el as any).position);
      if (hasAnyPositions) {
        // We already have explicit node positions → do not run layout
        cy.fit(undefined, 20);
      } else {
        // No positions → run auto-layout once
        cy.layout({ name: "cose" }).run();
        cy.fit(undefined, 20);
      }
    }

    // prune popups for removed nodes
    setPopups((cur) => cur.filter((p) => cy.$id(p.path).length > 0));
  }, [elements]);

  // Outside clicks: save any dirty popup that didn't receive the click
  useEffect(() => {
    const onDownCapture = (ev: MouseEvent) => {
      const target = ev.target as HTMLElement | null;
      const roots = Array.from(document.querySelectorAll<HTMLElement>("[data-popup-path]"));
      const dirties = popupsRef.current.filter((p) => p.dirty);
      if (!dirties.length) return;

      for (const p of dirties) {
        const root = roots.find((el) => el.dataset.popupPath === p.path);
        if (root && target && root.contains(target)) continue; // clicked inside
        savePopup(p.path);
      }
    };
    document.addEventListener("mousedown", onDownCapture, true);
    return () => document.removeEventListener("mousedown", onDownCapture, true);
  }, []);

  // ------------------------------ Persistence helpers ------------------------------

  async function saveAsNewProject() {
    const files = Object.entries(fileMapRef.current).map(([path, content]) => ({ path, content }));
    if (!projectName.trim()) {
      alert("Give your project a name first");
      return;
    }
    const positions = snapshotPositions();
    const r = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: projectName.trim(), files, positions }),
    });
    if (!r.ok) {
      alert("Failed to create project");
      return;
    }
    const data = await r.json();
    setProjectId(data.id);
    setMyProjects((cur) => [{ id: data.id, name: data.name }, ...cur.filter((p) => p.id !== data.id)]);
    setInfo(`Saved as project #${data.id} (layout included)`);
  }

  async function saveAllToExisting() {
    if (!projectId) return saveAsNewProject();
    const files = Object.entries(fileMapRef.current).map(([path, content]) => ({ path, content }));

    // Save files
    const r = await fetch(`/api/projects/${projectId}/files/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files }),
    });

    // Save current node positions on the project
    const rp = await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ positions: snapshotPositions() }),
    });

    setInfo(r.ok && rp.ok ? "All changes & layout saved" : "Save failed (files or layout)");
  }

  async function loadProject(id: number) {
    const r = await fetch(`/api/projects/${id}`);
    if (!r.ok) {
      alert("Failed to load project");
      return;
    }
    const proj = await r.json();
    setProjectId(proj.id);
    setProjectName(proj.name);

    // positions
    positionsRef.current = (proj.positions ?? {}) as PositionsMap;

    const newMap: Record<string, string> = {};
    for (const f of proj.files || []) newMap[f.path] = f.content ?? "";
    fileMapRef.current = newMap;
    setFileMap(newMap);

    const files = Object.entries(newMap).map(([path, content]) => ({ path, content }));

    // nodes: attach saved position if present
    const nodes = files.map(({ path }) => {
      const pos = positionsRef.current[path];
      const el: any = { data: { id: path, label: basename(path), ext: extname(path) }, group: "nodes" as const };
      if (pos && typeof pos.x === "number" && typeof pos.y === "number") el.position = pos;
      return el;
    });

    const pathSet = new Set(files.map((f) => f.path));
    const edges: CyElement[] = [];
    for (const f of files) {
      const refs = inferEdges(f.path, f.content || "");
      for (const rr of refs) {
        const resolved = resolveRelative(f.path, rr);
        if (!resolved) continue;
        if (pathSet.has(resolved)) edges.push({ data: { id: `${f.path}=>${resolved}`, source: f.path, target: resolved }, group: "edges" });
        else {
          for (const ext of [".js", ".css", ".html", ".py", ".c", ".ts", ".tsx", ".jsx", ".h"]) {
            const cand = `${resolved}${ext}`;
            if (pathSet.has(cand)) {
              edges.push({ data: { id: `${f.path}=>${cand}`, source: f.path, target: cand }, group: "edges" });
              break;
            }
          }
        }
      }
    }

    setElements([...nodes, ...edges]);
    setTree(buildTree(files.map((f) => f.path)));
    setInfo(`Loaded project "${proj.name}" (${files.length} files${Object.keys(positionsRef.current).length ? ", layout restored" : ""})`);
    setPopups([]);
    setSelected(null);
  }

  // Save popup contents: update fileMap + surgically update edges in cy (no relayout)
  const savePopup = useCallback(
    (path: string) => {
      const cy = cyRef.current;
      const popup = popupsRef.current.find((pp) => pp.path === path);
      if (!popup) return;

      const draft = popup.draft;
      if (draft !== fileMapRef.current[path]) {
        // update file map
        const newMap = { ...fileMapRef.current, [path]: draft };
        fileMapRef.current = newMap;
        setFileMap(newMap);

        // recompute edges from this file
        const refs = inferEdges(path, draft);
        const newEdges: CyElement[] = [];

        if (cy) {
          const nodeIds = new Set<string>(cy.nodes().map((n) => n.id()));
          for (const r of refs) {
            const resolved = resolveRelative(path, r);
            if (!resolved) continue;

            let target: string | null = null;
            if (nodeIds.has(resolved)) {
              target = resolved;
            } else {
              for (const ext of [".js", ".css", ".html", ".py", ".c", ".ts", ".tsx", ".jsx", ".h"]) {
                const cand = `${resolved}${ext}`;
                if (nodeIds.has(cand)) {
                  target = cand;
                  break;
                }
              }
            }

            if (target) {
              newEdges.push({ data: { id: `${path}=>${target}`, source: path, target } });
            }
          }

          // update edges for this source only
          cy.startBatch();
          try {
            cy.edges().filter((e) => e.data("source") === path).remove();
            if (newEdges.length) cy.add(newEdges);
          } finally {
            cy.endBatch();
          }
        }

        // Persist to backend if project loaded AND authed
        if (projectId && authed) {
          fetch(`/api/projects/${projectId}/file`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path, content: draft }),
          }).catch(() => {});
        }
      }

      // mark popup as saved
      setPopups((cur) => cur.map((pp) => (pp.path === path ? { ...pp, dirty: false } : pp)));
    },
    [projectId, authed]
  );

  // Toggle node visibility from the tree (no zoom jump)
  const toggleVisibilityFromTree = (id: string) => {
    const cy = cyRef.current;
    if (!cy) return;
    const node = cy.$id(id);
    if (!node.length) return;

    const isHidden = (node as any).hidden ? (node as any).hidden() : node.style("display") === "none";

    if (isHidden) {
      node.show();
      node.connectedEdges().forEach((e) => {
        if (!e.source().hidden() && !e.target().hidden()) e.show();
      });
      cy.animate({ center: { eles: node }, duration: 250, easing: "ease-in-out" });
      setSelected(id);
    } else {
      node.hide();
      node.connectedEdges().hide();
      const popped = popupsRef.current.find((pp) => pp.path === id);
      if (popped && popped.dirty) savePopup(id);
      setPopups((cur) => cur.filter((pp) => pp.path !== id));
      if (selected === id) setSelected(null);
    }
  };

  // Parse a zip, build files → nodes/edges
  const onFile = useCallback(async (file: File) => {
    setInfo("Parsing zip…");
    const zip = await JSZip.loadAsync(file);

    const files: { path: string; content: string }[] = [];
    await Promise.all(
      Object.values(zip.files).map(async (entry: any) => {
        if (entry.dir) return;
        const path = entry.name.replace(/\\/g, "/");
        const ext = extname(path);
        if (!ALLOWED_EXTS.has(ext)) return;
        const text = await entry.async("string");
        files.push({ path, content: text });
      })
    );

    // content map
    const map: Record<string, string> = {};
    for (const f of files) map[f.path] = f.content;
    fileMapRef.current = map;
    setFileMap(map);

    // reset positions for a fresh upload (not a saved project)
    positionsRef.current = {};

    // nodes
    const nodes: CyElement[] = files.map(({ path }) => ({
      data: { id: path, label: basename(path), ext: extname(path) },
      group: "nodes",
    }));

    // edges
    const pathSet = new Set(files.map((f) => f.path));
    const edges: CyElement[] = [];
    for (const f of files) {
      const refs = inferEdges(f.path, f.content || "");
      for (const r of refs) {
        const resolved = resolveRelative(f.path, r);
        if (!resolved) continue;
        if (pathSet.has(resolved)) {
          edges.push({ data: { id: `${f.path}=>${resolved}`, source: f.path, target: resolved }, group: "edges" });
        } else {
          for (const ext of [".js", ".css", ".html", ".py", ".c", ".ts", ".tsx", ".jsx", ".h"]) {
            const cand = `${resolved}${ext}`;
            if (pathSet.has(cand)) {
              edges.push({ data: { id: `${f.path}=>${cand}`, source: f.path, target: cand }, group: "edges" });
              break;
            }
          }
        }
      }
    }

    setElements([...nodes, ...edges]);
    setTree(buildTree(files.map((f) => f.path)));
    setInfo(`${files.length} files, ${edges.length} relations`);
    setSelected(null);
    setPopups([]); // clear old popups
    setProjectId(null);
    setProjectName(file.name.replace(/\.zip$/i, "") || "My Project");
  }, []);

  // ------------------------------ Render ------------------------------

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(220px, 28vw) minmax(0,1fr)",
        height: "100vh",
        width: "100vw",
        overflow: "hidden",
      }}
    >
      {/* Sidebar */}
      <aside style={{ borderRight: "1px solid #e5e7eb", padding: 12, overflow: "auto" }}>
        <h2 style={{ marginTop: 0 }}>Project</h2>
        <input
          type="file"
          accept=".zip"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
        />
        <p style={{ fontSize: 12, color: "#4b5563" }}>{info}</p>

        {/* Load existing */}
        <div style={{ display: "flex", gap: 6, alignItems: "center", margin: "8px 0" }}>
          <select
            value={projectId ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) {
                setProjectId(null);
                return;
              }
              loadProject(Number(v));
            }}
            style={{ fontSize: 12 }}
            title={authed ? "Load project" : "Sign in to load projects"}
            disabled={!authed}
          >
            <option value="">{authed ? "Load project…" : "Sign in to load…"}</option>
            {myProjects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* Name + Save buttons */}
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <input
            placeholder="Project name"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            style={{ fontSize: 12, padding: "4px 6px", width: 180 }}
            title="Project name"
            disabled={!authed}
          />
          <button
            onClick={saveAsNewProject}
            style={{ fontSize: 12 }}
            title={authed ? "Save as new project" : "Sign in to save"}
            disabled={!authed}
          >
            Save as new
          </button>
          <button
            onClick={saveAllToExisting}
            style={{ fontSize: 12 }}
            title={authed ? "Save all changes" : "Sign in to save"}
            disabled={!authed}
          >
            Save all
          </button>
        </div>

        {!authed && (
          <p style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
            <a href="/login">Sign in</a> to enable saving/loading projects.
          </p>
        )}

        {/* Tree */}
        {tree ? (
          <div style={{ marginTop: 8 }}>
            <TreeView node={tree} onSelect={toggleVisibilityFromTree} />
          </div>
        ) : (
          <p style={{ fontSize: 12, color: "#6b7280" }}>No files yet.</p>
        )}
      </aside>

      {/* Graph area */}
      <section style={{ position: "relative", overflow: "hidden" }}>
        {/* Selection badge */}
        <div
          style={{
            position: "absolute",
            top: 8,
            left: 8,
            zIndex: 10,
            background: "white",
            padding: "4px 8px",
            borderRadius: 8,
            border: "1px solid #e5e7eb",
          }}
        >
          {selected ? <strong>{selected}</strong> : <span>Select a file from the tree or graph</span>}
        </div>

        {/* Cytoscape canvas */}
        <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

        {/* Editable popups (smaller, resizable, follow nodes) */}
        {popups.map((pp) => (
          <div
            key={pp.path}
            data-popup-path={pp.path}
            style={{
              position: "absolute",
              left: Math.max(8, pp.x) + "px",
              top: Math.max(8, pp.y) + "px",
              transform: "translate(-50%, -110%)",
              background: "white",
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
              width: "clamp(240px, 26vw, 520px)",
              minHeight: 140,
              maxHeight: "40vh",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              zIndex: 20,
              resize: "both",
            }}
            onWheel={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "6px 10px",
                borderBottom: "1px solid #e5e7eb",
                background: "#f9fafb",
                borderTopLeftRadius: 8,
                borderTopRightRadius: 8,
                fontSize: 12,
                flex: "0 0 auto",
              }}
            >
              <strong style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "30vw" }}>
                {basename(pp.path)}
              </strong>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {pp.dirty && <span style={{ fontSize: 11, color: "#9a3412" }}>● unsaved</span>}
                <button
                  onClick={() => {
                    if (pp.dirty) savePopup(pp.path);
                    setPopups((cur) => cur.filter((p) => p.path !== pp.path));
                  }}
                  style={{ background: "none", border: 0, cursor: "pointer", fontSize: 16, lineHeight: 1 }}
                  aria-label="Close"
                  title="Close"
                >
                  ×
                </button>
              </div>
            </div>
            <textarea
              value={pp.draft}
              spellCheck={false}
              onChange={(e) =>
                setPopups((cur) => cur.map((p) => (p.path === pp.path ? { ...p, draft: e.target.value, dirty: true } : p)))
              }
              onBlur={() => savePopup(pp.path)}
              style={{
                display: "block",
                width: "100%",
                flex: "1 1 auto",
                height: "auto",
                padding: "8px",
                border: 0,
                outline: "none",
                resize: "none",
                whiteSpace: "pre",
                overflow: "auto",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: 11,
                lineHeight: 1.35,
              }}
            />
          </div>
        ))}
      </section>
    </div>
  );
}
