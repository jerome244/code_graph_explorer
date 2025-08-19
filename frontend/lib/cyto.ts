// lib/cyto.ts
import type { ElementDefinition } from "cytoscape";
import type { TreeNode } from "./fileTree";

export function treeToCy(root: TreeNode): ElementDefinition[] {
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
