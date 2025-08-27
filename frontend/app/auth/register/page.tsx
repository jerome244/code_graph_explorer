'use client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function RegisterPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('') // optional
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
      const r = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ username, email: email || undefined, password }),
      })
      if (!r.ok) throw new Error(await r.text())
      router.push('/')             // ⟵ redirect to HOME after auto-login
    } catch (e:any) {
      setErr(e.message || 'Registration failed')
    } finally { setLoading(false) }
  }

  return (
    <main style={{maxWidth:420, margin:'40px auto', padding:24}}>
      <h1>Register</h1>
      <form onSubmit={onSubmit} style={{display:'grid', gap:12, marginTop:16}}>
        <input placeholder="Username (required)" value={username} onChange={e=>setUsername(e.target.value)} required />
        <input placeholder="Email (optional)" type="email" value={email} onChange={e=>setEmail(e.target.value)} />
        <input placeholder="Password (min 6)" type="password" value={password} onChange={e=>setPassword(e.target.value)} required />
        <button disabled={loading} type="submit">{loading ? 'Creating…' : 'Create account'}</button>
        {err && <div style={{color:'crimson'}}>{err}</div>}
      </form>
      <p style={{marginTop:8}}>Have an account? <a href="/auth/login">Login</a></p>
    </main>
  )
}
