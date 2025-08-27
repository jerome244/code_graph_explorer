'use client'
import { useEffect, useState } from 'react'

type Project = { id: number; name: string; created_at: string }

export default function LoadProject({
  open,
  onClose,
  onSelect,
}: {
  open: boolean
  onClose: () => void
  onSelect: (id: number) => void
}) {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const r = await fetch('/api/projects', { cache: 'no-store' })
        if (!r.ok) throw new Error(await r.text())
        setProjects(await r.json())
      } catch (e: any) {
        setError(e?.message || 'Failed to load projects')
      } finally {
        setLoading(false)
      }
    })()
  }, [open])

  if (!open) return null

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.35)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 520,
          maxWidth: '95vw',
          background: 'white',
          color: 'black',
          borderRadius: 12,
          boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
          padding: 16,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>Open Project</h3>
          <button onClick={onClose} style={{ cursor: 'pointer' }}>✕</button>
        </div>

        {loading && <div style={{ padding: '8px 0' }}>Loading…</div>}
        {error && <div style={{ padding: '8px 0', color: 'crimson' }}>{error}</div>}

        {!loading && !error && (
          projects.length === 0 ? (
            <div style={{ padding: '8px 0', color: '#666' }}>No projects yet.</div>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0', display: 'grid', gap: 8 }}>
              {projects.map((p) => (
                <li
                  key={p.id}
                  style={{
                    border: '1px solid #eee',
                    borderRadius: 8,
                    padding: '10px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: '#666' }}>
                      {new Date(p.created_at).toLocaleString()}
                    </div>
                  </div>
                  <button
                    onClick={() => onSelect(p.id)}
                    style={{ padding: '6px 10px', cursor: 'pointer' }}
                  >
                    Open
                  </button>
                </li>
              ))}
            </ul>
          )
        )}
      </div>
    </div>
  )
}
