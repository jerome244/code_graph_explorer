'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import AuthLinks from './components/AuthLinks'

type Project = { id:number; name:string; created_at:string }

export default function Home() {
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      try {
        const r = await fetch('/api/projects', { cache: 'no-store' })
        if (r.ok) setProjects(await r.json())
      } finally { setLoading(false) }
    })()
  }, [])

  return (
    <main style={{ display: 'grid', gridTemplateRows: 'auto 1fr', minHeight: '100vh' }}>
      <header style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', borderBottom:'1px solid #eee' }}>
        <div style={{ fontWeight:700 }}>Code Graph Explorer</div>
        <AuthLinks />
      </header>

      <section style={{ display:'grid', gridTemplateColumns:'1fr', padding:'32px 16px', gap:24 }}>
        <div style={{ display:'grid', gap:12, placeItems:'start center' }}>
          <h2>Start a new graph</h2>
          <button
            onClick={() => router.push('/graph')}
            style={{ padding:'10px 16px', border:'1px solid #ccc', borderRadius:8, cursor:'pointer' }}
          >
            Open Graph Builder
          </button>
        </div>

        <div>
          <h2 style={{ marginBottom:12 }}>Recent projects</h2>
          {loading ? <div>Loading…</div> :
           projects.length === 0 ? <div style={{ color:'#777' }}>No projects yet.</div> :
           <ul style={{ display:'grid', gap:8 }}>
             {projects.map(p => (
               <li key={p.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', border:'1px solid #eee', borderRadius:8, padding:'10px 12px' }}>
                 <div>
                   <div style={{ fontWeight:600 }}>{p.name}</div>
                   <div style={{ fontSize:12, color:'#666' }}>{new Date(p.created_at).toLocaleString()}</div>
                 </div>
                 <button onClick={() => router.push(`/graph?project=${p.id}`)} style={{ padding:'6px 10px', border:'1px solid #ccc', borderRadius:6, cursor:'pointer' }}>
                   Open
                 </button>
               </li>
             ))}
           </ul>}
        </div>
      </section>
    </main>
  )
}
