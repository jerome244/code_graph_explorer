// /frontend/src/app/tools/code-graph/page.tsx
'use client';

import React, { useMemo, useRef, useState } from 'react';
import type { ElementDefinition } from 'cytoscape';

import { ZipDrop } from './components/ZipDrop';
import { Controls } from './components/Controls';
import { TreeView } from './components/TreeView';
import { Graph, GraphHandle } from './components/Graph';
import { CodePopup } from './components/CodePopup';

import { buildElements, buildTree, filterTree, humanBytes } from './lib/utils';
import type { ParsedFile, TreeNode } from './lib/types';
import { buildFunctionIndex, buildFnHueMap } from './lib/functions';

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

  const [popupPositions, setPopupPositions] = useState<Record<string, { x: number; y: number }>>({});
  const graphRef = useRef<GraphHandle>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

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

  // Minimal escape for attribute selector values (quotes)
  const escAttr = (s: string) => s.replace(/["\\]/g, '\\$&');

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <h1 style={{ margin: 0 }}>Code Graph Explorer</h1>
      <p style={{ margin: 0, color: '#555' }}>
        Upload a <code>.zip</code>. Visualizes <b>.c</b>, <b>.py</b>, <b>.html</b>, <b>.css</b>, <b>.js/ts</b>.{' '}
        Tree: click files to show/hide nodes. Graph: click nodes to open code popups.{' '}
        <b>Fn links</b> connects function calls ↔ defs (code) and CSS selectors ↔ HTML uses (styles).
      </p>

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
          <Graph
            ref={graphRef}
            elements={elements}
            layoutName={layoutName}
            hiddenFiles={hiddenFiles}
            openPopups={openPopups}
            onTogglePopup={handleTogglePopup}
            onPositions={setPopupPositions}
          />

          {/* Popup-to-popup links (Fn mode) */}
          {fnMode && (
            <svg
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
                      const right = (next + rightSib).slice(0, 12);
                      return /\s*\(/.test(right);
                    });
                    if (call) return toLocalPoint(call.getBoundingClientRect());
                    // Avoid Python import lines
                    const nonImport = hits.find(el => !/(?:^|\n|\r)\s*(?:from\s+\S+\s+import|import\s+)/.test((el.previousSibling?.textContent ?? '')));
                    if (nonImport) return toLocalPoint(nonImport.getBoundingClientRect());
                    return toLocalPoint(hits[0].getBoundingClientRect());
                  }

                  if (kind === 'decl') {
                    if (extIs(filePath, ['py'])) {
                      const def = hits.find(el => /(^|\s)def\s+$/.test((el.previousSibling?.textContent ?? '')) ||
                        /^\s*def\s+\w+\s*\(/.test(((el.previousSibling?.textContent ?? '') + (el.textContent ?? '') + (el.nextSibling?.textContent ?? ''))));
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
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
