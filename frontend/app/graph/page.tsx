"use client";

import JSZip from "jszip";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as cytoscapeImport from "cytoscape";
const cytoscape = (cytoscapeImport as any).default ?? (cytoscapeImport as any);

type CyElement = cytoscape.ElementDefinition;

const ALLOWED_EXTS = new Set([".c", ".py", ".html", ".css", ".js", ".ts", ".tsx", ".jsx", ".h"]);

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
              style={{ background: "none", border: 0, padding: 0, cursor: "pointer", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
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

export default function GraphPage() {
  const [elements, setElements] = useState<CyElement[]>([]);
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [info, setInfo] = useState<string>("Upload a .zip to begin");

  // file contents + ref (handlers always read latest)
  const [fileMap, setFileMap] = useState<Record<string, string>>({});
  const fileMapRef = useRef<Record<string, string>>({});
  useEffect(() => {
    fileMapRef.current = fileMap;
  }, [fileMap]);

  // selected file for the small badge
  const [selected, setSelected] = useState<string | null>(null);

  // MULTI popups that follow nodes
  type Popup = { path: string; x: number; y: number };
  const [popups, setPopups] = useState<Popup[]>([]);
  const popupsRef = useRef<Popup[]>([]);
  useEffect(() => {
    popupsRef.current = popups;
  }, [popups]);

  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);

  // even smaller nodes
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
      // dim hidden nodes just in case (extra guard)
      { selector: "node[?hidden]", style: { opacity: 0.2 } },
    ],
    []
  );

  // Create cy ONCE
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

    // open/close popup on node click (toggle)
    const onTapNode = (evt: any) => {
      const id: string = evt.target.id();
      const node = cy.$id(id);
      if (!node.length) return;

      // if popup exists -> close it; else open it
      const exists = popupsRef.current.find((pp) => pp.path === id);
      if (exists) {
        setPopups((cur) => cur.filter((pp) => pp.path !== id));
        return;
      }

      const p = node.renderedPosition();
      setPopups((cur) => [...cur, { path: id, x: p.x, y: p.y }]);
      setSelected(id);
    };
    cy.on("tap", "node", onTapNode);

    // keep popups following nodes while pan/zoom/move
    let raf = 0;
    const scheduleFollow = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const next: Popup[] = [];
        const current = popupsRef.current;
        for (const pop of current) {
          const n = cy.$id(pop.path);
          if (!n.length) continue;
          const rp = n.renderedPosition();
          next.push({ path: pop.path, x: rp.x, y: rp.y });
        }
        setPopups((prev) => {
          if (prev.length !== next.length) return next;
          for (let i = 0; i < prev.length; i++) {
            if (prev[i].path !== next[i].path || prev[i].x !== next[i].x || prev[i].y !== next[i].y) return next;
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

  // Update elements in-place
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
      cy.layout({ name: "cose" }).run();
      cy.fit(undefined, 20);
    }

    // drop popups whose nodes no longer exist
    setPopups((cur) => cur.filter((p) => cy.$id(p.path).length > 0));
  }, [elements]);

  // Toggle node visibility from the tree
  const toggleVisibilityFromTree = (id: string) => {
    const cy = cyRef.current;
    if (!cy) return;
    const node = cy.$id(id);
    if (!node.length) return;

    // Prefer cytoscape API hidden()/visible() if present
    const isHidden = (node as any).hidden ? (node as any).hidden() : node.style("display") === "none";

    if (isHidden) {
      node.show();
      // show connected edges (edges will still hide if the other end is hidden)
      // show only edges whose both ends are visible
      node.connectedEdges().forEach((e) => {
        if (!e.source().hidden() && !e.target().hidden()) e.show();
      });
      // gently pan to the node, keep current zoom
      cy.animate({ center: { eles: node }, duration: 250, easing: "ease-in-out" });
      setSelected(id);
    } else {
      node.hide();
      node.connectedEdges().hide();
      setPopups((cur) => cur.filter((pp) => pp.path !== id)); // close its popup if open
      if (selected === id) setSelected(null);
    }
  };

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

    // content map + ref
    const map: Record<string, string> = {};
    for (const f of files) map[f.path] = f.content;
    fileMapRef.current = map;
    setFileMap(map);

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
          for (const ext of [".js", ".css", ".html", ".py", ".c", ".ts", ".tsx", ".jsx"]) {
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
    setPopups([]); // clear old popups on new upload
  }, []);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(220px, 28vw) minmax(0,1fr)",
        height: "calc(100vh - 56px)", // use 100vh if you don't have a header
        width: "100vw",
        overflow: "hidden",
      }}
    >
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
        {tree ? (
          <TreeView node={tree} onSelect={toggleVisibilityFromTree} />
        ) : (
          <p style={{ fontSize: 12, color: "#6b7280" }}>No files yet.</p>
        )}
      </aside>

      <section style={{ position: "relative", overflow: "hidden" }}>
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

        {/* Graph canvas */}
        <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

        {/* Multiple popups that follow nodes; clicking same node closes its popup */}
        {popups.map((pp) => {
          const code = fileMapRef.current[pp.path] ?? "(no content loaded)";
          return (
            <div
              key={pp.path}
              style={{
                position: "absolute",
                left: Math.max(8, pp.x) + "px",
                top: Math.max(8, pp.y) + "px",
                transform: "translate(-50%, -110%)",
                background: "white",
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
                maxWidth: "40vw",
                maxHeight: "40vh",
                overflow: "auto",
                zIndex: 20,
              }}
              onWheel={(e) => e.stopPropagation()}
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
                }}
              >
                <strong style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "30vw" }}>
                  {basename(pp.path)}
                </strong>
                <button
                  onClick={() => setPopups((cur) => cur.filter((p) => p.path !== pp.path))}
                  style={{ background: "none", border: 0, cursor: "pointer", fontSize: 16, lineHeight: 1 }}
                  aria-label="Close"
                  title="Close"
                >
                  ×
                </button>
              </div>
              <pre
                style={{
                  margin: 0,
                  padding: "10px",
                  whiteSpace: "pre",
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  fontSize: 12,
                }}
              >
{code}
              </pre>
            </div>
          );
        })}
      </section>
    </div>
  );
}
