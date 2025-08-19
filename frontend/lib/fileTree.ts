// lib/fileTree.ts
export type TreeNode = {
  name: string;
  path: string;
  kind: "folder" | "file";
  children?: TreeNode[];
};

export const ALLOWED = new Set(["c", "py", "html", "css", "js"]);

export function normalizePath(p: string) {
  // strip leading slashes, convert backslashes to forward slashes
  return p.replace(/^\/+/, "").replace(/\\+/g, "/");
}

export function isJunk(path: string) {
  return (
    path.startsWith("__MACOSX/") ||
    path.endsWith(".DS_Store") ||
    (/^\.|\/\./.test((path.split("/").pop() || ""))) // hidden dotfiles
  );
}

export function extOK(path: string) {
  const base = path.split("/").pop() || "";
  const idx = base.lastIndexOf(".");
  if (idx < 0) return false;
  const ext = base.slice(idx + 1).toLowerCase();
  return ALLOWED.has(ext);
}

export function buildTree(paths: string[]): TreeNode {
  const root: TreeNode = { name: "root", path: "", kind: "folder", children: [] };

  for (const p0 of paths) {
    const p = normalizePath(p0);
    if (!p || isJunk(p)) continue;

    const parts = p.split("/");
    let cur = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const atEnd = i === parts.length - 1;

      if (atEnd) {
        if (!extOK(p)) continue;
        (cur.children ||= []);
        if (!cur.children.find((c) => c.name === part && c.kind === "file")) {
          cur.children.push({ name: part, path: p, kind: "file" });
        }
      } else {
        (cur.children ||= []);
        let next = cur.children.find((c) => c.name === part && c.kind === "folder");
        if (!next) {
          next = {
            name: part,
            path: (cur.path ? cur.path + "/" : "") + part,
            kind: "folder",
            children: [],
          };
          cur.children.push(next);
        }
        cur = next;
      }
    }
  }

  // folders first, then files; alphabetically
  function sortNode(node: TreeNode) {
    if (!node.children) return;
    node.children.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    node.children.forEach(sortNode);
  }
  sortNode(root);

  return root;
}
