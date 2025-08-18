"use client";

import { useEffect, useState, useRef } from "react";
import GraphWithPopovers from "@/components/graph/GraphWithPopovers";

type NodeData = { id: string; label?: string; path?: string; start?: number; end?: number; lang?: string };
type EdgeData = { id: string; source: string; target: string; label?: string };

export default function GraphPage({ params }: { params: { slug: string } }) {
  const [nodes, setNodes] = useState<NodeData[]>([]);
  const [edges, setEdges] = useState<EdgeData[]>([]);
  const [err, setErr] = useState<string | null>(null);

  // upload bar state
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<number>(0);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function load() {
    setErr(null);
    const r = await fetch(`/api/projects/${params.slug}/analysis`, { cache: "no-store" });
    if (!r.ok) { setErr(await r.text()); return; }
    const data = await r.json();
    // Expect data.graph.nodes / data.graph.edges
    setNodes((data.graph?.nodes ?? []).map((n: any) => n.data ?? n));
    setEdges((data.graph?.edges ?? []).map((e: any) => e.data ?? e));
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  function resetUploadState() {
    setUploading(false);
    setProgress(0);
    setUploadErr(null);
    setUploadMsg(null);
    setFile(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleUploadSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || uploading) return;

    setUploadErr(null);
    setUploadMsg(null);
    setUploading(true);
    setProgress(0);

    const form = new FormData();
    form.append("file", file);

    // Use XHR to get upload progress events
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/projects/${params.slug}/upload`, true);

    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) {
        const pct = Math.round((ev.loaded / ev.total) * 100);
        setProgress(pct);
      }
    };

    xhr.onload = async () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        setUploadMsg("Upload complete. Refreshing graph…");
        await load();
        // small delay so users see the success message
        setTimeout(() => { setUploadMsg(null); }, 1500);
      } else {
        setUploadErr(xhr.responseText || "Upload failed.");
      }
      setUploading(false);
    };

    xhr.onerror = () => {
      setUploadErr("Network error during upload.");
      setUploading(false);
    };

    xhr.send(form);
  }

  return (
    <main className="p-6 space-y-4">
      {/* Top upload bar */}
      <div className="sticky top-0 z-10 -mx-6 border-b bg-white/80 backdrop-blur px-6 py-3">
        <form onSubmit={handleUploadSubmit} className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              accept=".zip,application/zip"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              disabled={uploading}
              className="block w-72 cursor-pointer text-sm file:mr-3 file:rounded-lg file:border file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-gray-50 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!file || uploading}
              className="rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
            >
              {uploading ? "Uploading…" : "Upload ZIP"}
            </button>
            <button
              type="button"
              onClick={resetUploadState}
              disabled={uploading && progress < 100}
              className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
              title="Clear selected file"
            >
              Clear
            </button>
          </div>

          <div className="ml-auto flex items-center gap-3">
            {uploading && (
              <div className="flex items-center gap-2">
                <progress value={progress} max={100} className="h-2 w-40" />
                <span className="text-xs tabular-nums">{progress}%</span>
              </div>
            )}
            {uploadMsg && <span className="text-sm text-green-700">{uploadMsg}</span>}
            {uploadErr && <span className="text-sm text-red-600">{uploadErr}</span>}
          </div>
        </form>
      </div>

      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Graph: {params.slug}</h1>
        <div className="flex items-center gap-2">
          <button
            className="border rounded px-3 py-1"
            onClick={load}
            disabled={uploading}
            title="Reload latest analysis"
          >
            Reload
          </button>
        </div>
      </header>

      {err && <p className="text-red-600 text-sm">{err}</p>}

      <GraphWithPopovers slug={params.slug} nodes={nodes} edges={edges} />
    </main>
  );
}
