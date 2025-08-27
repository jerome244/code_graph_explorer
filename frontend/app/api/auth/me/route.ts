import { cookies } from 'next/headers'

export async function GET() {
  const base = process.env.DJANGO_BASE_URL!
  const store = await cookies()
  const token = store.get('access')?.value
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}

  const r = await fetch(`${base}/auth/me/`, { headers })
  if (!r.ok) return Response.json({ authenticated: false })
  const user = await r.json()
  return Response.json({ authenticated: true, user })
}
