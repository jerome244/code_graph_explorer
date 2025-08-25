'use client';

import React from 'react';
import type { TreeNode } from '../lib/types';
import { extBadgeBg } from '../lib/utils';

export function TreeView({
  node,
  openFolders,
  onToggleFolder,
  onToggleFile,
  hiddenFiles,
}: {
  node: TreeNode;
  openFolders: Set<string>;
  onToggleFolder: (id: string) => void;
  onToggleFile: (path: string) => void;
  hiddenFiles: Set<string>;
}) {
  if (node.type === 'folder' && node.id === '__root__') {
    return (
      <div style={{ padding: '4px 4px 8px 4px' }}>
        {node.children.length === 0 ? (
          <div style={{ color: '#64748B', padding: '6px 8px' }}>
            Upload a ZIP to see files.
          </div>
        ) : (
          node.children.map(ch => (
            <TreeItem
              key={ch.id}
              node={ch}
              openFolders={openFolders}
              onToggleFolder={onToggleFolder}
              onToggleFile={onToggleFile}
              hiddenFiles={hiddenFiles}
              depth={0}
            />
          ))
        )}
      </div>
    );
  }
  return (
    <TreeItem
      node={node}
      openFolders={openFolders}
      onToggleFolder={onToggleFolder}
      onToggleFile={onToggleFile}
      hiddenFiles={hiddenFiles}
      depth={0}
    />
  );
}

function TreeItem({
  node,
  openFolders,
  onToggleFolder,
  onToggleFile,
  hiddenFiles,
  depth,
}: {
  node: TreeNode;
  openFolders: Set<string>;
  onToggleFolder: (id: string) => void;
  onToggleFile: (path: string) => void;
  hiddenFiles: Set<string>;
  depth: number;
}) {
  const pad = 8 + depth * 16;

  if (node.type === 'folder') {
    const isOpen = openFolders.has(node.id);
    return (
      <div>
        <div
          onClick={() => onToggleFolder(node.id)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 6px',
            paddingLeft: pad,
            cursor: 'pointer',
            userSelect: 'none',
            borderRadius: 6,
          }}
        >
          <span style={{ width: 12, display: 'inline-flex', justifyContent: 'center' }}>
            {isOpen ? '▾' : '▸'}
          </span>
          <span role="img" aria-label="folder">📁</span>
          <span style={{ fontWeight: 600 }}>{node.name}</span>
          <span style={{ marginLeft: 6, color: '#6b7280', fontSize: 12 }}>· {node.count}</span>
        </div>
        {isOpen &&
          node.children.map(ch => (
            <TreeItem
              key={ch.id}
              node={ch}
              openFolders={openFolders}
              onToggleFolder={onToggleFolder}
              onToggleFile={onToggleFile}
              hiddenFiles={hiddenFiles}
              depth={depth + 1}
            />
          ))}
      </div>
    );
  }

  const hidden = hiddenFiles.has(node.path);
  return (
    <div
      onClick={() => onToggleFile(node.path)}
      title={`${hidden ? 'Show' : 'Hide'}: ${node.path}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 6px',
        paddingLeft: pad + 16,
        cursor: 'pointer',
        borderRadius: 6,
        background: hidden ? undefined : '#F8FAFF',
        opacity: hidden ? 0.5 : 1,
        border: hidden ? '1px dashed #E5E7EB' : '1px solid #E5E7EB',
      }}
    >
      <span role="img" aria-label="file">📄</span>
      <span style={{ fontSize: 13, textDecoration: hidden ? 'line-through' : 'none' }}>
        {node.name}
      </span>
      {'ext' in node && (
        <span
          style={{
            marginLeft: 'auto',
            fontSize: 10,
            fontWeight: 700,
            padding: '0px 6px',
            borderRadius: 999,
            border: '1px solid #E5E7EB',
            background: extBadgeBg(node.ext),
          }}
        >
          {node.ext.toUpperCase()}
        </span>
      )}
    </div>
  );
}
