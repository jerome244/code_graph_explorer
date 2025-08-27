import { NextResponse } from "next/server";
import JSZip from "jszip";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type TreeNode = {
  name: string;
  path: string;
  type: "dir" | "file";
  children?: TreeNode[];
  fileType?: string; // py | c | html | css | js | other
};

function kindFromExt(ext: string): string {
  switch (ext) {
    case ".py": return "py";
    case ".c":
    case ".h": return "c";
    case ".html":
    case ".htm": return "html";
    case ".css": return "css";
    case ".js":
    case ".mjs": return "js";
    default: return "other";
  }
}

function addToTree(root: TreeNode, filePath: string, isDir: boolean, fileType?: string) {
  const parts = filePath.split("/").filter(Boolean);
  let node = root;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const isLast = i === parts.length - 1;
    let child = node.children?.find((c) => c.name === part);
    if (!child) {
      child = {
        name: part,
        path: (node.path ? node.path + "/" : "") + part,
        type: isLast && !isDir ? "file" : "dir",
        children: isLast && !isDir ? undefined : [],
      };
      node.children = node.children || [];
      node.children.push(child);
    }
    if (isLast && !isDir && fileType) {
      child.fileType = fileType;
    }
    node = child;
  }
}

export async function POST(req: Request) {
  try {
    let arrayBuffer: ArrayBuffer | null = null;
    const ct = req.headers.get("content-type") || "";

    if (ct.startsWith("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof Blob)) {
        return NextResponse.json({ error: "No file provided" }, { status: 400 });
      }
      arrayBuffer = await file.arrayBuffer();
    } else {
      arrayBuffer = await req.arrayBuffer();
    }

    if (!arrayBuffer || (arrayBuffer as any).byteLength === 0) {
      return NextResponse.json({ error: "Empty request body" }, { status: 400 });
    }

    const zip = await JSZip.loadAsync(Buffer.from(arrayBuffer));

    const root: TreeNode = { name: "root", path: "", type: "dir", children: [] };
    const nodes: any[] = [];
    const edges: any[] = []; // add deps later

    const isJunk = (p: string) =>
      p.startsWith("__MACOSX/") ||
      p.includes("/__MACOSX/") ||
      p.split("/").some(seg => seg.startsWith("._"));

    const seen = new Set<string>();

    await Promise.all(
      Object.values(zip.files).map(async (entry) => {
        const rel = entry.name.replace(/\\/g, "/");
        if (isJunk(rel)) return;

        if (entry.dir) {
          addToTree(root, rel, true);
          return;
        }

        const ext = path.extname(rel).toLowerCase();
        const kind = kindFromExt(ext);

        addToTree(root, rel, false, kind);

        if (!seen.has(rel) && ["py", "c", "html", "css", "js"].includes(kind)) {
          seen.add(rel);
          nodes.push({
            data: { id: rel, label: path.basename(rel), type: kind },
          });
        }
      })
    );

    // sort tree: dirs first, then files (alpha)
    const sortTree = (n: TreeNode) => {
      if (!n.children) return;
      n.children.sort((a, b) => {
        if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      n.children.forEach(sortTree);
    };
    sortTree(root);

    return NextResponse.json({ nodes, edges, tree: root });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to parse zip" }, { status: 400 });
  }
}
