// components/upload/ZipUpload.tsx
"use client";

import { useCallback } from "react";
import type { ElementDefinition } from "cytoscape";
import { buildTree, extOK, isJunk, normalizePath, type TreeNode } from "@/lib/fileTree";
import { treeToCy } from "@/lib/cyto";

export default function ZipUpload({
  onParsed,
  setStatus,
}: {
  onParsed: (res: { tree: TreeNode; elements: ElementDefinition[]; count: number }) => void;
  setStatus: (s: string) => void;
}) {
  const onFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setStatus("Reading zip…");

    try {
      const JSZip = (await import("jszip")).default;
      const zip = await JSZip.loadAsync(f);

      const filePaths: string[] = [];
      zip.forEach((relativePath: string, entry: any) => {
        if (!entry.dir) {
          const p = normalizePath(relativePath);
          if (!isJunk(p) && extOK(p)) filePaths.push(p);
        }
      });

      if (filePaths.length === 0) {
        setStatus("No supported files found (.c .py .html .css .js)");
        onParsed({
          tree: { name: "root", path: "", kind: "folder", children: [] },
          elements: [],
          count: 0,
        });
        return;
      }

      const tree = buildTree(filePaths);
      const elements = treeToCy(tree);
      onParsed({ tree, elements, count: filePaths.length });
      setStatus(`${filePaths.length} files loaded`);
    } catch (err: any) {
      console.error(err);
      setStatus(`Failed to read zip: ${err?.message || err}`);
    }
  }, [onParsed, setStatus]);

  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
      <input
        type="file"
        accept=".zip,application/zip,application/x-zip-compressed"
        onChange={onFileChange}
        style={{ display: "none" }}
      />
      <span
        style={{
          padding: "8px 12px",
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          fontWeight: 600,
        }}
      >
        Upload ZIP
      </span>
    </label>
  );
}
