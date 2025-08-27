import { cookies } from 'next/headers'

export async function POST() {
  const store = await cookies()
  store.delete('access')
  store.delete('refresh')
  return Response.json({ ok: true })
}
