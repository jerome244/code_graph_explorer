"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function GraphHubPage() {
  const [slug, setSlug] = useState("");
  const router = useRouter();

  function open(e: React.FormEvent) {
    e.preventDefault();
    const s = slug.trim();
    if (!s) return;
    router.push(`/projects/${encodeURIComponent(s)}/graph`);
  }

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-slate-900">Graph</h1>
          <Link href="/" className="text-slate-600 underline hover:text-slate-900">
            ← Back to Home
          </Link>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
          <p className="mb-4 text-slate-700">Enter a project slug to open its graph.</p>
          <form onSubmit={open} className="flex gap-2">
            <input
              className="flex-1 rounded-lg border p-2"
              placeholder="e.g. my-project"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
            />
            <button className="rounded-lg bg-slate-900 px-4 text-white">Open Graph</button>
          </form>

          <div className="mt-4 text-sm text-slate-600">
            or{" "}
            <Link href="/projects" className="underline hover:text-slate-900">
              browse projects
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
