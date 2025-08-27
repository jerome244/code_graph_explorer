// frontend/app/api/project/[id]/graph/route.ts
export async function GET(_: Request, { params }: { params: { id: string } }) {
  const base =
    process.env.DJANGO_BASE_URL || process.env.NEXT_PUBLIC_DJANGO_BASE_URL
  if (!base) {
    return Response.json({ error: 'DJANGO_BASE_URL not set' }, { status: 500 })
  }

  const r = await fetch(`${base}/projects/${params.id}/`, { cache: 'no-store' })
  if (!r.ok) return new Response(await r.text(), { status: r.status })
  const proj = await r.json()

  const rfNodes = (proj.nodes || []).map((n: any) => ({
    id: String(n.id),
    data: {
      label: n.label,
      path: n.file_path, // requires file_path in NodeSerializer
      lang:
        (proj.files || []).find((f: any) => f.id === n.file)?.language ?? '',
    },
    position: { x: n.pos_x || 0, y: n.pos_y || 0 },
  }))

  const rfEdges = (proj.edges || []).map((e: any) => ({
    id: String(e.id),
    source: String(e.source),
    target: String(e.target),
    label: e.relation,
  }))

  const elements = [
    ...rfNodes.map((n: any) => ({
      data: { id: n.id, label: n.data.label, path: n.data.path, lang: n.data.lang },
      position: n.position,
    })),
    ...rfEdges.map((e: any) => ({ data: { id: e.id, source: e.source, target: e.target, label: e.label } })),
  ]

  const nodeDbIds: Record<string, number> = Object.fromEntries(
    rfNodes.map((n: any) => [n.id, Number(n.id)])
  )

  return Response.json({
    projectId: proj.id,
    projectName: proj.name,
    nodes: rfNodes,
    edges: rfEdges,
    elements,
    nodeDbIds,
  })
}
