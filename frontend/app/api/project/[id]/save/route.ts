export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const base = process.env.DJANGO_BASE_URL || process.env.NEXT_PUBLIC_DJANGO_BASE_URL
    if (!base) return Response.json({ error: 'DJANGO_BASE_URL not set' }, { status: 500 })

    const { nodes }: { nodes: { id: number; x: number; y: number }[] } = await req.json()
    // do simple sequential PATCH (fine for small graphs; can batch later)
    for (const n of nodes) {
      const r = await fetch(`${base}/nodes/${n.id}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pos_x: n.x, pos_y: n.y }),
      })
      if (!r.ok) {
        const t = await r.text()
        return Response.json({ error: 'patch failed', node: n.id, status: r.status, body: t }, { status: 502 })
      }
    }
    return Response.json({ ok: true })
  } catch (e: any) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 })
  }
}
