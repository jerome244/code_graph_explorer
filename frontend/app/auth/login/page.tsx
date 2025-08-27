'use client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function LoginPage() {
  const router = useRouter()
  const [usernameOrEmail, setUE] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // if already authenticated, bounce to home
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/auth/me', { cache: 'no-store' })
        const j = await r.json()
        if (j.authenticated) router.replace('/')
      } catch {}
    })()
  }, [router])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setErr(null)
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ username: usernameOrEmail, email: usernameOrEmail, password }),
      })
      if (!r.ok) throw new Error(await r.text())
      router.push('/')             // ⟵ redirect to HOME
    } catch (e:any) {
      setErr(e.message || 'Login failed')
    } finally { setLoading(false) }
  }

  return (
    <main style={{maxWidth:420, margin:'40px auto', padding:24}}>
      <h1>Login</h1>
      <form onSubmit={onSubmit} style={{display:'grid', gap:12, marginTop:16}}>
        <input placeholder="Username or Email" value={usernameOrEmail} onChange={e=>setUE(e.target.value)} required />
        <input placeholder="Password" type="password" value={password} onChange={e=>setPassword(e.target.value)} required />
        <button disabled={loading} type="submit">{loading ? 'Signing in…' : 'Login'}</button>
        {err && <div style={{color:'crimson'}}>{err}</div>}
      </form>
      <p style={{marginTop:8}}>No account? <a href="/auth/register">Register</a></p>
    </main>
  )
}
