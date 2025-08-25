'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import cytoscape, { Core, ElementDefinition, LayoutOptions } from 'cytoscape';

type SupportedType = 'c' | 'py' | 'html' | 'css' | 'js';
const SUPPORTED_EXTS: SupportedType[] = ['c', 'py', 'html', 'css', 'js'];

type ParsedFile = {
  path: string;         // e.g. src/utils/math.js
  name: string;         // e.g. math.js
  dir: string;          // e.g. src/utils
  ext: SupportedType;   // e.g. 'js'
  content: string;      // file text
  size: number;         // bytes (approx from string length)
};

function extOf(path: string): SupportedType | null {
  const m = path.toLowerCase().match(/\.([a-z0-9]+)$/);
  if (!m) return null;
  const e = m[1] as SupportedType;
  return SUPPORTED_EXTS.includes(e) ? e : null;
}

function normPath(p: string) {
  return p.replace(/\\/g, '/').replace(/^\/+/, '');
}

function dirname(p: string) {
  const np = normPath(p);
  const parts = np.split('/');
  parts.pop();
  return parts.join('/');
}

function basename(p: string) {
  const np = normPath(p);
  const parts = np.split('/');
  return parts.pop() || '';
}

function folderChain(dir: string): string[] {
  if (!dir) return [];
  const parts = dir.split('/').filter(Boolean);
  const acc: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    acc.push(parts.slice(0, i + 1).join('/'));
  }
  return acc;
}

