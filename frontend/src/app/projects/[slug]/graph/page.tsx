"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import GraphWithPopovers from "@/components/graph/GraphWithPopovers";

type Node = any; // your real type
type Edge = any;

export default function GraphPage() {
  const { slug } = useParams<{ slug: string }>(); // ✅ no Promise
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!slug) return;
    setErr(null);
    const r = await fetch(`/api/projects/${encodeURIComponent(String(slug))}/analysis`, {
      cache: "no-store",
    });
    const txt = await r.text();
    if (!r.ok) { setErr(txt || "Failed to load analysis."); return; }
    const data = JSON.parse(txt);
    setNodes(data?.graph?.nodes ?? []);
    setEdges(data?.graph?.edges ?? []);
  }, [slug]);

  useEffect(() => { void load(); }, [load]);

  return (
    <main className="p-6 space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Graph: {String(slug ?? "")}</h1>
        <button className="border rounded px-3 py-1" onClick={load}>Reload</button>
      </header>

      {err && <p className="text-red-600 text-sm">{err}</p>}

      <GraphWithPopovers slug={String(slug ?? "")} nodes={nodes} edges={edges} />
    </main>
  );
}
