'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { extToLang } from '../lib/utils';
import { highlightVSCodeHTML } from '../lib/highlight';
import type { SupportedType } from '../lib/types';

export function CodePopup({
  x, y, title, path, content, ext, onClose,
  fnMode,
  fnHues,
  namesForFile,
  onDecorated, // NEW: tell parent when anchors are ready
}: {
  x: number; y: number; title: string; path: string; content: string; ext: SupportedType; onClose: () => void;
  fnMode: boolean;
  fnHues: Record<string, number>;
  namesForFile: string[];
  onDecorated?: () => void;
}) {
  const [html, setHtml] = useState<string | null>(null);
  const codeRef = useRef<HTMLDivElement | null>(null);

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

  // Build the pattern once; we'll create two regexes from it (stateless test + global match)
  const namePattern = useMemo(() => {
    if (!fnMode || !namesForFile?.length) return null;
    const escaped = namesForFile
      .filter(Boolean)
      .map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (escaped.length === 0) return null;
    return `\\b(${escaped.join('|')})\\b`;
  }, [fnMode, namesForFile]);

  const nameReTest = useMemo(() => (namePattern ? new RegExp(namePattern) : null), [namePattern]);
  const nameReMatchGlobal = useMemo(() => (namePattern ? new RegExp(namePattern, 'g') : null), [namePattern]);

  // Write HTML into the ref *and* decorate it. React won't touch it again (no dangerouslySetInnerHTML).
  useEffect(() => {
    const root = codeRef.current;
    if (!root) return;

    // 1) Set the highlighted HTML (or a plaintext fallback) ourselves.
    if (html) {
      root.innerHTML = html;
    } else {
      // plaintext fallback
      root.textContent = content;
    }

    // 2) Decorate with .fn-hit anchors if in Fn mode
    if (!fnMode || !nameReTest || !nameReMatchGlobal) {
      // still notify so the parent can try drawing (e.g., CSS/HTML only)
      requestAnimationFrame(() => onDecorated?.());
      return;
    }

    // Walk text nodes and wrap matches
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const toProcess: Text[] = [];
    while (true) {
      const n = walker.nextNode() as Text | null;
      if (!n) break;
      const parent = (n as any)?.parentElement as HTMLElement | null;
      if (!parent) continue;
      // Only wrap inside code/pre rendered by Shiki
      if (!parent.closest('.shiki')) continue;
      const txt = n.textContent || '';
      // stateless test (no 'g' flag)
      if (nameReTest.test(txt)) toProcess.push(n);
    }

    for (const textNode of toProcess) {
      const txt = textNode.textContent || '';
      const frag = document.createDocumentFragment();
      let last = 0;

      // Use a fresh global regex per node (avoid cross-node lastIndex issues)
      const re = new RegExp(nameReMatchGlobal.source, 'g');

      for (const m of txt.matchAll(re)) {
        const start = m.index ?? 0;
        const before = txt.slice(last, start);
        if (before) frag.appendChild(document.createTextNode(before));

        const matchText = m[0];
        const name = m[1] ?? matchText;
        const hue = fnHues[name] ?? 200;

        const span = document.createElement('span');
        span.className = 'fn-hit';
        span.dataset.fn = name;
        // inline style so it's visible even if CSS fails
        span.style.backgroundColor = `hsla(${hue}, 90%, 70%, 0.35)`;
        span.style.outline = `1px solid hsla(${hue}, 70%, 35%, 0.85)`;
        span.style.borderRadius = '4px';
        span.style.padding = '0 2px';
        span.textContent = matchText;

        frag.appendChild(span);
        last = start + matchText.length;
      }
      const after = txt.slice(last);
      if (after) frag.appendChild(document.createTextNode(after));
      textNode.parentNode?.replaceChild(frag, textNode);
    }

    // 3) Let the parent know anchors exist so it can re-measure and draw lines immediately
    requestAnimationFrame(() => onDecorated?.());
  // IMPORTANT: include all inputs that change the rendered/annotated DOM
  }, [html, content, fnMode, nameReTest, nameReMatchGlobal, fnHues, onDecorated]);

  return (
    <div
      data-popup-file={path}
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
          background: '#0B1220',
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
            color: '#E5E7EB', background: '#1f2937', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
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
            style={{ marginLeft: 'auto', background: 'transparent', color: '#E5E7EB', border: 'none', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
            title="Close"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ maxHeight: 340, overflow: 'auto', background: 'transparent' }}>
          <style>{`
            .shiki code { counter-reset: shiki-line; }
            .shiki code .line {
              display: block;
              position: relative;
              padding-left: 3.2em;
              white-space: pre;
            }
            .shiki code .line::before {
              counter-increment: shiki-line;
              content: counter(shiki-line);
              position: absolute;
              left: 0;
              width: 2.6em;
              text-align: right;
              padding-right: 0.6em;
              color: #9CA3AF;
              opacity: 0.8;
              user-select: none;
            }
            .shiki { position: relative; }
            .shiki::before {
              content: '';
              position: absolute;
              top: 0; bottom: 0; left: 3.2em;
              width: 1px;
              background: rgba(148,163,184,0.25);
              pointer-events: none;
            }
            .shiki, .shiki code {
              font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace !important;
              font-size: 12px; line-height: 1.45;
            }
          `}</style>

          {/* We manage innerHTML ourselves in the effect to avoid React wiping decorations */}
          <div ref={codeRef} />
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
