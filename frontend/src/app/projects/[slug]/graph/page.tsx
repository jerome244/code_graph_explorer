"use client";

import { useEffect, useState } from "react";
import GraphWithPopovers from "@/components/graph/GraphWithPopovers";

type NodeData = { id: string; label?: string; path?: string; start?: number; end?: number; lang?: string };
type EdgeData = { id: string; source: string; target: string; label?: string };

export default function GraphPage({ params }: { params: { slug: string } }) {
  const [nodes, setNodes] = useState<NodeData[]>([]);
  const [edges, setEdges] = useState<EdgeData[]>([]);
  const [err, setErr] = useState<string | null>(null);

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

  return (
    <main className="p-6 space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Graph: {params.slug}</h1>
        <button className="border rounded px-3 py-1" onClick={load}>Reload</button>
      </header>

      {err && <p className="text-red-600 text-sm">{err}</p>}

      <GraphWithPopovers slug={params.slug} nodes={nodes} edges={edges} />
    </main>
  );
}
