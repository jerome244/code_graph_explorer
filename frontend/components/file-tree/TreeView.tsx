"use client";

import { useState } from "react";
import type { TreeNode } from "@/lib/fileTree";

export default function TreeView({
  root,
  hiddenMap = {},
  onToggleFile,
}: {
  root: TreeNode;
  hiddenMap?: Record<string, boolean>;
  onToggleFile?: (path: string) => void;
}) {
  if (!root.children || root.children.length === 0) {
    return <p style={{ fontSize: 12, color: "#6b7280" }}>No files.</p>;
  }
  return (
    <ul style={{ listStyle: "none", margin: 0, paddingLeft: 12 }}>
      {root.children.map((child) => (
        <TreeItem
          key={child.path || child.name}
          node={child}
          hiddenMap={hiddenMap}
          onToggleFile={onToggleFile}
        />
      ))}
    </ul>
  );
}

function TreeItem({
  node,
  hiddenMap,
  onToggleFile,
}: {
  node: TreeNode;
  hiddenMap: Record<string, boolean>;
  onToggleFile?: (path: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const isFolder = node.kind === "folder";
  const isHidden = node.kind === "file" && !!hiddenMap[node.path];

  const style: React.CSSProperties = {
    cursor: isFolder ? "pointer" : "default",
    padding: "4px 6px",
    borderRadius: 6,
    userSelect: "none",
    fontWeight: isFolder ? 600 : 400,
    color: isHidden ? "#9ca3af" : undefined,
    textDecoration: isHidden ? "line-through" : "none",
  };

  const icon = isFolder ? (open ? "📂" : "📁") : isHidden ? "🙈" : "📄";

  return (
    <li>
      <div
        onClick={() => {
          if (isFolder) setOpen((v) => !v);
          else onToggleFile?.(node.path);
        }}
        style={style}
        title={node.path}
      >
        {icon} {node.name}
      </div>
      {isFolder && open && node.children?.length ? (
        <ul style={{ listStyle: "none", margin: 0, paddingLeft: 12 }}>
          {node.children.map((child) => (
            <TreeItem
              key={child.path || child.name}
              node={child}
              hiddenMap={hiddenMap}
              onToggleFile={onToggleFile}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
