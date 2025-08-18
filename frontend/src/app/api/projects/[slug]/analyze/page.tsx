"use client";

import { useEffect, useState } from "react";

type Analysis = {
  id: number;
  name: string;
  created_at: string;
  summary: Record<string, number>;
  graph: { tree_by_file: Record<string, any>; nodes: any[]; edges: any[] };
};

export default function AnalyzePage({ params }: { params: { slug: string } }) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function fetchLatest() {
    setErr(null);
    const r = await fetch(`/api/projects/${params.slug}/analysis`, { cache: "no-store" });
    if (!r.ok) { setAnalysis(null); return; }
    setAnalysis(await r.json());
  }

  async function onUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true); setErr(null);
    const form = new FormData(e.currentTarget);
    const r = await fetch(`/api/projects/${params.slug}/upload`, { method: "POST", body: form });
    setLoading(false);
    if (!r.ok) { setErr(await r.text()); return; }
    await fetchLatest();
    (e.currentTarget.querySelector('input[type="file"]') as HTMLInputElement).value = "";
  }

  useEffect(() => { fetchLatest(); }, []);

  return (
    <main className="p-6 max-w-5xl mx-auto space-y-6">
      <h1 className="text-2xl font-semibold">Analyze Project: {params.slug}</h1>

      <form onSubmit={onUpload} className="border rounded p-4 space-y-2">
        <input type="file" name="file" accept=".zip" required className="w-full" />
        <button className="bg-black text-white rounded px-3 py-1" disabled={loading}>
          {loading ? "Uploading..." : "Upload & Analyze ZIP"}
        </button>
        {err && <p className="text-red-600 text-sm">{err}</p>}
      </form>

      {analysis ? (
        <section className="space-y-2">
          <h2 className="text-xl font-medium">Latest Analysis</h2>
          <p className="text-sm text-gray-600">
            {new Date(analysis.created_at).toLocaleString()} · {analysis.summary.files} files ·{" "}
            {analysis.summary.functions} functions · {analysis.summary.calls} calls ·{" "}
            {analysis.summary.css_classes} classes · {analysis.summary.css_ids} ids
          </p>
          <TreeView tree={analysis.graph.tree_by_file} />
        </section>
      ) : (
        <p className="text-gray-600">No analyses yet.</p>
      )}
    </main>
  );
}

function TreeView({ tree }: { tree: Record<string, any> }) {
  const files = Object.keys(tree).sort();
  return (
    <ul className="space-y-2">
      {files.map((f) => (
        <li key={f} className="border rounded p-3">
          <details>
            <summary className="cursor-pointer font-medium">{f} <span className="text-xs text-gray-500">({tree[f].lang})</span></summary>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
              <Bucket title="Functions" items={tree[f].functions} />
              <Bucket title="Calls" items={tree[f].calls} />
              <Bucket title="HTML ids" items={tree[f].html_ids} />
              <Bucket title="HTML classes" items={tree[f].html_classes} />
              <Bucket title="CSS #ids" items={tree[f].css_ids} />
              <Bucket title="CSS .classes" items={tree[f].css_classes} />
            </div>
          </details>
        </li>
      ))}
    </ul>
  );
}

function Bucket({ title, items }: { title: string; items: string[] }) {
  if (!items || items.length === 0) return (
    <div><h4 className="font-semibold">{title}</h4><p className="text-sm text-gray-500">—</p></div>
  );
  return (
    <div>
      <h4 className="font-semibold">{title}</h4>
      <ul className="list-disc ml-5 text-sm">
        {items.map((x: string) => (<li key={x}>{x}</li>))}
      </ul>
    </div>
  );
}

function GithubImportForm({ slug }: { slug: string }) {
  async function importFromGithub(formData: FormData) {
    "use server";
    const repo = formData.get("repo");
    const ref  = formData.get("ref");
    await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? ""}/api/projects/${slug}/import/github`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo, ref }), // don't send token from client by default
    });
  }
  return (
    <form action={importFromGithub} className="border rounded p-4 space-y-2">
      <div className="font-semibold">Import from GitHub</div>
      <input name="repo" className="w-full border rounded p-2"
             placeholder="owner/name or https://github.com/owner/name" required />
      <input name="ref" className="w-full border rounded p-2" placeholder="branch/tag/sha (optional)" />
      <button className="bg-black text-white rounded px-3 py-1">Import</button>
    </form>
  );
}
