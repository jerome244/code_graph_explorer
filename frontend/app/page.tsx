'use client'
import { useRouter } from 'next/navigation'
import AuthLinks from './components/AuthLinks'

export default function Home() {
  const router = useRouter()
  return (
    <main style={{ display: 'grid', gridTemplateRows: 'auto 1fr', minHeight: '100vh' }}>
      {/* Top bar with auth links */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', borderBottom: '1px solid #eee'
      }}>
        <div style={{ fontWeight: 700 }}>Code Graph Explorer</div>
        <AuthLinks />
      </header>

      {/* Center content */}
      <section style={{ display: 'grid', placeItems: 'center', padding: '48px 16px' }}>
        <div style={{ display: 'grid', gap: 16, placeItems: 'center' }}>
          <h1>Upload a ZIP. Explore the code graph.</h1>
          <p>Visitors can use it without an account. Login/Registration is optional.</p>
          <button
            onClick={() => router.push('/graph')}
            style={{ padding: '10px 16px', border: '1px solid #ccc', borderRadius: 8, cursor: 'pointer' }}
          >
            Open Graph Builder
          </button>
        </div>
      </section>
    </main>
  )
}
