// components/upload/GitHubImport.tsx
"use client";

import { useCallback, useState } from "react";
import type { ElementDefinition } from "cytoscape";
import { parseRepoInput } from "@/lib/github";
import { buildTree, extOK, isJunk, normalizePath, type TreeNode } from "@/lib/fileTree";
import { treeToCy } from "@/lib/cyto";

export default function GitHubImport({
  onParsed,
  setStatus,
}: {
  onParsed: (res: {
    tree: TreeNode;
    elements: ElementDefinition[];
    count: number;
    files: Record<string, string>;
  }) => void;
  setStatus: (s: string) => void;
}) {
  const [input, setInput] = useState("");   // accepts "owner/repo@ref" or URL
  const [busy, setBusy] = useState(false);

  const runImport = useCallback(async () => {
    const spec = parseRepoInput(input);
    if (!spec) {
      setStatus("Enter owner/repo or a valid GitHub URL");
      return;
    }
    setBusy(true);
    setStatus("Fetching from GitHub…");

    try {
      // Call our server proxy
      const resp = await fetch("/api/github/zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(spec),
      });

      if (!resp.ok) {
        const err = await safeJson(resp);
        setStatus(`GitHub fetch failed: ${err?.error || resp.statusText}`);
        setBusy(false);
        return;
      }

      const buf = await resp.arrayBuffer();

      // Parse zip in the browser (same flow as local ZIP)
      const JSZip = (await import("jszip")).default;
      const zip = await JSZip.loadAsync(buf);

      const filePaths: string[] = [];
      const files: Record<string, string> = {};
      const jobs: Promise<void>[] = [];

      zip.forEach((relativePath: string, entry: any) => {
        if (entry.dir) return;
        const p = normalizePath(relativePath);
        if (isJunk(p) || !extOK(p)) return;
        filePaths.push(p);
        const file = zip.file(relativePath);
        if (file) {
          jobs.push(file.async("string").then((text: string) => { files[p] = text; }));
        }
      });

      await Promise.all(jobs);

      if (filePaths.length === 0) {
        setStatus("No supported files found (.c .py .html .css .js)");
        onParsed({
          tree: { name: "root", path: "", kind: "folder", children: [] },
          elements: [],
          count: 0,
          files: {},
        });
        setBusy(false);
        return;
      }

      const tree = buildTree(filePaths);
      const elements = treeToCy(tree);
      onParsed({ tree, elements, count: filePaths.length, files });
      setStatus(`${filePaths.length} files loaded from ${spec.owner}/${spec.repo}${spec.ref ? `@${spec.ref}` : ""}`);
    } catch (e: any) {
      console.error(e);
      setStatus(`Import failed: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  }, [input, onParsed, setStatus]);

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="owner/repo[@ref] or GitHub URL"
        style={{
          width: 280,
          padding: "8px 10px",
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          outline: "none",
        }}
      />
      <button
        onClick={runImport}
        disabled={busy}
        style={{
          padding: "8px 12px",
          borderRadius: 8,
          border: "1px solid #e5e7eb",
          fontWeight: 600,
          opacity: busy ? 0.6 : 1,
        }}
      >
        {busy ? "Importing…" : "Import from GitHub"}
      </button>
    </div>
  );
}

async function safeJson(res: Response) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}
