// components/file-tree/TreeView.tsx
"use client";

import { useState } from "react";
import type { TreeNode } from "@/lib/fileTree";

export default function TreeView({
  root,
  onSelect,
}: {
  root: TreeNode;
  onSelect?: (node: TreeNode) => void;
}) {
  if (!root.children || root.children.length === 0) {
    return <p style={{ fontSize: 12, color: "#6b7280" }}>No files.</p>;
  }
  return (
    <ul style={{ listStyle: "none", margin: 0, paddingLeft: 12 }}>
      {root.children.map((child) => (
        <TreeItem key={child.path || child.name} node={child} onSelect={onSelect} />
      ))}
    </ul>
  );
}

function TreeItem({ node, onSelect }: { node: TreeNode; onSelect?: (n: TreeNode) => void }) {
  const [open, setOpen] = useState(true);
  const isFolder = node.kind === "folder";

  return (
    <li>
      <div
        onClick={() => {
          if (isFolder) setOpen((v) => !v);
          else onSelect?.(node);
        }}
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
      {isFolder && open && node.children?.length ? (
        <ul style={{ listStyle: "none", margin: 0, paddingLeft: 12 }}>
          {node.children.map((child) => (
            <TreeItem key={child.path || child.name} node={child} onSelect={onSelect} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
