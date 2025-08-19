"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import cytoscape, { Core, ElementDefinition } from "cytoscape";
import Link from "next/link";

// Allowed file extensions
const ALLOWED = new Set(["c", "py", "html", "css", "js"]);

// Simple tree node type
type TreeNode = {
  name: string;
  path: string; // full path within zip
  kind: "folder" | "file";
  children?: TreeNode[];
};

// Utility: normalize zip paths, drop junk like __MACOSX
function normalizePath(p: string) {
  return p.replace(/^\/+/, "").replace(/\\+/g, "/");
}

function isJunk(path: string) {
  return (
    path.startsWith("__MACOSX/") ||
    path.endsWith(".DS_Store") ||
    (/^\.|\/\./.test((path.split("/").pop() || ""))) // hidden dotfiles
  );
}

function extOK(path: string) {
  const base = path.split("/").pop() || "";
  const idx = base.lastIndexOf(".");
  if (idx < 0) return false;
  const ext = base.slice(idx + 1).toLowerCase();
  return ALLOWED.has(ext);
}

// Build a directory tree from file paths
function buildTree(paths: string[]): TreeNode {
  const root: TreeNode = { name: "root", path: "", kind: "folder", children: [] };
  for (const p0 of paths) {
    const p = normalizePath(p0);
    if (!p || isJunk(p)) continue;
    const parts = p.split("/");
    let cur = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const atEnd = i === parts.length - 1;
      if (atEnd) {
        if (!extOK(p)) continue; // only keep allowed file types
        (cur.children ||= []);
        if (!cur.children.find((c) => c.name === part && c.kind === "file")) {
          cur.children.push({ name: part, path: p, kind: "file" });
        }
      } else {
        (cur.children ||= []);
        let next = cur.children.find((c) => c.name === part && c.kind === "folder");
        if (!next) {
          next = {
            name: part,
            path: (cur.path ? cur.path + "/" : "") + part,
            kind: "folder",
            children: [],
          };
          cur.children.push(next);
        }
        cur = next;
      }
    }
  }
  // sort folders first then files alphabetically
  function sortNode(node: TreeNode) {
    if (!node.children) return;
    node.children.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    node.children.forEach(sortNode);
  }
  sortNode(root);
  return root;
}

// Convert tree to Cytoscape elements using compound nodes for folders
function treeToCy(root: TreeNode): ElementDefinition[] {
  const els: ElementDefinition[] = [];

  function addNode(node: TreeNode, parentId?: string) {
    const id = node.path || "root";
    if (node.kind === "folder") {
      els.push({ data: { id, label: node.name || "root" } });
      node.children?.forEach((child) => addNode(child, id));
    } else {
      els.push({ data: { id, label: node.name, parent: parentId } });
    }
  }

  if (root.children && root.children.length) {
    els.push({ data: { id: "root", label: "project" } });
    root.children.forEach((c) => addNode(c, "root"));
  }
  return els;
}

// Sidebar tree view
function TreeView({ node }: { node: TreeNode }) {
  if (!node.children || node.children.length === 0) return null;
  return (
    <ul style={{ listStyle: "none", margin: 0, paddingLeft: 12 }}>
      {node.children.map((child) => (
        <TreeItem key={child.path || child.name} node={child} />
      ))}
    </ul>
  );
}

function TreeItem({ node }: { node: TreeNode }) {
  const [open, setOpen] = useState(true);
  const isFolder = node.kind === "folder";
  return (
    <li>
      <div
        onClick={() => isFolder && setOpen((v) => !v)}
        style={{
          cursor: isFolder ? "pointer" : "default",
          padding: "4px 6px",
          borderRadius: 6,
          userSelect: "none",
          fontWeight: isFolder ? 600 : 400,
        }}
        title={node.path}
      >
        {isFolder ? (open ? "📂" : "📁") : "📄"} {node.name}
      </div>
      {isFolder && open && node.children && node.children.length > 0 && (
        <TreeView node={node} />
      )}
    </li>
  );
}

export default function GraphPage() {
  const [tree, setTree] = useState<TreeNode>({
    name: "root",
    path: "",
    kind: "folder",
    children: [],
  });
  const [elements, setElements] = useState<ElementDefinition[]>([]);
  const [status, setStatus] = useState<string>("No file loaded");
  const cyRef = useRef<Core | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Create Cytoscape instance once
  useEffect(() => {
    if (containerRef.current && !cyRef.current) {
      cyRef.current = cytoscape({
        container: containerRef.current,
        elements: [],
        style: [
          {
            selector: "node",
            style: {
              "background-color": "#93c5fd",
              label: "data(label)",
              "font-size": 10,
              color: "#111827",
              "text-wrap": "wrap",
              "text-max-width": 120,
            },
          },
          {
            selector: ":parent",
            style: {
              "background-opacity": 0.08,
              "border-color": "#9ca3af",
              "border-width": 1,
              "text-valign": "top",
              "text-halign": "left",
              padding: 12,
            },
          },
        ],
      });
    }
  }, []);

  // Update graph when elements change
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.elements().remove();
    cy.add(elements);
    const layout = cy.layout({
      name: "cose",
      nodeDimensionsIncludeLabels: true,
      padding: 20,
    });
    layout.run();
  }, [elements]);

  const onUpload = useCallback(async (file: File) => {
    try {
      setStatus("Reading zip…");
      const zip = await JSZip.loadAsync(file);
      const filePaths: string[] = [];
      zip.forEach((relativePath, entry) => {
        if (!entry.dir) {
          const p = normalizePath(relativePath);
          if (!isJunk(p) && extOK(p)) filePaths.push(p);
        }
      });
      if (filePaths.length === 0) {
        setStatus("No supported files found (.c .py .html .css .js)");
        setTree({ name: "root", path: "", kind: "folder", children: [] });
        setElements([]);
        return;
      }
      const t = buildTree(filePaths);
      setTree(t);
      setElements(treeToCy(t));
      setStatus(`${filePaths.length} files loaded`);
    } catch (e: any) {
      console.error(e);
      setStatus(`Failed to read zip: ${e?.message || e}`);
    }
  }, []);

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) onUpload(f);
    },
    [onUpload]
  );

  return (
    <main style={{ display: "grid", gridTemplateColumns: "280px 1fr", height: "100vh" }}>
      {/* Sidebar */}
      <aside style={{ borderRight: "1px solid #e5e7eb", padding: 12, overflow: "auto" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 8,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 16 }}>Project files</h2>
          <Link href="/" style={{ fontSize: 12, textDecoration: "none" }}>
            Home
          </Link>
        </div>
        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>{status}</div>
        <TreeView node={tree} />
      </aside>

      {/* Main area */}
      <section style={{ display: "grid", gridTemplateRows: "auto 1fr" }}>
        {/* Top bar */}
        <div
          style={{
            padding: 12,
            borderBottom: "1px solid #e5e7eb",
            display: "flex",
            gap: 12,
            alignItems: "center",
          }}
        >
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input
              type="file"
              accept=".zip,application/zip,application/x-zip-compressed"
              onChange={onFileChange}
              style={{ display: "none" }}
            />
            <span
              style={{
                padding: "8px 12px",
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                fontWeight: 600,
              }}
            >
              Upload ZIP
            </span>
          </label>
          <span style={{ fontSize: 12, color: "#6b7280" }}>.c .py .html .css .js</span>
        </div>

        {/* Cytoscape canvas */}
        <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      </section>
    </main>
  );
}
