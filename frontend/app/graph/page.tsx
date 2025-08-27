'use client'
import { useEffect, useRef, useState } from 'react'
import cytoscape, { Core, ElementsDefinition } from 'cytoscape'
import SidebarTree, { RFNode } from './components/SidebarTree'
import UploadBar from './components/UploadBar'

type RFEdge = { id: string; source: string; target: string; label: string }

export default function GraphPage() {
  const cyEl = useRef<HTMLDivElement | null>(null)
  const cy = useRef<Core | null>(null)

  const [loading, setLoading] = useState(false)
  const [projectName, setProjectName] = useState('My Project')
  const [rfNodes, setRfNodes] = useState<RFNode[]>([])
  const [rfEdges, setRfEdges] = useState<RFEdge[]>([])
  const [pathToId, setPathToId] = useState<Map<string, string>>(new Map())

  function ensureCy() {
    if (cy.current || !cyEl.current) return
    cy.current = cytoscape({
      container: cyEl.current,
      layout: { name: 'preset' },
      style: [
        {
          selector: 'node',
          style: {
            label: 'data(label)',
            'text-valign': 'center',
            'text-halign': 'center',
            padding: '6px 10px',
            'background-color': '#ddd',
            'border-color': '#999',
            'border-width': 1,
            'font-size': 12,
          },
        },
        {
          selector: 'edge',
          style: {
            'curve-style': 'bezier',
            'target-arrow-shape': 'triangle',
            width: 1.5,
            'line-color': '#bbb',
            'target-arrow-color': '#bbb',
            label: 'data(label)',
            'font-size': 9,
            'text-background-color': '#fff',
            'text-background-opacity': 0.8,
            'text-background-padding': 2,
          },
        },
        { selector: ':selected', style: { 'border-width': 2, 'border-color': '#555' } },
      ],
      wheelSensitivity: 0.2,
    })
  }

  function focusByPath(path: string) {
    const id = pathToId.get(path)
    if (!id || !cy.current) return
    const graph = cy.current
    const node = graph.$id(String(id))
    if (node.nonempty()) {
      graph.elements().unselect()
      node.select()
      graph.animate({ fit: { eles: node, padding: 80 } }, { duration: 300 })
    }
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setLoading(true)
    try {
      const fd = new FormData()
      fd.append('file', f)
      fd.append('projectName', projectName)
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()

      const elements: ElementsDefinition | any[] =
        data.elements ??
        [
          ...data.nodes.map((n: RFNode) => ({
            data: { id: n.id, label: n.data.label, path: n.data.path, lang: n.data.lang },
            position: n.position,
          })),
          ...data.edges.map((e: RFEdge) => ({ data: { id: e.id, source: e.source, target: e.target, label: e.label } })),
        ]

      ensureCy()
      const graph = cy.current!
      graph.elements().remove()
      graph.add(elements as any)
      graph.fit(undefined, 40)

      setRfNodes(data.nodes as RFNode[])
      setRfEdges(data.edges as RFEdge[])
      const map = new Map<string, string>()
      ;(data.nodes as RFNode[]).forEach((n) => map.set(n.data.path, n.id))
      setPathToId(map)
    } catch (err: any) {
      alert(err.message || String(err))
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    ensureCy()
  }, [])

  return (
    <div style={{ height: '100vh', display: 'grid', gridTemplateRows: 'auto 1fr' }}>
      <UploadBar projectName={projectName} setProjectName={setProjectName} onUpload={onUpload} loading={loading} />

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', minHeight: 0 }}>
        <SidebarTree nodes={rfNodes} onSelect={focusByPath} />
        <div ref={cyEl} style={{ width: '100%', height: '100%' }} />
      </div>
    </div>
  )
}
