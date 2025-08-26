// /frontend/src/app/tools/code-graph/components/Controls.tsx
'use client';

import React from 'react';

export function Controls({
  treeCollapsed,
  onToggleTree,
  includeDeps,
  setIncludeDeps,
  layoutName,
  setLayoutName,
  filter,
  setFilter,
  onFit,
  fnMode,
  setFnMode,
}: {
  treeCollapsed: boolean;
  onToggleTree: () => void;
  includeDeps: boolean;
  setIncludeDeps: (v: boolean) => void;
  layoutName: string;
  setLayoutName: (v: string) => void;
  filter: string;
  setFilter: (v: string) => void;
  onFit: () => void;
  fnMode: boolean;
  setFnMode: (v: boolean) => void;
}) {
  return (
    <div
      style={{
        border: '1px solid #E5E7EB',
        borderRadius: 12,
        padding: 16,
        background: '#fff',
        display: 'grid',
        gap: 8,
        alignItems: 'center',
        gridTemplateColumns: 'auto auto 1fr 1fr 1fr auto',
      }}
    >
      <button
        onClick={onToggleTree}
        title={treeCollapsed ? 'Expand tree' : 'Collapse tree'}
        style={{
          padding: '8px 12px',
          borderRadius: 8,
          border: '1px solid #CBD5E1',
          background: '#fff',
          cursor: 'pointer',
        }}
      >
        {treeCollapsed ? '▶' : '◀'} Tree
      </button>

      <button
        onClick={() => setFnMode(!fnMode)}
        title="Toggle function links and colorization"
        style={{
          padding: '8px 12px',
          borderRadius: 8,
          border: '1px solid #CBD5E1',
          background: fnMode ? '#DBEAFE' : '#fff',
          cursor: 'pointer',
          fontWeight: 600,
        }}
      >
        {fnMode ? 'Fn links: ON' : 'Fn links: OFF'}
      </button>

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
          placeholder="file or path…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ padding: 6, borderRadius: 8, border: '1px solid #CBD5E1', width: '100%' }}
        />
      </label>

      <button
        onClick={onFit}
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
  );
}
