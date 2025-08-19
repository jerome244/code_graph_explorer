// frontend/lib/cyto.ts
import type { ElementDefinition } from "cytoscape";
import type { TreeNode } from "./fileTree";
import { analyzeFiles, hashColor, type ParseResult } from "./analyze";

/**
 * Build a graph with:
 *  - file nodes only
 *  - edges between files for each matched function (caller -> declarer)
 *    Each edge is colored with the unique color for that function name.
 *
 * Returns Cytoscape elements + the parse result.
 */
export function treeToCy(
  root: TreeNode,
  files: Record<string, string> = {}
): { elements: ElementDefinition[]; parse: ParseResult } {
  const els: ElementDefinition[] = [];
  const fileSet = new Set<string>();

  // 1) Add file nodes from the tree
  function add(node: TreeNode) {
    if (node.kind === "file") {
      const id = node.path || node.name;
      fileSet.add(id);
      els.push({
        group: "nodes",
        data: { id, label: node.name, kind: "file" },
        // Inline style so it works without global stylesheet:
        style: { "background-color": "#111111" } as any,
      });
      return;
    }
    node.children?.forEach(add);
  }
  root.children?.forEach(add);

  // 2) Parse files for declared functions + callsites
  const parse = analyzeFiles(files);

  // 3) Create colored edges for each function match (cross-file)
  //    Edge key is (caller, declarer, fn) to avoid duplicates.
  const edgeKeys = new Set<string>();

  for (const [fn, callSites] of Object.entries(parse.calls)) {
    const declFiles = parse.declarations[fn] ? Array.from(parse.declarations[fn]) : [];
    if (declFiles.length === 0) continue; // unresolved function; skip

    const color = hashColor(fn);

    for (const cs of callSites) {
      for (const df of declFiles) {
        if (!fileSet.has(cs.file) || !fileSet.has(df)) continue;
        if (cs.file === df) continue; // skip self-file matches (keep only cross-file)

        const key = `${cs.file}->${df}::${fn}`;
        if (edgeKeys.has(key)) continue;
        edgeKeys.add(key);

        els.push({
          group: "edges",
          data: {
            id: `match:${cs.file}->${df}:${fn}`,
            source: cs.file,
            target: df,
            fn,                      // function name for later (e.g., popup highlight)
            kind: "match",
            color,                   // color carried on data too, if you prefer stylesheet mapping
          },
          // Inline style sets this specific edge's color to the function color:
          style: {
            "line-color": color,
            "target-arrow-color": color,
            "target-arrow-shape": "triangle",
            "arrow-scale": 0.8,
            width: 2,
            "curve-style": "bezier",
          } as any,
        });
      }
    }
  }

  return { elements: els, parse };
}
