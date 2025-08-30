import React from "react";
import { TreeNode } from "./types"; // Import TreeNode type if it's defined elsewhere

// TreeView component to render a nested list of file/folder paths
export default function TreeView({
  node,
  onSelect,
}: {
  node: TreeNode;
  onSelect: (path: string) => void;
}) {
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
