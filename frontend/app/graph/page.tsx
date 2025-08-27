// frontend/app/graph/page.tsx
'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import cytoscape, { Core, ElementsDefinition } from 'cytoscape'

type RFNode = { id: string; data: { label: string; path: string; lang: string }; position: { x: number; y: number } }
type RFEdge = { id: string; source: string; target: string; label: string }

type TreeItem = {
  name: string
  isFolder: boolean
  path?: string
  lang?: string
  open?: boolean
  children?: TreeItem[]
}

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

  // Build a folder/file tree from ReactFlow nodes (paths)
  function buildTree(nodes: RFNode[]): TreeItem {
    const root: TreeItem = { name: '/', isFolder: true, open: true, children: [] }
    const byName = (arr: TreeItem[], name: string) => arr.find((c) => c.name === name)

    for (const n of nodes) {
      const clean = n.data.path.replace(/^\/+/, '')
      const parts = clean.split('/').filter(Boolean)
      let cur = root
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i]
        const isLast = i === parts.length - 1
        if (isLast) {
          cur.children = cur.children || []
          cur.children.push({
            name: part,
            isFolder: false,
            path: n.data.path,
            lang: n.data.lang,
          })
        } else {
          cur.children = cur.children || []
          let next = byName(cur.children, part)
          if (!next) {
            next = { name: part, isFolder: true, open: false, children: [] }
            cur.children.push(next)
          }
          cur = next
        }
      }
    }

    // optional: sort folders first, then files
    function sortTree(t: TreeItem) {
      if (!t.children) return
      t.children.sort((a, b) => {
        if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1
        return a.name.localeCompare(b.name)
      })
      t.children.forEach(sortTree)
    }
    sortTree(root)
    return root
  }

  const treeRoot = useMemo(() => buildTree(rfNodes), [rfNodes])

  // Recursively render the tree
  function TreeView({ item, depth, onSelect }: { item: TreeItem; depth?: number; onSelect: (path: string) => void }) {
    const d = depth ?? 0
    const indent = 8 + d * 14
    const isFolder = item.isFolder
    const toggle = () => {
      if (!isFolder) return
      item.open = !item.open
      // force re-render by cloning state (cheap trick: change a dummy state)
      setBump((x) => x + 1)
    }

    return (
      <div>
        <div
          style={{
            padding: '4px 6px',
            paddingLeft: indent,
            cursor: isFolder ? 'pointer' : 'default',
            userSelect: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
          onClick={isFolder ? toggle : undefined}
        >
          <span style={{ width: 14, display: 'inline-block', textAlign: 'center' }}>
            {isFolder ? (item.open ? '📂' : '📁') : '📄'}
          </span>
          {isFolder ? (
            <strong>{item.name}</strong>
          ) : (
            <button
              onClick={() => item.path && onSelect(item.path)}
              style={{
                all: 'unset',
                cursor: 'pointer',
                padding: '2px 4px',
                borderRadius: 4,
              }}
              title={item.path}
            >
              {item.name}
            </button>
          )}
        </div>
        {isFolder && item.open && item.children?.map((c, i) => <TreeView key={item.name + i} item={c} depth={d + 1} onSelect={onSelect} />)}
      </div>
    )
  }

  const [bump, setBump] = useState(0) // used to re-render tree when toggling folders

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
      if (!res.ok) {
        const txt = await res.text()
        throw new Error(`Upload failed ${res.status}: ${txt}`)
      }
      const data = await res.json()

      // Prefer server-provided Cytoscape elements if present:
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
      // build path->id map
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
      <header style={{ padding: '12px', borderBottom: '1px solid #eee', display: 'flex', gap: 12 }}>
        <input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="Project name" />
        <input type="file" accept=".zip" onChange={onUpload} />
        {loading && <span>Parsing…</span>}
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', minHeight: 0 }}>
        {/* LEFT: Tree panel */}
        <aside
          style={{
            borderRight: '1px solid #eee',
            overflow: 'auto',
            padding: '8px 0',
          }}
        >
          <div style={{ padding: '0 8px 8px 8px', fontWeight: 600, color: '#444' }}>Project files</div>
          {treeRoot.children && treeRoot.children.length > 0 ? (
            treeRoot.children.map((c, i) => <TreeView key={i} item={c} onSelect={focusByPath} />)
          ) : (
            <div style={{ padding: '0 12px', color: '#777' }}>Upload a ZIP to see the structure</div>
          )}
        </aside>

        {/* RIGHT: Cytoscape canvas */}
        <div ref={cyEl} style={{ width: '100%', height: '100%' }} />
      </div>
    </div>
  )
}
