'use client';

import { useState } from "react";

export default function UploadZipPage() {
  const [slug, setSlug] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<null | { kind: "idle" | "loading" | "ok" | "error"; message?: string }>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!slug) { setStatus({ kind: "error", message: "Please enter a project slug." }); return; }
    if (!file) { setStatus({ kind: "error", message: "Please choose a .zip file." }); return; }

    try {
      setStatus({ kind: "loading" });
      const fd = new FormData();
      // Django endpoint usually expects 'file'; adjust if your API expects a different field name.
      fd.append("file", file);
      const res = await fetch(`/api/projects/${encodeURIComponent(slug)}/upload`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Upload failed with status ${res.status}`);
      }
      setStatus({ kind: "ok", message: "Upload successful! Your analysis job (if any) should kick off on the backend." });
    } catch (err: any) {
      setStatus({ kind: "error", message: err?.message || "Upload failed." });
    }
  }

  return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "#0b1020" }}>
      <div style={{ maxWidth: 720, width: "100%", background: "white", borderRadius: 16, padding: 24, boxShadow: "0 10px 30px rgba(0,0,0,0.15)" }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>Upload Project Archive</h1>
        <p style={{ marginTop: 8, color: "#374151" }}>Provide a project <code>slug</code> and a <code>.zip</code> file.</p>

        <form onSubmit={onSubmit} style={{ marginTop: 18, display: "grid", gap: 12 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontWeight: 600 }}>Project Slug</span>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="e.g. my-project"
              style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb" }}
              required
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontWeight: 600 }}>ZIP File</span>
            <input
              type="file"
              accept=".zip,application/zip,application/x-zip-compressed"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              style={{ padding: "8px 0" }}
              required
            />
          </label>

          <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
            <a href="/" style={{ textDecoration: "none", padding: "10px 16px", borderRadius: 10, border: "1px solid #d1d5db", color: "#111827", background: "white" }}>← Back</a>
            <button
              type="submit"
              disabled={status?.kind === "loading"}
              style={{ background: "#111827", color: "white", padding: "10px 16px", borderRadius: 10, fontWeight: 600, opacity: status?.kind === "loading" ? 0.7 : 1 }}
            >
              {status?.kind === "loading" ? "Uploading…" : "Upload ZIP"}
            </button>
          </div>
        </form>

        {status?.kind === "ok" && (
          <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: "#ecfdf5", border: "1px solid #10b981", color: "#065f46" }}>
            ✅ {status.message}
          </div>
        )}
        {status?.kind === "error" && (
          <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: "#fef2f2", border: "1px solid #ef4444", color: "#991b1b", whiteSpace: "pre-wrap" }}>
            ⚠️ {status.message}
          </div>
        )}
      </div>
    </main>
  );
}
