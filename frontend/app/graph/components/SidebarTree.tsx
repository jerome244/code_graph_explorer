'use client'
import { useMemo, useState, useEffect } from 'react'

export type RFNode = {
  id: string
  data: { label: string; path: string; lang: string }
  position: { x: number; y: number }
}

type TreeItem = {
  name: string
  isFolder: boolean
  /** folders only, canonical path with leading and trailing slash, e.g. "/src/utils/" */
  fullPath: string
  /** files only: original file path */
  path?: string
  lang?: string
  children?: TreeItem[]
}

function buildTree(nodes: RFNode[]): TreeItem {
  const root: TreeItem = { name: '/', isFolder: true, fullPath: '/', children: [] }

  const findFolder = (arr: TreeItem[] = [], name: string) =>
    arr.find((c) => c.isFolder && c.name === name)

  for (const n of nodes) {
    const parts = n.data.path.replace(/^\/+/, '').split('/').filter(Boolean)
    let cur = root
    let acc = '' // folder accumulator without leading slash

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const last = i === parts.length - 1

      if (last) {
        cur.children = cur.children || []
        cur.children.push({
          name: part,
          isFolder: false,
          fullPath: cur.fullPath, // parent folder
          path: n.data.path,
          lang: n.data.lang,
        })
      } else {
        acc = acc ? `${acc}/${part}` : part
        cur.children = cur.children || []
        let next = findFolder(cur.children, part)
        if (!next) {
          next = { name: part, isFolder: true, fullPath: `/${acc}/`, children: [] }
          cur.children.push(next)
        }
        cur = next
      }
    }
  }

  function sort(t: TreeItem) {
    if (!t.children) return
    t.children.sort((a, b) =>
      a.isFolder !== b.isFolder ? (a.isFolder ? -1 : 1) : a.name.localeCompare(b.name),
    )
    t.children.forEach(sort)
  }
  sort(root)
  return root
}

export default function SidebarTree({
  nodes,
  onSelect,
}: {
  nodes: RFNode[]
  onSelect: (path: string) => void
}) {
  const root = useMemo(() => buildTree(nodes), [nodes])

  // which folders are open (fullPath keys like "/src/", "/src/utils/")
  const [open, setOpen] = useState<Set<string>>(new Set(['/']))

  // when a new project loads, reset to only root open
  useEffect(() => {
    setOpen(new Set(['/']))
  }, [nodes])

  const toggle = (fullPath: string) => {
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(fullPath)) next.delete(fullPath)
      else next.add(fullPath)
      return next
    })
  }

  const Row = ({ item, depth }: { item: TreeItem; depth: number }) => {
    const isFolder = item.isFolder
    const padLeft = 8 + depth * 14
    const isOpen = isFolder ? open.has(item.fullPath) : false

    return (
      <div>
        <div
          onClick={isFolder ? () => toggle(item.fullPath) : undefined}
          style={{
            padding: '4px 6px',
            paddingLeft: padLeft,
            display: 'flex',
            gap: 6,
            alignItems: 'center',
            cursor: isFolder ? 'pointer' : 'default',
            userSelect: 'none',
          }}
        >
          <span style={{ width: 14, textAlign: 'center' }}>
            {isFolder ? (isOpen ? '📂' : '📁') : '📄'}
          </span>
          {isFolder ? (
            <strong>{item.name}</strong>
          ) : (
            <button
              onClick={() => item.path && onSelect(item.path)}
              style={{ all: 'unset', cursor: 'pointer', padding: '2px 4px', borderRadius: 4 }}
              title={item.path}
            >
              {item.name}
            </button>
          )}
        </div>

        {isFolder &&
          isOpen &&
          item.children?.map((c, i) => (
            <Row key={`${item.fullPath}${c.name}-${i}`} item={c} depth={depth + 1} />
          ))}
      </div>
    )
  }

  return (
    <aside style={{ borderRight: '1px solid #eee', overflow: 'auto', padding: '8px 0' }}>
      <div style={{ padding: '0 8px 8px 8px', fontWeight: 600, color: '#444' }}>Project files</div>
      {root.children && root.children.length > 0 ? (
        root.children.map((c, i) => <Row key={`${c.fullPath}${i}`} item={c} depth={0} />)
      ) : (
        <div style={{ padding: '0 12px', color: '#777' }}>Upload a ZIP to see the structure</div>
      )}
    </aside>
  )
}
