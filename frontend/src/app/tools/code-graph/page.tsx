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

  // NEW: function-mode toggle
  const [fnMode, setFnMode] = useState(false);

  const [popupPositions, setPopupPositions] = useState<Record<string, { x: number; y: number }>>({});
  const graphRef = useRef<GraphHandle>(null);

  // Derived
  const baseElements: ElementDefinition[] = useMemo(
    () => buildElements(files, includeDeps),
    [files, includeDeps]
  );

  // Function index + hues
  const fnIndex = useMemo(() => buildFunctionIndex(files), [files]);
  const fnHues = useMemo(() => buildFnHueMap(fnIndex), [fnIndex]);

  // Keep graph edges to deps only; function links are drawn between popups instead.
  const elements: ElementDefinition[] = useMemo(
    () => baseElements,
    [baseElements]
  );

  const tree: TreeNode = useMemo(() => buildTree(files), [files]);
  const filteredTree: TreeNode = useMemo(
    () => filterTree(tree, filter) || { ...tree, children: [] },
    [tree, filter]
  );
  const totalBytes = useMemo(() => files.reduce((s, f) => s + f.size, 0), [files]);

  // Tree interactions
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

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <h1 style={{ margin: 0 }}>Code Graph Explorer</h1>
      <p style={{ margin: 0, color: '#555' }}>
        Upload a <code>.zip</code>. Visualizes <b>.c</b>, <b>.py</b>, <b>.html</b>, <b>.css</b>, <b>.js</b>.{' '}
        Tree: click files to show/hide nodes. Graph: click nodes to open code popups.{' '}
        Use <b>Fn links</b> to color functions and draw links <i>between open popups</i>.
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

          {/* Popup-to-popup function links (when Fn mode is ON) */}
          {fnMode && (
            <svg
              width="100%"
              height="100%"
              style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10 }}
            >
              {(() => {
                const lines: JSX.Element[] = [];
                const open = new Set(openPopups);
                const arrowOffset = 8; // CodePopup translates up by 8px
                for (const [name, callers] of fnIndex.callsByName) {
                  const decls = fnIndex.declsByName.get(name);
                  if (!decls || decls.size === 0) continue;
                  const hue = fnHues[name] ?? 200;
                  const stroke = `hsla(${hue}, 70%, 35%, 0.95)`;
                  for (const src of callers) {
                    if (!open.has(src)) continue;
                    const p1 = popupPositions[src];
                    if (!p1) continue;
                    for (const dst of decls) {
                      if (src === dst || !open.has(dst)) continue;
                      const p2 = popupPositions[dst];
                      if (!p2) continue;

                      const x1 = p1.x, y1 = p1.y - arrowOffset;
                      const x2 = p2.x, y2 = p2.y - arrowOffset;

                      // slight upward curve for readability
                      const cy = Math.min(y1, y2) - 40;
                      const d = `M ${x1} ${y1} C ${x1} ${cy}, ${x2} ${cy}, ${x2} ${y2}`;

                      lines.push(
                        <path
                          key={`pp-${name}-${src}->${dst}`}
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
