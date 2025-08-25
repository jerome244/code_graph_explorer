'use client';

import React, { useMemo, useRef, useState } from 'react';
import type { ElementDefinition } from 'cytoscape';

import { ZipDrop } from './components/ZipDrop';
import { Controls } from './components/Controls';
import { TreeView } from './components/TreeView';
import { Graph, GraphHandle } from './components/Graph';
import { CodePopup } from './components/CodePopup';

import {
  buildElements,
  buildTree,
  filterTree,
  humanBytes,
} from './lib/utils';
import type { ParsedFile, TreeNode } from './lib/types';

export default function CodeGraphPage() {
  // Data
  const [files, setFiles] = useState<ParsedFile[]>([]);
  const [includeDeps, setIncludeDeps] = useState(true);
  const [layoutName, setLayoutName] = useState('cose');
  const [filter, setFilter] = useState('');
  const [treeCollapsed, setTreeCollapsed] = useState(false);

  // Tree/UI state
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set(['__root__']));
  const [hiddenFiles, setHiddenFiles] = useState<Set<string>>(new Set());

  // Popups state
  const [openPopups, setOpenPopups] = useState<Set<string>>(new Set()); // file paths
  const [popupPositions, setPopupPositions] =
    useState<Record<string, { x: number; y: number }>>({});

  const graphRef = useRef<GraphHandle>(null);

  // Derived
  const elements: ElementDefinition[] = useMemo(
    () => buildElements(files, includeDeps),
    [files, includeDeps]
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
      // also close popup for hidden node
      setOpenPopups(p => {
        const q = new Set(p);
        if (next.has(path)) q.delete(path);
        return q;
      });
      return next;
    });
  }

  // Popups
  function handleTogglePopup(path: string) {
    setOpenPopups(prev => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  }

  // After ZIP parsed
  function onZipLoaded(next: ParsedFile[]) {
    setFiles(next);
    setHiddenFiles(new Set());
    setOpenPopups(new Set());
    // open root & top-level
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
        Drop a <code>.zip</code> of your project (runs locally). We visualize{' '}
        <b>.c</b>, <b>.py</b>, <b>.html</b>, <b>.css</b>, <b>.js</b> as nodes.
        Left panel is a collapsible tree (click files to show/hide nodes).
        Click nodes to toggle code popups; multiple popups can stay open.
      </p>

      {/* Top controls */}
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
        />
      </div>

      {/* Tree + Graph */}
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
              <div
                style={{
                  padding: '8px 8px 4px 8px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                }}
              >
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

        {/* Graph + Popups overlay */}
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

          {/* Popups rendered above the canvas; follow nodes via positions */}
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            {Array.from(openPopups).map((id) => {
              const f = files.find(ff => ff.path === id);
              const pos = popupPositions[id];
              if (!f || !pos || hiddenFiles.has(id)) return null;
              return (
                <CodePopup
                key={id}
                x={pos.x}
                y={pos.y}
                title={f.name}
                path={f.path}
                content={f.content}
                ext={f.ext}
                onClose={() =>
                    setOpenPopups(prev => {
                    const next = new Set(prev);
                    next.delete(id);
                    return next;
                    })
                }
                />


              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
