// src/app/projects/[slug]/graph/page.tsx
export const dynamic = "force-dynamic";

async function getLatest(slug: string) {
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "";
  const r = await fetch(`${base}/api/projects/${slug}/analysis`, { cache: "no-store" });
  if (!r.ok) return null;
  return r.json();
}

import CytoGraph from "@/components/graph/CytoGraph";

export default async function GraphPage({ params }: { params: { slug: string } }) {
  const data = await getLatest(params.slug);
  return (
    <main className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Graph · {params.slug}</h1>
      {!data ? (
        <p className="text-gray-600">No analyses yet.</p>
      ) : (
        <CytoGraph nodes={data.graph.nodes} edges={data.graph.edges} />
      )}
    </main>
  );
}
