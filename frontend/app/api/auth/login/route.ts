import { cookies } from 'next/headers'

export async function POST(req: Request) {
  const { username, email, password } = await req.json()
  const base = process.env.DJANGO_BASE_URL!

  const r = await fetch(`${base}/auth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: username || email, password }),
  })
  if (!r.ok) return new Response(await r.text(), { status: r.status })
  const tok = await r.json()

  const store = await cookies()
  store.set('access', tok.access, { httpOnly: true, sameSite: 'lax', path: '/' })
  store.set('refresh', tok.refresh, { httpOnly: true, sameSite: 'lax', path: '/' })

  return Response.json({ ok: true })
}
