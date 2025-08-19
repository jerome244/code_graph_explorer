// lib/cyto.ts
import type { ElementDefinition } from "cytoscape";
import type { TreeNode } from "./fileTree";

/** Produce Cytoscape elements with ONE node per FILE (no folder/parent nodes). */
export function treeToCy(root: TreeNode): ElementDefinition[] {
  const els: ElementDefinition[] = [];

  function add(node: TreeNode) {
    if (node.kind === "file") {
      const id = node.path || node.name;
      els.push({ data: { id, label: node.name } });
      return;
    }
    node.children?.forEach(add);
  }

  root.children?.forEach(add);
  return els;
}
