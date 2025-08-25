'use client';

import React from 'react';

export function CodePopup({
  x, y, title, path, content, onClose,
}: {
  x: number; y: number; title: string; path: string; content: string; onClose: () => void;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        left: x, top: y,
        transform: 'translate(-50%, -100%) translateY(-8px)',
        maxWidth: 420, minWidth: 240,
        pointerEvents: 'auto',
        zIndex: 5,
      }}
    >
      <div
        style={{
          background: '#0B1220', color: '#E5E7EB',
          border: '1px solid #334155', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', padding: '6px 10px', gap: 8, background: '#111827' }}>
          <span style={{
            fontSize: 11, padding: '2px 6px', borderRadius: 999, border: '1px solid #374151', color: '#E5E7EB', background: '#1f2937',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {title}
          </span>
          <span title={path} style={{ fontSize: 10, color: '#9CA3AF', marginLeft: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {path}
          </span>
          <button
            onClick={onClose}
            style={{
              marginLeft: 'auto', background: 'transparent', color: '#E5E7EB', border: 'none', cursor: 'pointer',
              fontSize: 16, lineHeight: 1,
            }}
            title="Close"
          >
            ×
          </button>
        </div>
        <pre
          style={{
            margin: 0, padding: 12, maxHeight: 260, overflow: 'auto',
            fontSize: 12, lineHeight: 1.4, whiteSpace: 'pre',
          }}
        >
{content}
        </pre>
      </div>

      {/* tiny arrow */}
      <div
        style={{
          position: 'absolute', left: '50%', transform: 'translateX(-50%)',
          width: 0, height: 0, borderLeft: '8px solid transparent', borderRight: '8px solid transparent',
          borderTop: '8px solid #111827',
        }}
      />
    </div>
  );
}
