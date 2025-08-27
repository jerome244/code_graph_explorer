// frontend/app/page.tsx
'use client'
import { useRouter } from 'next/navigation'

export default function Home(){
  const router = useRouter()
  return (
    <main style={{display:'grid', placeItems:'center', height:'100vh', gap:16}}>
      <h1>Code Graph Explorer</h1>
      <p>Upload a ZIP and visualize dependencies.</p>
      <button
        onClick={()=>router.push('/graph')}
        style={{padding:'10px 16px', border:'1px solid #ccc', borderRadius:8, cursor:'pointer'}}
      >
        Open Graph Builder
      </button>
    </main>
  )
}
