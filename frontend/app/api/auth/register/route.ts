import { cookies } from 'next/headers'

export async function POST(req: Request) {
  const { username, email, password } = await req.json()
  const base = process.env.DJANGO_BASE_URL!
  const payload: any = { username, password }
  if (email) payload.email = email  // send only if provided

  // create user
  let r = await fetch(`${base}/auth/register/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!r.ok) {
    return new Response(await r.text(), { status: r.status })
  }

  // auto-login (username required, email optional)
  r = await fetch(`${base}/auth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!r.ok) return new Response(await r.text(), { status: r.status })
  const tok = await r.json()

  const store = await cookies()
  store.set('access', tok.access, { httpOnly: true, sameSite: 'lax', path: '/' })
  store.set('refresh', tok.refresh, { httpOnly: true, sameSite: 'lax', path: '/' })

  return Response.json({ ok: true })
}