function humanBytes(n: number) {
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

// Very light dependency sniffers (best-effort; not a full parser)
function extractDeps(file: ParsedFile, all: ParsedFile[]): string[] {
  const text = file.content;
  const targets: string[] = [];

  const byPathOrName = (spec: string) => {
    // Normalize like ./foo.js -> foo.js, src/foo -> try to match suffix
    const cleaned = spec.replace(/^\.?\//, '');
    // Prefer exact path suffix match
    const found =
      all.find(f => f.path === cleaned) ||
      all.find(f => f.path.endsWith('/' + cleaned)) ||
      all.find(f => f.name === cleaned) ||
      // Try adding common extensions if omitted
      all.find(f => f.name === cleaned + '.' + f.ext);
    return found?.path;
  };

  if (file.ext === 'js' || file.ext === 'html') {
    // JS imports/require(...) — only simple literal strings
    const importFrom = [...text.matchAll(/import[^'"]*['"]([^'"]+)['"]/g)].map(m => m[1]);
    const requireRe = [...text.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map(m => m[1]);
    for (const spec of [...importFrom, ...requireRe]) {
      const t = byPathOrName(spec);
      if (t) targets.push(t);
    }
    if (file.ext === 'html') {
      // <script src="...">, <link href="...">
      const srcHref = [...text.matchAll(/\b(?:src|href)=["']([^"']+)["']/g)].map(m => m[1]);
      for (const spec of srcHref) {
        const t = byPathOrName(spec);
        if (t) targets.push(t);
      }
    }
  } else if (file.ext === 'py') {
    // import x, from x import y (map x to path by basename heuristics)
    const pyMods = new Set<string>();
    for (const m of text.matchAll(/^\s*import\s+([a-zA-Z0-9_\.]+)/gm)) pyMods.add(m[1]);
    for (const m of text.matchAll(/^\s*from\s+([a-zA-Z0-9_\.]+)\s+import/gm)) pyMods.add(m[1]);
    for (const mod of pyMods) {
      const base = mod.split('.').pop()!;
      const t =
        all.find(f => f.name === base + '.py')?.path ||
        all.find(f => f.path.endsWith('/' + base + '.py'))?.path;
      if (t) targets.push(t);
    }
  } else if (file.ext === 'c') {
    // #include "path" or <path> — we only link to local matches
    const inc = [...text.matchAll(/#\s*include\s*[<"]([^">]+)[">]/g)].map(m => m[1]);
    for (const spec of inc) {
      const t =
        all.find(f => f.path.endsWith('/' + spec))?.path ||
        all.find(f => f.name === spec)?.path;
      if (t) targets.push(t);
    }
  } else if (file.ext === 'css') {
    // @import "file.css"
    const cssImp = [...text.matchAll(/@import\s+["']([^"']+)["']/g)].map(m => m[1]);
    for (const spec of cssImp) {
      const t = byPathOrName(spec);
      if (t) targets.push(t);
    }
  }

  // Deduplicate self-free
  return [...new Set(targets.filter(t => t !== file.path))];
}

export default function CodeGraphPage() {
  const [elements, setElements] = useState<ElementDefinition[]>([]);
  const [files, setFiles] = useState<ParsedFile[]>([]);
  const [selected, setSelected] = useState<ParsedFile | null>(null);
  const [status, setStatus] = useState<string>('Drop a .zip to begin');
  const [includeDeps, setIncludeDeps] = useState<boolean>(true);
  const [layoutName, setLayoutName] = useState<string>('cose');
  const [filter, setFilter] = useState<string>('');

  const cyRef = useRef<Core | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Build elements whenever files / includeDeps change
  const built = useMemo(() => {
    if (files.length === 0) return { elements: [] as ElementDefinition[], count: 0 };

    // Folder compound nodes
    const folderSet = new Set<string>();
    files.forEach(f => folderChain(f.dir).forEach(d => folderSet.add(d)));
    const folderNodes: ElementDefinition[] = [...folderSet].map(d => ({
      data: {
        id: d || '__root__',
        label: d ? d.split('/').slice(-1)[0] : 'root',
      },
      classes: 'folder',
    }));

    // File nodes
    const fileNodes: ElementDefinition[] = files.map(f => ({
      data: {
        id: f.path,
        label: f.name,
        parent: f.dir || '__root__',
        path: f.path,
        type: f.ext,
        size: f.size,
      },
      classes: `file ${f.ext}`,
    }));

    // Edges (optional deps)
    const edges: ElementDefinition[] = [];
    if (includeDeps) {
      for (const f of files) {
        const targets = extractDeps(f, files);
        targets.forEach((t, i) => {
          edges.push({
            data: {
              id: `e:${f.path}->${t}:${i}`,
              source: f.path,
              target: t,
            },
            classes: 'dep',
          });
        });
      }
    }

    return { elements: [...folderNodes, ...fileNodes, ...edges], count: files.length };
  }, [files, includeDeps]);

  // Initialize / update Cytoscape
  useEffect(() => {
    if (!containerRef.current) return;

    if (!cyRef.current) {
      const cy = cytoscape({
        container: containerRef.current,
        elements: built.elements,
        style: [
          // Folders (compound)
          {
            selector: 'node.folder',
            style: {
              'background-opacity': 0.08,
              'border-width': 1,
              'border-color': '#CBD5E1',
              'shape': 'round-rectangle',
              'label': 'data(label)',
              'text-valign': 'top',
              'text-halign': 'center',
              'font-size': 12,
              'color': '#475569',
              'padding': '12px',
            },
          },
          // Files
          {
            selector: 'node.file',
            style: {
              'background-color': '#E5E7EB',
              'border-color': '#9CA3AF',
              'border-width': 1,
              'shape': 'round-rectangle',
              'label': 'data(label)',
              'font-size': 11,
              'text-wrap': 'wrap',
              'text-max-width': 120,
              'color': '#111827',
              'padding': '6px',
            },
          },
          // File type accents
          { selector: 'node.file.js',   style: { 'background-color': '#FEF3C7' } }, // soft yellow
          { selector: 'node.file.py',   style: { 'background-color': '#DBEAFE' } }, // soft blue
          { selector: 'node.file.html', style: { 'background-color': '#FDE68A' } }, // amber
          { selector: 'node.file.css',  style: { 'background-color': '#DCFCE7' } }, // green
          { selector: 'node.file.c',    style: { 'background-color': '#E9D5FF' } }, // purple

          // Emphasize bigger files a bit
          {
            selector: 'node.file',
            style: {
              'width': 'mapData(size, 0, 50000, 40, 120)',
              'height': 'mapData(size, 0, 50000, 24, 48)',
            },
          },

          // Edges
          {
            selector: 'edge.dep',
            style: {
              'width': 1.5,
              'line-color': '#94A3B8',
              'curve-style': 'bezier',
              'target-arrow-shape': 'triangle',
              'target-arrow-color': '#94A3B8',
              'arrow-scale': 0.9,
            },
          },

          // Search highlight
          {
            selector: '.match',
            style: {
              'border-color': '#ef4444',
              'border-width': 2,
              'shadow-blur': 10,
              'shadow-opacity': 0.6,
              'shadow-color': '#ef4444',
            },
          },
        ],
        layout: { name: layoutName as any, animate: true } as LayoutOptions,
        wheelSensitivity: 0.2,
      });

      cy.on('tap', 'node.file', (evt) => {
        const n = evt.target;
        const path = n.data('path') as string;
        const f = files.find(ff => ff.path === path) || null;
        setSelected(f);
      });

      cyRef.current = cy;
    } else {
      const cy = cyRef.current!;
      cy.json({ elements: built.elements });
      cy.layout({ name: layoutName as any, animate: true }).run();
    }
  }, [built, layoutName, files]);

  // Simple search highlighting
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.nodes().removeClass('match');
    if (!filter.trim()) return;
    const q = filter.toLowerCase();
    cy.nodes('node.file').forEach(n => {
      const label = (n.data('label') as string).toLowerCase();
      const path = (n.data('path') as string).toLowerCase();
      if (label.includes(q) || path.includes(q)) n.addClass('match');
    });
  }, [filter]);

  async function handleZip(file: File) {
    setStatus('Reading ZIP…');
    try {
      const zip = await JSZip.loadAsync(file);
      const next: ParsedFile[] = [];

      const entries = Object.values(zip.files).filter(e => !e.dir);
      const textEntries = entries.filter(e => {
        const kind = extOf(e.name);
        return !!kind;
      });

      for (const e of textEntries) {
        const p = normPath(e.name);
        const ext = extOf(p)!;
        const content = await zip.file(e.name)!.async('string');
        next.push({
          path: p,
          name: basename(p),
          dir: dirname(p),
          ext,
          content,
          size: new Blob([content]).size,
        });
      }

      setFiles(next);
      setSelected(null);
      setStatus(`Loaded ${next.length} file(s).`);
    } catch (err: any) {
      console.error(err);
      setStatus('Failed to read ZIP (is it valid?)');
    }
  }

  function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) handleZip(f);
  }

  // Drag & drop
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) handleZip(f);
  }
  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
  }

  function fit() {
    cyRef.current?.fit(undefined, 20);
  }

  const totalBytes = useMemo(
    () => files.reduce((sum, f) => sum + f.size, 0),
    [files]
  );

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <h1 style={{ margin: 0 }}>Code Graph Explorer</h1>
      <p style={{ margin: 0, color: '#555' }}>
        Drop a <code>.zip</code> of your project (unpacked locally). We visualize <b>.c</b>, <b>.py</b>, <b>.html</b>, <b>.css</b>, <b>.js</b> as nodes. Toggle dependency edges and layouts.
      </p>

      {/* Controls */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 12,
        }}
      >
        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          style={{
            border: '2px dashed #CBD5E1',
            borderRadius: 12,
            padding: 16,
            background: '#F8FAFC',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Upload ZIP</div>
            <div style={{ color: '#475569', fontSize: 13 }}>{status}</div>
          </div>
          <label
            style={{
              padding: '8px 12px',
              border: '1px solid #94A3B8',
              borderRadius: 8,
              cursor: 'pointer',
              background: '#fff',
            }}
          >
            Choose file
            <input type="file" accept=".zip" onChange={onFileInput} style={{ display: 'none' }} />
          </label>
        </div>

        <div
          style={{
            border: '1px solid #E5E7EB',
            borderRadius: 12,
            padding: 16,
            background: '#fff',
            display: 'grid',
            gap: 8,
            alignItems: 'center',
            gridTemplateColumns: '1fr 1fr 1fr auto',
          }}
        >
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={includeDeps}
              onChange={(e) => setIncludeDeps(e.target.checked)}
            />
            Show dependency edges
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            Layout
            <select
              value={layoutName}
              onChange={(e) => setLayoutName(e.target.value)}
              style={{ padding: 6, borderRadius: 8, border: '1px solid #CBD5E1' }}
            >
              <option value="cose">cose</option>
              <option value="breadthfirst">breadthfirst</option>
              <option value="grid">grid</option>
              <option value="circle">circle</option>
              <option value="concentric">concentric</option>
            </select>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            Search
            <input
              type="text"
              placeholder="file name or path…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              style={{ padding: 6, borderRadius: 8, border: '1px solid #CBD5E1', width: '100%' }}
            />
          </label>

          <button
            onClick={fit}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid #CBD5E1',
              background: '#EEF2FF',
              cursor: 'pointer',
            }}
          >
            Fit
          </button>
        </div>
      </div>

      {/* Graph + Inspector */}
      <div
        style={{
          display: 'grid',
          gap: 12,
          gridTemplateColumns: '1.4fr 1fr',
          alignItems: 'stretch',
        }}
      >
        <div
          ref={containerRef}
          style={{
            height: '68vh',
            minHeight: 420,
            border: '1px solid #E5E7EB',
            borderRadius: 12,
            background: '#fff',
          }}
        />

        <div
          style={{
            border: '1px solid #E5E7EB',
            borderRadius: 12,
            background: '#fff',
            padding: 16,
            display: 'grid',
            gridTemplateRows: 'auto 1fr auto',
            gap: 8,
            minHeight: 200,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Inspector</div>
            <div style={{ color: '#64748B', fontSize: 12 }}>
              {files.length} files · {humanBytes(totalBytes)}
            </div>
          </div>

          {selected ? (
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ color: '#0F172A', fontWeight: 600 }}>{selected.path}</div>
              <div style={{ color: '#475569', fontSize: 12 }}>
                Type: <b>{selected.ext}</b> · Size: <b>{humanBytes(selected.size)}</b>
              </div>
              <pre
                style={{
                  margin: 0,
                  padding: 12,
                  background: '#0B1220',
                  color: '#E5E7EB',
                  borderRadius: 8,
                  maxHeight: '50vh',
                  overflow: 'auto',
                  fontSize: 12,
                  lineHeight: 1.4,
                }}
              >
                {selected.content}
              </pre>
            </div>
          ) : (
            <div style={{ color: '#64748B' }}>Click a file node to preview its contents.</div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: '#64748B' }}>Legend:</span>
            <Badge color="#FEF3C7" label="JS" />
            <Badge color="#DBEAFE" label="PY" />
            <Badge color="#FDE68A" label="HTML" />
            <Badge color="#DCFCE7" label="CSS" />
            <Badge color="#E9D5FF" label="C" />
          </div>
        </div>
      </div>
    </div>
  );
}

function Badge({ color, label }: { color: string; label: string }) {
  return (
    <span
      style={{
        background: color,
        border: '1px solid #E5E7EB',
        borderRadius: 999,
        padding: '2px 8px',
        fontSize: 11,
      }}
    >
      {label}
    </span>
  );
}
