import JSZip from 'jszip'
import micromatch from 'micromatch'
import { parse as babelParse } from '@babel/parser'
import traverseModule from '@babel/traverse'
import dagre from 'dagre'

const traverse: any = (traverseModule as any).default ?? traverseModule

export const runtime = 'nodejs'
export const maxDuration = 60

const exts = ['.c', '.h', '.py', '.js', '.css', '.html']
const wanted = exts.map((e) => `**/*${e}`)

function langFromPath(path: string) { return path.split('.').pop()?.toLowerCase() || '' }

function textImports(lang: string, _path: string, text: string): string[] {
  const rels: string[] = []
  if (['js','mjs','ts','jsx','tsx'].includes(lang)) {
    try {
      const ast = babelParse(text, { sourceType: 'unambiguous', plugins: ['jsx','typescript','dynamicImport'] })
      traverse(ast, {
        ImportDeclaration(p: any) { rels.push(p.node.source.value) },
        CallExpression(p: any) {
          const callee: any = p.node.callee
          if (callee && (callee.name === 'require' || callee.type === 'Import')) {
            const arg = p.node.arguments[0] as any
            if (arg?.value) rels.push(arg.value)
          }
        },
      })
    } catch {}
  } else if (lang === 'py') {
    rels.push(...[...text.matchAll(/^\s*from\s+([^\s]+)\s+import\s+/gm)].map(m=>m[1]))
    rels.push(...[...text.matchAll(/^\s*import\s+([^\s]+)\s*/gm)].map(m=>m[1]))
  } else if (lang === 'c' || lang === 'h') {
    rels.push(...[...text.matchAll(/^\s*#\s*include\s+[<"]([^>"]+)[>"]/gm)].map(m=>m[1]))
  } else if (lang === 'css') {
    rels.push(...[...text.matchAll(/@import\s+["']([^"']+)["']/gm)].map(m=>m[1]))
  } else if (lang === 'html') {
    rels.push(...[...text.matchAll(/<script[^>]+src=["']([^"']+)["']/gmi)].map(m=>m[1]))
    rels.push(...[...text.matchAll(/<link[^>]+href=["']([^"']+\.css)["']/gmi)].map(m=>m[1]))
  }
  return rels
}

function normalizeRef(_curPath: string, ref: string) {
  if (!ref) return null
  if (ref.startsWith('http')) return null
  if (ref.startsWith('.') || ref.startsWith('/')) return ref
  if (ref.includes('/')) return ref
  return null
}

function resolveRelPath(from: string, ref: string) {
  if (!ref.startsWith('.')) return ref
  const parts = from.split('/'); parts.pop()
  for (const s of ref.split('/')) {
    if (!s || s === '.') continue
    if (s === '..') parts.pop()
    else parts.push(s)
  }
  return parts.join('/')
}

function relKind(lang: string) {
  if (lang === 'py') return 'imports'
  if (lang === 'c' || lang === 'h') return 'includes'
  if (lang === 'html' || lang === 'css') return 'links'
  return 'imports'
}

function layout(nodes: any[], edges: any[]) {
  const g = new (dagre as any).graphlib.Graph()
  g.setGraph({ rankdir: 'LR', nodesep: 50, ranksep: 90 })
  g.setDefaultEdgeLabel(() => ({}))
  nodes.forEach((n) => g.setNode(n.id, { width: Math.max(120, n.label.length * 7), height: 40 }))
  edges.forEach((e) => g.setEdge(e.source, e.target))
  ;(dagre as any).layout(g)
  const pos: Record<string, { x: number; y: number }> = {}
  nodes.forEach((n) => { const { x, y } = g.node(n.id); pos[n.id] = { x, y } })
  return pos
}

async function safeJson(res: Response) { const t = await res.text(); try { return JSON.parse(t) } catch { return { _raw: t } } }

export async function POST(req: Request) {
  try {
    const form = await req.formData()
    const file = form.get('file') as File
    const projectName = (form.get('projectName') as string) || 'Untitled'
    if (!file) return Response.json({ error: 'No file' }, { status: 400 })

    const buf = Buffer.from(await file.arrayBuffer())
    const zip = await JSZip.loadAsync(buf)

    const fileEntries: { path: string; lang: string; size: number; text: string }[] = []
    await Promise.all(Object.keys(zip.files).map(async (p) => {
      const zf = zip.files[p]
      if (zf.dir) return
      if (!micromatch.isMatch(p, wanted)) return
      const lang = langFromPath(p)
      const text = await zf.async('string')
      fileEntries.push({ path: p, lang, size: text.length, text })
    }))

    const nodes = fileEntries.map((f, i) => ({
      id: String(i + 1),
      label: f.path.split('/').pop() || f.path,
      path: f.path,
      kind: 'file',
      lang: f.lang,
    }))
    const idByPath = new Map(fileEntries.map((f, i) => [f.path, String(i + 1)]))

    const edges: { id: string; source: string; target: string; relation: string }[] = []
    for (const f of fileEntries) {
      for (const ref of textImports(f.lang, f.path, f.text || '')) {
        const norm = normalizeRef(f.path, ref); if (!norm) continue
        const candidates = [norm, `${norm}.js`, `${norm}.py`, `${norm}.c`, `${norm}.h`, `${norm}.css`, `${norm}.html`]
        const targetPath =
          candidates.find((c) => idByPath.has(resolveRelPath(f.path, c))) ||
          candidates.find((c) => idByPath.has(c))
        const targetId = targetPath
          ? idByPath.get(resolveRelPath(f.path, targetPath)) || idByPath.get(targetPath)
          : undefined
        if (targetId) {
          edges.push({ id: `${idByPath.get(f.path)}->${targetId}`, source: idByPath.get(f.path)!, target: String(targetId), relation: relKind(f.lang) })
        }
      }
    }

    const pos = layout(nodes, edges)
    const rfNodes = nodes.map((n) => ({ id: n.id, data: { label: n.label, path: n.path, lang: n.lang }, position: pos[n.id] || { x: 0, y: 0 } }))
    const rfEdges = edges.map((e) => ({ id: e.id, source: e.source, target: e.target, label: e.relation }))

    // cytoscape elements (preset)
    const cyNodes = rfNodes.map((n) => ({ data: { id: n.id, label: n.data.label, path: n.data.path, lang: n.data.lang }, position: n.position }))
    const cyEdges = rfEdges.map((e) => ({ data: { id: e.id, source: e.source, target: e.target, label: e.label } }))

    // persist to Django
    const base = process.env.DJANGO_BASE_URL || process.env.NEXT_PUBLIC_DJANGO_BASE_URL
    if (!base) return Response.json({ error: 'DJANGO_BASE_URL not set' }, { status: 500 })

    // Create project
    let r = await fetch(`${base}/projects/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: projectName }),
    })
    if (!r.ok) return Response.json({ error: 'projects create failed', status: r.status, body: await safeJson(r) }, { status: 502 })
    const project = await r.json()

    // Insert files
    const fileIdByPath = new Map<string, number>()
    for (const f of fileEntries) {
      r = await fetch(`${base}/files/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project: project.id, path: f.path, language: f.lang, size: f.size }),
      })
      if (!r.ok) return Response.json({ error: 'file save failed', path: f.path, status: r.status, body: await safeJson(r) }, { status: 502 })
      const saved = await r.json()
      fileIdByPath.set(f.path, saved.id)
    }

    // Insert nodes (with initial positions)
    const nodeIdByLocalId = new Map<string, number>()
    for (const n of rfNodes) {
      const fileId = fileIdByPath.get(n.data.path); if (!fileId) continue
      r = await fetch(`${base}/nodes/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: project.id,
          file: fileId,
          label: n.data.label,
          kind: 'file',
          pos_x: n.position.x,
          pos_y: n.position.y,
        }),
      })
      if (!r.ok) return Response.json({ error: 'node save failed', node: n.data.path, status: r.status, body: await safeJson(r) }, { status: 502 })
      const saved = await r.json()
      nodeIdByLocalId.set(n.id, saved.id)
    }

    // Insert edges
    for (const e of edges) {
      const s = nodeIdByLocalId.get(e.source), t = nodeIdByLocalId.get(e.target)
      if (!s || !t) continue
      r = await fetch(`${base}/edges/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project: project.id, source: s, target: t, relation: e.relation }),
      })
      if (!r.ok) return Response.json({ error: 'edge save failed', edge: e.id, status: r.status, body: await safeJson(r) }, { status: 502 })
    }

    // respond
    return Response.json({
      projectId: project.id,
      nodes: rfNodes,
      edges: rfEdges,
      elements: [...cyNodes, ...cyEdges],
      nodeDbIds: Object.fromEntries(nodeIdByLocalId), // <-- map local -> DB id
    })
  } catch (err: any) {
    return Response.json({ error: String(err?.message || err) }, { status: 500 })
  }
}
