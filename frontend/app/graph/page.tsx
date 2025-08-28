"use client";

import JSZip from "jszip";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as cytoscapeImport from "cytoscape";

// ESM/CJS-safe import
const cytoscape = (cytoscapeImport as any).default ?? (cytoscapeImport as any);

type CyElement = cytoscape.ElementDefinition;

const ALLOWED_EXTS = new Set([".c", ".py", ".html", ".css", ".js"]);

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
  if (!rel.startsWith(".")) return null; // only resolve relative paths
  const baseDir = dirname(fromFile);
  return normalize(baseDir ? `${baseDir}/${rel}` : rel);
}

function inferEdges(filename: string, content: string): string[] {
  const edges: string[] = [];
  const ext = extname(filename);

  if (ext === ".js") {
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
  } else if (ext === ".c") {
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
              style={{ background: "none", border: 0, padding: 0, cursor: "pointer" }}
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
  const [selected, setSelected] = useState<string | null>(null);
  const [info, setInfo] = useState<string>("Upload a .zip to begin");

  const containerRef = useRef<HTMLDivElement>(null);

  // Build Cytoscape instance (destroy/recreate when elements change)
  const cyStylesheet = useMemo<cytoscape.Stylesheet[]>(
    () => [
      {
        selector: "node",
        style: {
          label: "data(label)",
          "font-size": 10,
          "text-valign": "center",
          "text-halign": "center",
          width: 32,
          height: 32,
        },
      },
      {
        selector: "edge",
        style: { width: 1, "curve-style": "bezier", "target-arrow-shape": "triangle" },
      },
      {
        selector: "node:selected",
        style: { "border-width": 2, "border-color": "#2563eb" },
      },
    ],
    []
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const cy = cytoscape({
      container,
      elements,
      style: cyStylesheet as any,
      wheelSensitivity: 0.2,
    });

    cy.on("tap", "node", (evt: any) => {
      setSelected(evt.target.id());
    });

    cy.layout({ name: "cose" }).run();

    // Resize on container size changes
    const ro = new ResizeObserver(() => cy.resize());
    ro.observe(container);

    return () => {
      ro.disconnect();
      cy.destroy();
    };
  }, [elements, cyStylesheet]);

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

    const nodes: CyElement[] = files.map(({ path }) => ({
      data: { id: path, label: basename(path), ext: extname(path) },
      group: "nodes",
    }));

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
          for (const ext of [".js", ".css", ".html", ".py", ".c"]) {
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
  }, []);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", height: "calc(100vh - 4rem)", gap: 12 }}>
      <aside style={{ borderRight: "1px solid #e5e7eb", paddingRight: 12, overflow: "auto" }}>
        <h2>Project</h2>
        <input
          type="file"
          accept=".zip"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
        />
        <p style={{ fontSize: 12, color: "#4b5563" }}>{info}</p>
        {tree ? <TreeView node={tree} onSelect={(p) => setSelected(p)} /> : <p style={{ fontSize: 12, color: "#6b7280" }}>No files yet.</p>}
      </aside>

      <section style={{ position: "relative" }}>
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
          {selected ? <strong>{selected}</strong> : <span>Select a file from the tree</span>}
        </div>

        <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      </section>
    </div>
  );
}
