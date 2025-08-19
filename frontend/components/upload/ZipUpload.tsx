// components/upload/ZipUpload.tsx
"use client";

import { useCallback } from "react";
import type { ElementDefinition } from "cytoscape";
import {
  buildTree,
  extOK,
  isJunk,
  normalizePath,
  type TreeNode,
} from "@/lib/fileTree";
import { treeToCy } from "@/lib/cyto";

export default function ZipUpload({
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
  const onFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const input = e.target;
      const f = input.files?.[0];
      if (!f) return;
      setStatus("Reading zip…");

      try {
        // Lazy-load only in the browser
        const { default: JSZip } = await import("jszip");
        const buf = await f.arrayBuffer();
        const zip = await JSZip.loadAsync(buf);

        const filePaths: string[] = [];
        const files: Record<string, string> = {};
        const jobs: Promise<void>[] = [];

        // Iterate files in archive
        zip.forEach((relativePath: string, entry: any) => {
          if (entry.dir) return;
          const p = normalizePath(relativePath);
          if (isJunk(p) || !extOK(p)) return;

          filePaths.push(p);
          const file = zip.file(relativePath);
          if (file) {
            jobs.push(
              file.async("string").then((text: string) => {
                files[p] = text;
              })
            );
          }
        });

        await Promise.all(jobs);

        if (filePaths.length === 0) {
          setStatus("No supported files found (.c .py .html .css .js  — tip: add .ts/.tsx in lib/fileTree.ts)");
          onParsed({
            tree: { name: "root", path: "", kind: "folder", children: [] },
            elements: [],
            count: 0,
            files: {},
          });
          // allow re-uploading the same file
          input.value = "";
          return;
        }

        const tree = buildTree(filePaths);

        // ⬇️ New: pass file contents so cy builder can parse functions + calls
        const { elements } = treeToCy(tree, files);

        onParsed({ tree, elements, count: filePaths.length, files });
        setStatus(`${filePaths.length} files loaded`);
      } catch (err: any) {
        console.error(err);
        setStatus(`Failed to read zip: ${err?.message || err}`);
        onParsed({
          tree: { name: "root", path: "", kind: "folder", children: [] },
          elements: [],
          count: 0,
          files: {},
        });
      } finally {
        // allow selecting the same file again later
        input.value = "";
      }
    },
    [onParsed, setStatus]
  );

  return (
    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        cursor: "pointer",
      }}
    >
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
