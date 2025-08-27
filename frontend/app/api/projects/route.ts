// Lists projects from Django for the Load… modal
import { NextResponse } from 'next/server'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const base = process.env.DJANGO_BASE_URL || process.env.NEXT_PUBLIC_DJANGO_BASE_URL
  if (!base) {
    return NextResponse.json({ error: 'DJANGO_BASE_URL not set' }, { status: 500 })
  }
  const r = await fetch(`${base}/projects/`, { cache: 'no-store' })
  if (!r.ok) return new NextResponse(await r.text(), { status: r.status })
  const list = await r.json()
  return NextResponse.json(list)
}
