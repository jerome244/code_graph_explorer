'use client'
import { useEffect, useRef, useState } from 'react'
import cytoscape, { Core, ElementsDefinition } from 'cytoscape'

export default function Home(){
  const cyRef = useRef<HTMLDivElement | null>(null)
  const cyInstance = useRef<Core | null>(null)

  const [loading, setLoading] = useState(false)
  const [projectName, setProjectName] = useState('My Project')

  function ensureCy(){
    if (cyInstance.current || !cyRef.current) return
    cyInstance.current = cytoscape({
      container: cyRef.current,
      elements: [],
      layout: { name: 'preset' }, // use positions from server
      style: [
        { selector: 'node', style: {
          'label': 'data(label)',
          'text-valign': 'center',
          'text-halign': 'center',
          'width': 'label',
          'height': 'label',
          'padding': '6px 10px',
          'background-color': '#ddd',
          'border-color': '#999',
          'border-width': 1,
          'font-size': 12,
        }},
        { selector: 'edge', style: {
          'curve-style': 'bezier',
          'target-arrow-shape': 'triangle',
          'width': 1.5,
          'line-color': '#bbb',
          'target-arrow-color': '#bbb',
          'label': 'data(label)',
          'font-size': 9,
          'text-background-color': '#fff',
          'text-background-opacity': 0.8,
          'text-background-padding': 2,
        }},
        { selector: ':selected', style: { 'border-width': 2, 'border-color': '#555' } },
      ],
      wheelSensitivity: 0.2,
    })
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>){
    const f = e.target.files?.[0]
    if(!f) return
    setLoading(true)
    try {
      const fd = new FormData()
      fd.append('file', f)
      fd.append('projectName', projectName)
      const res = await fetch('/api/upload', { method:'POST', body: fd })
      if (!res.ok) {
        const txt = await res.text()
        throw new Error(`Upload failed ${res.status}: ${txt}`)
      }
      const data = await res.json()

      // Prefer server-provided Cytoscape elements if present:
      const elements: ElementsDefinition | any[] = data.elements ?? [
        // Map ReactFlow -> Cytoscape on the client if needed:
        ...data.nodes.map((n:any)=>({
          data: { id: n.id, label: n.data.label, path: n.data.path, lang: n.data.lang },
          position: n.position
        })),
        ...data.edges.map((e:any)=>({
          data: { id: e.id, source: e.source, target: e.target, label: e.label }
        })),
      ]

      ensureCy()
      const cy = cyInstance.current!
      cy.elements().remove()
      cy.add(elements as any)
      // Fit nicely
      cy.fit(undefined, 40)
    } catch (err:any) {
      alert(err.message || String(err))
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(()=>{ ensureCy() }, [])

  return (
    <div style={{height:'100vh', display:'grid', gridTemplateRows:'auto 1fr'}}>
      <header style={{padding:'12px', borderBottom:'1px solid #eee', display:'flex', gap:12}}>
        <input value={projectName} onChange={e=>setProjectName(e.target.value)} placeholder="Project name"/>
        <input type="file" accept=".zip" onChange={onUpload} />
        {loading && <span>Parsing…</span>}
      </header>
      <div ref={cyRef} style={{ width:'100%', height:'100%' }} />
    </div>
  )
}
