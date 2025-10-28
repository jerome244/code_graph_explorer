import React, { useState } from "react";
import { TreeNode } from "./types"; // Import TreeNode type

interface TreeViewProps {
  node: TreeNode;
  onSelect: (path: string) => void;
}

export default function TreeView({ node, onSelect }: TreeViewProps) {
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());

  const toggleFolder = (path: string) => {
    setOpenFolders((prev) => {
      const newOpenFolders = new Set(prev);
      if (newOpenFolders.has(path)) {
        newOpenFolders.delete(path); // Close the folder
      } else {
        newOpenFolders.add(path); // Open the folder
      }
      return newOpenFolders;
    });
  };

  if (!node.children) return null;

  return (
    <ul style={{ listStyle: "none", paddingLeft: 12 }}>
      {node.children.map((child) => (
        <li key={child.path}>
          {child.isDir ? (
            <details open={openFolders.has(child.path)}>
              <summary
                onClick={() => toggleFolder(child.path)}
                style={{ cursor: "pointer" }}
              >
                {child.name}
              </summary>
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
