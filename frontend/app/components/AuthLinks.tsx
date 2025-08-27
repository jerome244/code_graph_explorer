'use client'
import { useEffect, useState } from 'react'

export default function AuthLinks() {
  const [me, setMe] = useState<{ authenticated: boolean; user?: any }>({ authenticated: false })

  useEffect(() => {
    let on = true
    ;(async () => {
      try {
        const r = await fetch('/api/auth/me', { cache: 'no-store' })
        const j = await r.json()
        if (on) setMe(j)
      } catch {
        if (on) setMe({ authenticated: false })
      }
    })()
    return () => { on = false }
  }, [])

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    setMe({ authenticated: false })
  }

  if (!me.authenticated) {
    return (
      <nav style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <a href="/auth/login">Login</a>
        <span>·</span>
        <a href="/auth/register">Register</a>
      </nav>
    )
  }

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <span>Hi, {me.user?.username || me.user?.email}</span>
      <button onClick={logout} style={{ padding: '4px 8px', cursor: 'pointer' }}>Logout</button>
    </div>
  )
}
