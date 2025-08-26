// /frontend/src/app/tools/code-graph/components/CodePopup.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { extToLang } from '../lib/utils';
import { highlightVSCodeHTML } from '../lib/highlight';
import type { SupportedType } from '../lib/types';

export function CodePopup({
  x, y, title, path, content, ext, onClose,
}: {
  x: number; y: number; title: string; path: string; content: string; ext: SupportedType; onClose: () => void;
}) {
  const [html, setHtml] = useState<string | null>(null);

  const lineCount = useMemo(() => {
    // for optional future use; not shown in UI unless you want it
    return content.split('\n').length;
  }, [content]);

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
        maxWidth: 560, minWidth: 280,
        pointerEvents: 'auto',
        zIndex: 5,
      }}
    >
      <div
        style={{
          background: '#0B1220', // dark shell (as before)
          color: '#E5E7EB',
          border: '1px solid #334155',
          borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
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

        {/* Body */}
        <div style={{ maxHeight: 340, overflow: 'auto', background: 'transparent' }}>
          {/* VS Code-like line numbers via CSS counters on Shiki's .line spans */}
          <style>{`
            /* Ensure each line is its own block and add gutter */
            .shiki code { counter-reset: shiki-line; }
            .shiki code .line {
              display: block;
              position: relative;
              padding-left: 3.2em;       /* space for gutter */
              white-space: pre;           /* keep Shiki's spacing */
            }
            .shiki code .line::before {
              counter-increment: shiki-line;
              content: counter(shiki-line);
              position: absolute;
              left: 0;
              width: 2.6em;
              text-align: right;
              padding-right: 0.6em;
              color: #9CA3AF;            /* VSCode-ish gray */
              opacity: 0.8;
              user-select: none;
            }
            /* subtle gutter divider */
            .shiki {
              position: relative;
            }
            .shiki::before {
              content: '';
              position: absolute;
              top: 0;
              bottom: 0;
              left: 3.2em;               /* same as padding-left above */
              width: 1px;
              background: rgba(148,163,184,0.25); /* slate-400 @ ~25% */
              pointer-events: none;
            }
            /* Use a nice monospace stack */
            .shiki, .shiki code {
              font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace !important;
              font-size: 12px;
              line-height: 1.45;
            }
          `}</style>

          {html ? (
            <div
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: html }}
            />
          ) : (
            // Fallback while Shiki warms up
            <pre
              style={{
                margin: 0, padding: '8px 12px', maxHeight: 340, overflow: 'auto',
                background: '#1e1e1e', color: '#d4d4d4',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                fontSize: 12, lineHeight: 1.45,
              }}
            >
{content}
            </pre>
          )}
        </div>
      </div>

      {/* arrow */}
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
