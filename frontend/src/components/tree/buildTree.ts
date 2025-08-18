export type FileMeta = { lang?: string };
export type TreeNode =
  | { type: "dir"; name: string; path: string; children: TreeNode[] }
  | { type: "file"; name: string; path: string; meta?: FileMeta };

export function buildTree(
  files: string[],
  metaByFile?: Record<string, FileMeta>
): TreeNode {
  const root: TreeNode = { type: "dir", name: "", path: "", children: [] };

  const ensureDir = (parent: TreeNode, dir: string, fullPath: string) => {
    let found = (parent.children as TreeNode[]).find(
      (c) => c.type === "dir" && c.name === dir
    ) as TreeNode | undefined;
    if (!found) {
      found = { type: "dir", name: dir, path: fullPath, children: [] };
      parent.children.push(found);
    }
    return found;
  };

  for (const f of files.sort()) {
    const parts = f.split("/").filter(Boolean);
    let cur = root;
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const isLast = i === parts.length - 1;
      const full = parts.slice(0, i + 1).join("/");
      if (isLast) {
        (cur.children as TreeNode[]).push({
          type: "file",
          name,
          path: full,
          meta: metaByFile?.[f],
        });
      } else {
        cur = ensureDir(cur, name, parts.slice(0, i + 1).join("/"));
      }
    }
  }
  // sort: dirs first, then files, alpha
  const sortChildren = (n: TreeNode) => {
    if (n.type === "dir") {
      n.children.sort((a, b) => {
        if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      n.children.forEach(sortChildren);
    }
  };
  sortChildren(root);
  return root;
}
