// src/app/projects/[slug]/analyze/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import FileTree from "@/components/tree/FileTree";

type Analysis = {
  id: number;
  name: string;
  created_at: string;
  summary: Record<string, number>;
  graph: {
    tree_by_file: Record<string, { lang?: string; functions?: string[]; calls?: string[] }>;
    nodes: any[];
    edges: any[];
  };
};

export default function AnalyzePage({ params }: { params: { slug: string } }) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  async function fetchLatest() {
    setErr(null);
    const r = await fetch(`/api/projects/${params.slug}/analysis`, { cache: "no-store" });
    if (!r.ok) { setAnalysis(null); return; }
    const data = (await r.json()) as Analysis;
    setAnalysis(data);
    // pick a default file
    const first = Object.keys(data.graph.tree_by_file || {})[0] || null;
    setSelected(first);
  }

  useEffect(() => { fetchLatest(); /* eslint-disable-next-line */ }, []);

    async function onUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;                // ← capture before await
    setLoading(true); setErr(null);
    const form = new FormData(formEl);
    const r = await fetch(`/api/projects/${params.slug}/upload`, { method: "POST", body: form });
    setLoading(false);
    if (!r.ok) { setErr(await r.text()); return; }
    await fetchLatest();
    formEl.reset();                                // ← safe now
    }

    async function onGithubImport(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;                // ← capture before await
    setLoading(true); setErr(null);
    const fd = new FormData(formEl);
    const body = JSON.stringify({ repo: fd.get("repo"), ref: fd.get("ref") });
    const r = await fetch(`/api/projects/${params.slug}/import/github`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
    });
    setLoading(false);
    if (!r.ok) { setErr(await r.text()); return; }
    await fetchLatest();
    formEl.reset();                                // ← safe now
    }

  const fileInfo = useMemo(() => {
    if (!analysis || !selected) return null;
    return { path: selected, meta: analysis.graph.tree_by_file[selected] };
  }, [analysis, selected]);

  return (
    <main className="flex min-h-[75vh]">
      {/* Left sidebar: file explorer */}
      <div className="w-72 shrink-0 border-r bg-white">
        <FileTree
          treeByFile={analysis?.graph.tree_by_file || {}}
          selected={selected}
          onSelect={setSelected}
          title="Files"
        />
      </div>

      {/* Right pane */}
      <section className="flex-1 p-6 space-y-6 overflow-auto max-w-5xl">
        <h1 className="text-2xl font-semibold">Analyze: {params.slug}</h1>

        {/* Actions */}
        <div className="grid gap-4 md:grid-cols-2">
          <form onSubmit={onUpload} className="border rounded p-4 space-y-2">
            <div className="font-semibold">Upload ZIP</div>
            <input type="file" name="file" accept=".zip" required className="w-full" />
            <button className="bg-black text-white rounded px-3 py-1" disabled={loading}>
              {loading ? "Uploading..." : "Upload & Analyze"}
            </button>
          </form>

          <form onSubmit={onGithubImport} className="border rounded p-4 space-y-2">
            <div className="font-semibold">Import from GitHub</div>
            <input
              name="repo"
              className="w-full border rounded p-2"
              placeholder="owner/name or https://github.com/owner/name"
              required
            />
            <input
              name="ref"
              className="w-full border rounded p-2"
              placeholder="branch/tag/sha (optional)"
            />
            <button className="bg-black text-white rounded px-3 py-1" disabled={loading}>
              {loading ? "Importing..." : "Import & Analyze"}
            </button>
          </form>
        </div>

        {err && <p className="text-red-600 text-sm">{err}</p>}

        {/* Latest analysis summary + file details */}
        {analysis ? (
          <>
            <div className="text-sm text-gray-600">
              Latest: {new Date(analysis.created_at).toLocaleString()} · {analysis.summary.files} files ·{" "}
              {analysis.summary.functions} functions · {analysis.summary.calls} calls ·{" "}
              {analysis.summary.css_classes} classes · {analysis.summary.css_ids} ids
            </div>

            {fileInfo ? (
              <div className="border rounded p-4">
                <div className="flex items-baseline justify-between">
                  <h2 className="text-lg font-semibold">{fileInfo.path}</h2>
                  {fileInfo.meta?.lang && (
                    <span className="text-xs text-gray-500">lang: {fileInfo.meta.lang}</span>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                  <Bucket title="Functions" items={fileInfo.meta?.functions as any} />
                  <Bucket title="Calls" items={fileInfo.meta?.calls as any} />
                  <Bucket title="HTML ids" items={(fileInfo.meta as any)?.html_ids} />
                  <Bucket title="HTML classes" items={(fileInfo.meta as any)?.html_classes} />
                  <Bucket title="CSS #ids" items={(fileInfo.meta as any)?.css_ids} />
                  <Bucket title="CSS .classes" items={(fileInfo.meta as any)?.css_classes} />
                </div>
              </div>
            ) : (
              <p className="text-gray-600">Select a file in the sidebar to see details.</p>
            )}
          </>
        ) : (
          <p className="text-gray-600">No analyses yet.</p>
        )}
      </section>
    </main>
  );
}

function Bucket({ title, items }: { title: string; items?: string[] }) {
  if (!items || items.length === 0) {
    return (
      <div><h4 className="font-semibold">{title}</h4><p className="text-sm text-gray-500">—</p></div>
    );
  }
  return (
    <div>
      <h4 className="font-semibold">{title}</h4>
      <ul className="list-disc ml-5 text-sm">
        {items.map((x) => (<li key={x}>{x}</li>))}
      </ul>
    </div>
  );
}
