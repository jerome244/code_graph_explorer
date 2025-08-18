"use client";

import { useState } from "react";

export default function UploadPage() {
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function deriveNameFromFile(f?: File | null) {
    if (!f?.name) return "";
    const m = f.name.match(/^(.*?)(\.zip)?$/i);
    return (m?.[1] || "").replace(/[_\-]+/g, " ").trim();
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setMsg("Please choose a .zip file.");
      return;
    }
    setBusy(true);
    setMsg(null);

    // 1) Create project (use input name or derive from filename)
    const projectName = (name || deriveNameFromFile(file) || "New Project").trim();

    const createRes = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: projectName }),
    });

    if (!createRes.ok) {
      const t = await createRes.text();
      setMsg(t || "Failed to create project.");
      setBusy(false);
      return;
    }

    const project = await createRes.json();
    const slug = project?.slug;
    if (!slug) {
      setMsg("Created project did not return a slug.");
      setBusy(false);
      return;
    }

    // 2) Upload ZIP to that project
    const form = new FormData();
    form.append("file", file);

    const uploadRes = await fetch(`/api/projects/${encodeURIComponent(slug)}/upload`, {
      method: "POST",
      body: form,
    });

    if (!uploadRes.ok) {
      const t = await uploadRes.text();
      setMsg(t || "Upload failed.");
      setBusy(false);
      return;
    }

    // 3) Go to graph
    window.location.href = `/projects/${encodeURIComponent(slug)}/graph`;
  }

  return (
    <main className="min-h-screen grid place-items-center p-6">
      <form onSubmit={onSubmit} className="w-full max-w-md space-y-4 border rounded-xl p-6">
        <h1 className="text-2xl font-semibold">Upload Project ZIP</h1>

        <label htmlFor="project-name" className="block text-sm text-slate-600">
          Project name (optional)
        </label>
        <input
          id="project-name"
          className="w-full border rounded p-2"
          placeholder="My Project"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <label htmlFor="zip-file" className="block text-sm text-slate-600">
          ZIP file
        </label>
        <input
          id="zip-file"
          className="w-full border rounded p-2"
          type="file"
          accept=".zip"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />

        {msg && <p className="text-sm text-red-600">{msg}</p>}

        <button className="w-full bg-black text-white rounded p-2 disabled:opacity-60" disabled={busy}>
          {busy ? "Uploading…" : "Upload & Open Graph"}
        </button>

        <p className="text-xs text-slate-500">
          This will create a project and upload your ZIP, then open the graph page.
        </p>
      </form>
    </main>
  );
}
