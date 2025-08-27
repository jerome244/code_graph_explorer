'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ElementDefinition } from 'cytoscape';
import { useSearchParams } from 'next/navigation';

import { ZipDrop } from './components/ZipDrop';
import { Controls } from './components/Controls';
import { TreeView } from './components/TreeView';
import { Graph, GraphHandle } from './components/Graph';
import { CodePopup } from './components/CodePopup';
import { ProjectBar } from './components/ProjectBar';

import { buildElements, buildTree, filterTree, humanBytes } from './lib/utils';
import type { ParsedFile, TreeNode } from './lib/types';
import { buildFunctionIndex, buildFnHueMap } from './lib/functions';

// Live Share
import { useLiveProject } from './lib/live';
import { getTokens } from './lib/auth';

export default function CodeGraphPage() {
  const [files, setFiles] = useState<ParsedFile[]>([]);
  const [includeDeps, setIncludeDeps] = useState(true);
  const [layoutName, setLayoutName] = useState('cose');
  const [filter, setFilter] = useState('');
  const [treeCollapsed, setTreeCollapsed] = useState(false);

  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set(['__root__']));
  const [hiddenFiles, setHiddenFiles] = useState<Set<string>>(new Set());
  const [openPopups, setOpenPopups] = useState<Set<string>>(new Set());

  const [fnMode, setFnMode] = useState(false);

  // rerender trigger after popups decorate anchors
  const [decorationVersion, setDecorationVersion] = useState(0);
  const bumpDecoration = () => setDecorationVersion(v => v + 1);

  const [popupPositions, setPopupPositions] = useState<Record<string, { x: number; y: number }>>({});
  const graphRef = useRef<GraphHandle>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  const searchParams = useSearchParams();

  // Track which project is active (for Live Share auth room)
  const [activeProjectId, setActiveProjectId] = useState<number | null>(null);

  // Live Share connection (either by projectId + JWT, or by share token)
  const shareToken = searchParams?.get('share') || null;
  const { access } = getTokens();
  const live = useLiveProject({
    projectId: activeProjectId,
    shareToken,
    jwt: access || null,
    displayName: (typeof window !== 'undefined' && (localStorage.getItem('username') || localStorage.getItem('email') || 'Guest')) || undefined,
  });

  // Derived
  const baseElements: ElementDefinition[] = useMemo(
    () => buildElements(files, includeDeps),
    [files, includeDeps]
  );

  const fnIndex = useMemo(() => buildFunctionIndex(files), [files]);
  const fnHues  = useMemo(() => buildFnHueMap(fnIndex), [fnIndex]);

  const elements: ElementDefinition[] = useMemo(() => baseElements, [baseElements]);

  const tree: TreeNode = useMemo(() => buildTree(files), [files]);
  const filteredTree: TreeNode = useMemo(
    () => filterTree(tree, filter) || { ...tree, children: [] },
    [tree, filter]
  );
  const totalBytes = useMemo(() => files.reduce((s, f) => s + f.size, 0), [files]);

  function toggleFolder(id: string) {
    setOpenFolders(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function toggleFileVisibility(path: string) {
    setHiddenFiles(prev => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      setOpenPopups(p => {
        const q = new Set(p);
        if (next.has(path)) q.delete(path);
        return q;
      });
      return next;
    });
  }
  function handleTogglePopup(path: string) {
    setOpenPopups(prev => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  }
  function onZipLoaded(next: ParsedFile[]) {
    setFiles(next);
    setHiddenFiles(new Set());
    setOpenPopups(new Set());
    const tops = new Set<string>(['__root__']);
    next.forEach(f => {
      const first = f.dir.split('/').filter(Boolean)[0];
      if (first) tops.add(first);
    });
    setOpenFolders(tops);
  }

  // Auto-load shared link ?share=<token>
  useEffect(() => {
    const token = searchParams?.get('share');
    if (!token) return;

    const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    fetch(`${API_BASE}/api/projects/shared/${encodeURIComponent(token)}/`)
      .then(r => (r.ok ? r.json() : Promise.reject(r)))
      .then(payload => {
        const f: ParsedFile[] = payload?.data?.files ?? [];
        const o = payload?.data?.options ?? {};
        setFiles(f);
        setIncludeDeps(!!o.includeDeps);
        setLayoutName(o.layoutName || 'cose');
        setFilter(o.filter || '');
        setFnMode(!!o.fnMode);

        // if backend includes project id in token response, use it to enter id-based room
        if (typeof payload?.id === 'number') {
          setActiveProjectId(payload.id);
        }

        setHiddenFiles(new Set());
        setOpenPopups(new Set());
        const tops = new Set<string>(['__root__']);
        f.forEach((file: any) => {
          const first = (file.dir || '').split('/').filter(Boolean)[0];
          if (first) tops.add(first);
        });
        setOpenFolders(tops);

        setTimeout(() => graphRef.current?.fit(), 0);
      })
      .catch(async (e) => {
        const msg = typeof e?.text === 'function' ? await e.text() : 'Failed to open shared project.';
        // eslint-disable-next-line no-alert
        alert(msg);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once

  // Live Share: broadcast my open popups as "selections"
  useEffect(() => {
    live.sendSelections(Array.from(openPopups));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openPopups]);

  // Live Share: broadcast option changes
  useEffect(() => {
    live.sendOptions({ includeDeps, layoutName, filter, fnMode });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeDeps, layoutName, filter, fnMode]);

  // (Optional) follow remote options (you can disable if you prefer independent views)
  useEffect(() => {
    const onOpts = (e: any) => {
      const d = e.detail || {};
      if (typeof d.filter === 'string') setFilter(d.filter);
      if (typeof d.includeDeps === 'boolean') setIncludeDeps(d.includeDeps);
      if (typeof d.layoutName === 'string') setLayoutName(d.layoutName);
      if (typeof d.fnMode === 'boolean') setFnMode(d.fnMode);
    };
    const onUpdated = () => {
      // Show toast or re-fetch project list/data if desired
      // console.info('Project was updated by a collaborator');
    };
    window.addEventListener('project:options', onOpts);
    window.addEventListener('project:updated', onUpdated);
    return () => {
      window.removeEventListener('project:options', onOpts);
      window.removeEventListener('project:updated', onUpdated);
    };
  }, []);

  // Minimal escape for attribute selector values (quotes + backslashes)
  const escAttr = (s: string) => s.replace(/["\\]/g, '\\$&');

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <h1 style={{ margin: 0 }}>Code Graph Explorer</h1>
      <p style={{ margin: 0, color: '#555' }}>
        Upload a <code>.zip</code>. Visualizes <b>.c</b>, <b>.py</b>, <b>.html</b>, <b>.css</b>, <b>.js/ts</b>.{' '}
        Tree: click files to show/hide nodes. Graph: click nodes to open code popups.{' '}
        <b>Fn links</b> connects function calls ↔ defs (code) and CSS selectors ↔ HTML uses (styles).
      </p>

      {/* Project save/load/share bar */}
      <ProjectBar
        current={{
          files,
          options: { includeDeps, layoutName, filter, fnMode },
        }}
        onLoad={({ files: f, options: o }) => {
          setFiles(f || []);
          setIncludeDeps(!!o?.includeDeps);
          setLayoutName(o?.layoutName || 'cose');
          setFilter(o?.filter || '');
          setFnMode(!!o?.fnMode);
          // also reset UI state derived from files
          setHiddenFiles(new Set());
          setOpenPopups(new Set());
          const tops = new Set<string>(['__root__']);
          (f || []).forEach(file => {
            const first = file.dir.split('/').filter(Boolean)[0];
            if (first) tops.add(first);
          });
          setOpenFolders(tops);
          // refit graph after load
          setTimeout(() => graphRef.current?.fit(), 0);
        }}
        // Live Share: tell page which project id is active (for ws auth room)
        onActiveChange={(id) => setActiveProjectId(id)}
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <ZipDrop onLoaded={onZipLoaded} />
        <Controls
          treeCollapsed={treeCollapsed}
          onToggleTree={() => setTreeCollapsed(s => !s)}
          includeDeps={includeDeps}
          setIncludeDeps={setIncludeDeps}
          layoutName={layoutName}
          setLayoutName={setLayoutName}
          filter={filter}
          setFilter={setFilter}
          onFit={() => graphRef.current?.fit()}
          fnMode={fnMode}
          setFnMode={setFnMode}
        />
      </div>

      <div
        style={{
          display: 'grid',
          gap: 12,
          gridTemplateColumns: `${treeCollapsed ? '0px' : 'minmax(240px, 340px)'} 1fr`,
          alignItems: 'stretch',
          transition: 'grid-template-columns 160ms ease',
        }}
      >
        {/* Tree */}
        <div
          style={{
            border: '1px solid #E5E7EB',
            borderRadius: 12,
            background: '#fff',
            padding: treeCollapsed ? 0 : 8,
            minHeight: 420,
            maxHeight: '68vh',
            overflow: 'auto',
            opacity: treeCollapsed ? 0 : 1,
            pointerEvents: treeCollapsed ? 'none' : 'auto',
            transition: 'opacity 160ms ease, padding 160ms ease',
          }}
        >
          {!treeCollapsed && (
            <>
              <div style={{ padding: '8px 8px 4px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>Project Tree</div>
                <div style={{ color: '#64748B', fontSize: 12 }}>
                  {files.length} files · {humanBytes(totalBytes)}
                </div>
              </div>
              <TreeView
                node={filteredTree}
                openFolders={openFolders}
                onToggleFolder={toggleFolder}
                onToggleFile={toggleFileVisibility}
                hiddenFiles={hiddenFiles}
              />
            </>
          )}
        </div>

        {/* Graph + popups */}
        <div
          ref={overlayRef}
          style={{
            position: 'relative',
            height: '68vh',
            minHeight: 420,
            border: '1px solid #E5E7EB',
            borderRadius: 12,
            background: '#fff',
            overflow: 'hidden',
          }}
        >
          {/* Live presence chips */}
          <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 6, zIndex: 20 }}>
            {Array.from(live.peers.values()).map(p => (
              <div key={p.id} title={p.name || p.id}
                style={{
                  padding: '4px 8px',
                  borderRadius: 999,
                  background: '#F1F5F9',
                  border: '1px solid #CBD5E1',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}>
                <span style={{ width: 10, height: 10, borderRadius: 999, background: p.color || '#94A3B8' }} />
                <span style={{ fontSize: 12 }}>{p.name || 'Guest'}</span>
              </div>
            ))}
          </div>

          <Graph
            ref={graphRef}
            elements={elements}
            layoutName={layoutName}
            hiddenFiles={hiddenFiles}
            openPopups={openPopups}
            onTogglePopup={handleTogglePopup}
            onPositions={setPopupPositions}
            // Live Share: combine all remote selections
            remoteSelectedIds={Array.from(
              new Set([].concat(...Array.from(live.remoteSelections.values())))
            ) as string[]}
          />

          {/* Popup-to-popup links (Fn mode) */}
          {fnMode && (
            <svg
              // depend on decorationVersion so we recompute right after popups decorate
              key={decorationVersion}
              width="100%"
              height="100%"
              style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10 }}
            >
              {(() => {
                const container = overlayRef.current;
                if (!container) return null;

                const crect = container.getBoundingClientRect();
                const toLocalPoint = (rect: DOMRect) => ({
                  x: rect.left + rect.width / 2 - crect.left,
                  y: rect.top + rect.height / 2 - crect.top,
                });

                // map file path -> ext (lowercased)
                const pathToExt = new Map(files.map(f => [f.path, (f.ext || '').toLowerCase()]));
                const extIs = (filePath: string, kinds: string[]) => {
                  const e = (pathToExt.get(filePath) || '').toLowerCase();
                  if (['js','mjs','cjs','jsx','ts','tsx'].includes(e)) return kinds.includes('js');
                  if (['html','htm'].includes(e)) return kinds.includes('html');
                  return kinds.includes(e);
                };

                const contextAround = (el: HTMLElement) => {
                  const prev = (el.previousSibling?.textContent ?? '').slice(-120);
                  const self = el.textContent ?? '';
                  const next = (el.nextSibling?.textContent ?? '').slice(0, 120);
                  const rightSib = ((el.nextElementSibling as HTMLElement | null)?.textContent ?? '').slice(0, 120);
                  const win  = prev + self + next;
                  return { prev, self, next, rightSib, win };
                };

                // Prefer:
                // - CALLER: JS/PY/C -> "name("; HTML -> within class/id attribute
                // - DECL:   PY       -> "def name("; CSS  -> selector token preceded by '.' or '#'
                // Avoid Python import lines.
                const escAttr = (s: string) => s.replace(/["\\]/g, '\\$&');
                const pickAnchor = (filePath: string, fnName: string, kind: 'caller' | 'decl') => {
                  const popup = container.querySelector(
                    `[data-popup-file="${escAttr(filePath)}"]`
                  ) as HTMLElement | null;
                  if (!popup) return null;

                  const hits = Array.from(
                    popup.querySelectorAll<HTMLElement>(`.fn-hit[data-fn="${escAttr(fnName)}"]`)
                  );
                  if (!hits.length) return null;

                  if (kind === 'caller') {
                    if (extIs(filePath, ['html'])) {
                      const htmlCall = hits.find(el => {
                        const { prev, win } = contextAround(el);
                        const inClass = /class\s*=\s*["'][^"']*\b$/.test(prev) || /\bclass\s*=\s*["'][^"']*\b/.test(win);
                        const inId    = /\bid\s*=\s*["'][^"']*\b$/.test(prev) || /\bid\s*=\s*["'][^"']*\b/.test(win);
                        return inClass || inId;
                      });
                      if (htmlCall) return toLocalPoint(htmlCall.getBoundingClientRect());
                    }
                    // Generic function call like name(
                    const call = hits.find(el => {
                      const { next, rightSib } = contextAround(el);
                      const right = (next + rightSib).slice(0, 16);
                      return /\s*\(/.test(right);
                    });
                    if (call) return toLocalPoint(call.getBoundingClientRect());
                    // Avoid Python import lines
                    const nonImport = hits.find(el =>
                      !/(?:^|\n|\r)\s*(?:from\s+\S+\s+import\s+|import\s+)/.test((el.previousSibling?.textContent ?? ''))
                    );
                    if (nonImport) return toLocalPoint(nonImport.getBoundingClientRect());
                    return toLocalPoint(hits[0].getBoundingClientRect());
                  }

                  if (kind === 'decl') {
                    if (extIs(filePath, ['py'])) {
                      const def = hits.find(el =>
                        /(^|\s)def\s+$/.test((el.previousSibling?.textContent ?? '')) ||
                        /^\s*def\s+\w+\s*\(/.test(((el.previousSibling?.textContent ?? '') + (el.textContent ?? '') + (el.nextSibling?.textContent ?? '')))
                      );
                      if (def) return toLocalPoint(def.getBoundingClientRect());
                    }
                    if (extIs(filePath, ['css'])) {
                      const cssDef = hits.find(el => /[.#]\s*$/.test((el.previousSibling?.textContent ?? '').slice(-2)));
                      if (cssDef) return toLocalPoint(cssDef.getBoundingClientRect());
                    }
                    return toLocalPoint(hits[0].getBoundingClientRect());
                  }

                  return null;
                };

                const lines: JSX.Element[] = [];
                const open = new Set(openPopups);

                // Draw FUNCTION edges (code: js/py/c)
                for (const [name, callers] of fnIndex.fn.callsByName) {
                  const decls = fnIndex.fn.declsByName.get(name);
                  if (!decls || decls.size === 0) continue;

                  const hue = fnHues[name] ?? 200;
                  const stroke = `hsla(${hue}, 70%, 35%, 0.95)`;

                  for (const src of callers) {
                    if (!open.has(src)) continue;
                    const s = pickAnchor(src, name, 'caller');
                    if (!s) continue;

                    for (const dst of decls) {
                      if (src === dst || !open.has(dst)) continue;
                      const dpt = pickAnchor(dst, name, 'decl');
                      if (!dpt) continue;

                      const cy = Math.min(s.y, dpt.y) - 40;
                      const d = `M ${s.x} ${s.y} C ${s.x} ${cy}, ${dpt.x} ${cy}, ${dpt.x} ${dpt.y}`;

                      lines.push(
                        <path
                          key={`fn-${name}-${src}->${dst}`}
                          d={d}
                          stroke={stroke}
                          strokeWidth={2}
                          vectorEffect="non-scaling-stroke"
                          fill="none"
                        />
                      );
                    }
                  }
                }

                // Draw STYLE edges (css ↔ html)
                for (const [name, callers] of fnIndex.style.callsByName) {
                  const decls = fnIndex.style.declsByName.get(name);
                  if (!decls || decls.size === 0) continue;

                  const hue = fnHues[name] ?? 200;
                  const stroke = `hsla(${hue}, 60%, 40%, 0.8)`;

                  for (const src of callers) {
                    if (!open.has(src)) continue;
                    const s = pickAnchor(src, name, 'caller');
                    if (!s) continue;

                    for (const dst of decls) {
                      if (src === dst || !open.has(dst)) continue;
                      const dpt = pickAnchor(dst, name, 'decl');
                      if (!dpt) continue;

                      const cy = Math.min(s.y, dpt.y) - 36;
                      const d = `M ${s.x} ${s.y} C ${s.x} ${cy}, ${dpt.x} ${cy}, ${dpt.x} ${dpt.y}`;

                      lines.push(
                        <path
                          key={`style-${name}-${src}->${dst}`}
                          d={d}
                          stroke={stroke}
                          strokeWidth={2}
                          vectorEffect="non-scaling-stroke"
                          fill="none"
                        />
                      );
                    }
                  }
                }

                return lines;
              })()}
            </svg>
          )}

          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            {Array.from(openPopups).map((id) => {
              const f = files.find(ff => ff.path === id);
              const pos = popupPositions[id];
              if (!f || !pos || hiddenFiles.has(id)) return null;
              const namesForFile = Array.from(fnIndex.fileToNames.get(f.path) ?? []);
              return (
                <CodePopup
                  key={id}
                  x={pos.x}
                  y={pos.y}
                  title={f.name}
                  path={f.path}
                  content={f.content}
                  ext={f.ext}
                  onClose={() => setOpenPopups(prev => { const next = new Set(prev); next.delete(id); return next; })}
                  fnMode={fnMode}
                  fnHues={fnHues}
                  namesForFile={namesForFile}
                  onDecorated={bumpDecoration}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
