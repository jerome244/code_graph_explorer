// /frontend/src/app/tools/code-graph/components/CodePopup.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { extToLang } from '../lib/utils';
import { highlightVSCodeHTML } from '../lib/highlight';
import type { SupportedType } from '../lib/types';

export function CodePopup({
  x, y, title, path, content, ext, onClose,
}: {
  x: number; y: number; title: string; path: string; content: string; ext: SupportedType; onClose: () => void;
}) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const lang = extToLang(ext);
        const out = await highlightVSCodeHTML(content, lang);
        if (!cancelled) setHtml(out);
      } catch (e) {
        console.error('Shiki highlight failed:', e);
        if (!cancelled) setHtml(null);
      }
    })();
    return () => { cancelled = true; };
  }, [content, ext]);

  return (
    <div
      style={{
        position: 'absolute',
        left: x, top: y,
        transform: 'translate(-50%, -100%) translateY(-8px)',
        maxWidth: 520, minWidth: 260,
        pointerEvents: 'auto',
        zIndex: 5,
      }}
    >
      <div
        style={{
          background: '#0B1220',
          color: '#E5E7EB',
          border: '1px solid #334155',
          borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
          overflow: 'hidden',
        }}
      >
        {/* Dark header (as before) */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '6px 10px', gap: 8, background: '#111827' }}>
          <span style={{
            fontSize: 11, padding: '2px 6px', borderRadius: 999, border: '1px solid #374151',
            color: '#E5E7EB', background: '#1f2937',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {title}
          </span>
          <span
            title={path}
            style={{ fontSize: 10, color: '#9CA3AF', marginLeft: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {path}
          </span>
          <button
            onClick={onClose}
            style={{
              marginLeft: 'auto', background: 'transparent', color: '#E5E7EB',
              border: 'none', cursor: 'pointer', fontSize: 16, lineHeight: 1,
            }}
            title="Close"
          >
            ×
          </button>
        </div>

        {/* Shiki HTML (VS Code Dark+) */}
        <div style={{ maxHeight: 320, overflow: 'auto' }}>
          {html ? (
            <div
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: html }}
            />
          ) : (
            <pre
              style={{
                margin: 0, padding: 12, maxHeight: 320, overflow: 'auto',
                fontSize: 12, lineHeight: 1.4, whiteSpace: 'pre',
                background: '#1e1e1e', color: '#d4d4d4',
              }}
            >
{content}
            </pre>
          )}
        </div>
      </div>

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
