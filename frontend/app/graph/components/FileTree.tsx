"use client";
import { useState } from "react";
import type { TreeNode } from "@/app/api/graph/upload/route";

function NodeRow({ node, depth }: { node: TreeNode; depth: number }) {
  const [open, setOpen] = useState(true);
  const isDir = node.type === "dir";

  return (
    <div>
      <div
        className="tree-row"
        style={{ paddingLeft: depth * 14 }}
        onClick={() => isDir && setOpen((v) => !v)}
      >
        <span className="tree-chevron">{isDir ? (open ? "▾" : "▸") : "•"}</span>
        <span className={isDir ? "tree-dir" : "tree-file"}>
          {node.name}
          {node.fileType ? <span className="tree-badge">{node.fileType}</span> : null}
        </span>
      </div>
      {isDir && open && node.children?.map((c) => (
        <NodeRow key={c.path} node={c} depth={depth + 1} />
      ))}
    </div>
  );
}

export default function FileTree({ node }: { node: TreeNode }) {
  if (!node?.children?.length) {
    return <p className="dz-sub">No files detected.</p>;
  }
  return (
    <div className="tree">
      {node.children.map((c) => (
        <NodeRow key={c.path} node={c} depth={0} />
      ))}
    </div>
  );
}
