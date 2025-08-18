"use client";

import { useMemo, useState } from "react";
import { buildTree, TreeNode } from "./buildTree";

type Props = {
  treeByFile: Record<string, { lang?: string }>;
  selected?: string | null;
  onSelect?: (path: string) => void;
  title?: string;
};

export default function FileTree({ treeByFile, selected, onSelect, title = "Files" }: Props) {
  const files = useMemo(() => Object.keys(treeByFile || {}), [treeByFile]);
  const meta = useMemo(() => {
    const m: Record<string, { lang?: string }> = {};
    for (const k of files) m[k] = { lang: treeByFile[k]?.lang };
    return m;
  }, [treeByFile, files]);
  const root = useMemo(() => buildTree(files, meta), [files, meta]);

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set<string>());
  const isOpen = (p: string) => expanded.has(p);
  const toggle = (p: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(p)) n.delete(p);
      else n.add(p);
      return n;
    });
  const expandAll = () => {
    const all = new Set<string>();
    const walk = (n: TreeNode) => {
      if (n.type === "dir") {
        all.add(n.path || "/");
        n.children.forEach(walk);
      }
    };
    walk(root);
    setExpanded(all);
  };
  const collapseAll = () => setExpanded(new Set());

  return (
    <aside className="w-full lg:w-72 border-r bg-white">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <div className="text-sm font-semibold">{title}</div>
        <div className="space-x-1">
          <button className="text-xs border rounded px-2 py-0.5" onClick={expandAll}>Expand</button>
          <button className="text-xs border rounded px-2 py-0.5" onClick={collapseAll}>Collapse</button>
        </div>
      </div>
      <div className="p-2 text-sm">
        <TreeNodeView node={root} depth={0} isOpen={isOpen} toggle={toggle} onSelect={onSelect} selected={selected} />
      </div>
    </aside>
  );
}

function TreeNodeView({
  node, depth, isOpen, toggle, onSelect, selected,
}: {
  node: TreeNode;
  depth: number;
  isOpen: (p: string) => boolean;
  toggle: (p: string) => void;
  onSelect?: (p: string) => void;
  selected?: string | null;
}) {
  if (node.type === "file") {
    const active = selected === node.path;
    return (
      <div
        className={`flex items-center gap-2 pl-${Math.min(depth * 4, 24)} py-0.5 cursor-pointer rounded ${
          active ? "bg-black/5" : "hover:bg-black/5"
        }`}
        onClick={() => onSelect?.(node.path)}
        title={node.path}
      >
        <span aria-hidden className="inline-block w-3 text-center">📄</span>
        <span className="truncate">{node.name}</span>
        {node.meta?.lang && <span className="ml-auto text-[10px] text-gray-500">{node.meta.lang}</span>}
      </div>
    );
  }

  // dir
  const open = isOpen(node.path || "/");
  return (
    <div>
      {node.path !== "" && (
        <div
          className={`flex items-center gap-2 pl-${Math.min(depth * 4, 24)} py-0.5 cursor-pointer rounded hover:bg-black/5`}
          onClick={() => toggle(node.path || "/")}
          title={node.path || "/"}
        >
          <span aria-hidden className="inline-block w-3 text-center">{open ? "📂" : "📁"}</span>
          <span className="truncate font-medium">{node.name || "/"}</span>
        </div>
      )}
      <div className={open || node.path === "" ? "block" : "hidden"}>
        {(node.children || []).map((c) => (
          <TreeNodeView
            key={`${c.type}:${c.path}`}
            node={c}
            depth={(node.path === "" ? depth : depth + 1)}
            isOpen={isOpen}
            toggle={toggle}
            onSelect={onSelect}
            selected={selected}
          />
        ))}
      </div>
    </div>
  );
}
