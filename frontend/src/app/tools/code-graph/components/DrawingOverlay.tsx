'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type ShapeId = string;

type RectShape = {
  id: ShapeId;
  kind: 'rect';
  x: number; y: number; w: number; h: number;
};

type TextShape = {
  id: ShapeId;
  kind: 'text';
  x: number; y: number; w: number; h: number;
  text: string;
};

type LineShape = {
  id: ShapeId;
  kind: 'line';
  x1: number; y1: number; x2: number; y2: number;
};

type Shape = RectShape | TextShape | LineShape;

type ContextMenu = { open: boolean; x: number; y: number; targetId?: string | null; scope: 'canvas' | 'shape' };

/** Small util */
const uid = () => Math.random().toString(36).slice(2, 9);

/**
 * Overlay that sits on top of the graph area, supports:
 * - right-click context menu
 * - add Text, Rectangle, Line
 * - move & resize
 */
export function DrawingOverlay() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [menu, setMenu] = useState<ContextMenu>({ open: false, x: 0, y: 0, targetId: null, scope: 'canvas' });
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [active, setActive] = useState<ShapeId | null>(null);

  type DragState =
    | { type: 'none' }
    | { type: 'move'; id: ShapeId; startX: number; startY: number; offx: number; offy: number }
    | { type: 'resize-rect'; id: ShapeId; startX: number; startY: number; edge: 'nw'|'ne'|'sw'|'se'; orig: RectShape }
    | { type: 'resize-text'; id: ShapeId; startX: number; startY: number; edge: 'nw'|'ne'|'sw'|'se'; orig: TextShape }
    | { type: 'drag-line-p1'; id: ShapeId; startX: number; startY: number, orig: LineShape }
    | { type: 'drag-line-p2'; id: ShapeId; startX: number; startY: number, orig: LineShape }
    | { type: 'move-line'; id: ShapeId; startX: number; startY: number; dx: number; dy: number; orig: LineShape };

  const [drag, setDrag] = useState<DragState>({ type: 'none' });

  // Hide context menu on any click elsewhere
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      // only close if clicking outside the small menu box
      const menuEl = document.getElementById('drawing-menu');
      if (menu.open && menuEl && !menuEl.contains(e.target as Node)) {
        setMenu({ open: false, x: 0, y: 0 });
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [menu.open]);
  // Open the canvas menu when right-click occurs anywhere in the graph area.
  useEffect(() => {
    const onCtx = (e: MouseEvent) => {
      const host = hostRef.current;
      if (!host) return;
      const rect = host.getBoundingClientRect();
      const inside = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
      if (!inside) return;
      // If a shape handled it, it already called preventDefault + stopPropagation.
      // Otherwise open the canvas menu.
      e.preventDefault();
      setMenu({ open: true, x: e.clientX - rect.left, y: e.clientY - rect.top, targetId: null, scope: 'canvas' });
    };
    document.addEventListener('contextmenu', onCtx);
    return () => document.removeEventListener('contextmenu', onCtx);
  }, []);


  const openMenuAt = useCallback((x: number, y: number) => {
    setMenu({ open: true, x, y, targetId: null, scope: 'canvas' });
  }, []);

  const addRect = useCallback((x: number, y: number) => {
    const el: RectShape = { id: uid(), kind: 'rect', x: x - 80, y: y - 50, w: 160, h: 100 };
    setShapes(s => [...s, el]);
    setActive(el.id);
  }, []);

  const addText = useCallback((x: number, y: number) => {
    const el: TextShape = { id: uid(), kind: 'text', x: x - 100, y: y - 50, w: 200, h: 100, text: 'Text' };
    setShapes(s => [...s, el]);
    setActive(el.id);
  }, []);

  const addLine = useCallback((x: number, y: number) => {
    const el: LineShape = { id: uid(), kind: 'line', x1: x - 60, y1: y, x2: x + 60, y2: y };
    setShapes(s => [...s, el]);
    setActive(el.id);
  }, []);

  // Pointer handlers for move/resize
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (drag.type === 'none') return;
      e.preventDefault();
      const host = hostRef.current;
      if (!host) return;
      const rect = host.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      setShapes(prev => {
        const nv = [...prev];
        const idx = nv.findIndex(s => 'id' in s && s.id === (drag as any).id);
        if (idx === -1) return prev;
        const s = nv[idx] as Shape;
        switch (drag.type) {
          case 'move': {
            const nx = x - drag.offx;
            const ny = y - drag.offy;
            if (s.kind === 'rect') nv[idx] = { ...s, x: nx, y: ny };
            if (s.kind === 'text') nv[idx] = { ...s, x: nx, y: ny };
            if (s.kind === 'line') {
              const dx = nx - (drag as any).startX; // not used
              const dy = ny - (drag as any).startY;
            }
            return nv;
          }
          case 'resize-rect': {
            const o = drag.orig;
            let nx = o.x, ny = o.y, nw = o.w, nh = o.h;
            if (drag.edge.includes('e')) nw = Math.max(20, o.w + (x - drag.startX));
            if (drag.edge.includes('s')) nh = Math.max(20, o.h + (y - drag.startY));
            if (drag.edge.includes('w')) { const d = x - drag.startX; nx = o.x + d; nw = Math.max(20, o.w - d); }
            if (drag.edge.includes('n')) { const d = y - drag.startY; ny = o.y + d; nh = Math.max(20, o.h - d); }
            nv[idx] = { ...o, x: nx, y: ny, w: nw, h: nh };
            return nv;
          }
          case 'resize-text': {
            const o = drag.orig;
            let nx = o.x, ny = o.y, nw = o.w, nh = o.h;
            if (drag.edge.includes('e')) nw = Math.max(80, o.w + (x - drag.startX));
            if (drag.edge.includes('s')) nh = Math.max(40, o.h + (y - drag.startY));
            if (drag.edge.includes('w')) { const d = x - drag.startX; nx = o.x + d; nw = Math.max(80, o.w - d); }
            if (drag.edge.includes('n')) { const d = y - drag.startY; ny = o.y + d; nh = Math.max(40, o.h - d); }
            nv[idx] = { ...o, x: nx, y: ny, w: nw, h: nh };
            return nv;
          }
          case 'drag-line-p1': {
            const o = drag.orig;
            nv[idx] = { ...o, x1: x, y1: y };
            return nv;
          }
          case 'drag-line-p2': {
            const o = drag.orig;
            nv[idx] = { ...o, x2: x, y2: y };
            return nv;
          }
          case 'move-line': {
            const o = drag.orig;
            const dx = x - drag.startX;
            const dy = y - drag.startY;
            nv[idx] = { ...o, x1: o.x1 + dx, y1: o.y1 + dy, x2: o.x2 + dx, y2: o.y2 + dy };
            return nv;
          }
        }
        return prev;
      });
    };

    const onUp = () => setDrag({ type: 'none' });

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [drag]);

  // Context menu handler on host
  const onHostContextMenu: React.MouseEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    openMenuAt(e.clientX - rect.left, e.clientY - rect.top);
  };

  // Menu actions
  const onChoose = (choice: 'text'|'rect'|'rectangle'|'line'|'delete') => {
    const { x, y } = menu;
    setMenu({ open: false, x: 0, y: 0 });
    if (choice === 'text') addText(x, y);
    if (choice === 'rect' || choice === 'rectangle') addRect(x, y);
    if (choice === 'line') addLine(x, y);
    if (choice === 'delete' && menu.targetId) setShapes(s => s.filter(sh => sh.id !== menu.targetId));
  };

  // Helpers to start dragging
  const startMove = (s: Shape, mx: number, my: number) => {
    setActive(s.id);
    setDrag({ type: 'move', id: s.id, startX: mx, startY: my, offx: mx - ('x' in s ? (s as any).x : (s as any).x1), offy: my - ('y' in s ? (s as any).y : (s as any).y1) });
  };

  const shapeEls = useMemo(() => {
    const els: JSX.Element[] = [];

    // RECT & TEXT (div-based)
    for (const s of shapes) {
      if (s.kind === 'rect' || s.kind === 'text') {
        const isActive = active === s.id;
        const baseStyle: React.CSSProperties = {
          position: 'absolute',
          left: s.x, top: s.y, width: s.w, height: s.h,
          border: '1px solid ' + (s.kind === 'rect' ? '#111827' : '#6366F1'),
          background: s.kind === 'rect' ? '#ffffff' : 'rgba(99,102,241,0.08)',
          borderRadius: 6,
          boxShadow: isActive ? '0 0 0 2px rgba(99,102,241,0.35)' : undefined,
          cursor: 'move',
          userSelect: 'none', pointerEvents: 'auto',
        };

        els.push(
          <div
            key={s.id}
            style={baseStyle}
            onMouseDown={(e) => {
              const host = hostRef.current!;
              const r = host.getBoundingClientRect();
              const mx = e.clientX - r.left;
              const my = e.clientY - r.top;
              startMove(s, mx, my);
            }}
              onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); const host = hostRef.current!; const r = host.getBoundingClientRect(); const mx = e.clientX - r.left; const my = e.clientY - r.top; setMenu({ open: true, x: mx, y: my, targetId: s.id, scope: 'shape' }); }}
            onClick={() => setActive(s.id)}
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); const host = hostRef.current!; const r = host.getBoundingClientRect(); const mx = e.clientX - r.left; const my = e.clientY - r.top; setMenu({ open: true, x: mx, y: my, targetId: s.id, scope: 'shape' }); }}
          >
            {s.kind === 'text' ? (
              <div
                contentEditable
                suppressContentEditableWarning
                style={{
                  width: '100%', height: '100%', outline: 'none',
                  padding: 8, fontSize: 13, color: '#111827', overflow: 'auto',
                }}
                onInput={(e) => {
                  const val = (e.currentTarget.textContent || '').slice(0, 2000);
                  setShapes(prev => prev.map(p => p.id === s.id ? { ...(p as TextShape), text: val } : p));
                }}
                onDoubleClick={(e) => e.stopPropagation()}
              >
                {(s as TextShape).text}
              </div>
            ) : null}

            {/* Resize handles (corners) */}
            {['nw','ne','sw','se'].map(edge => (
              <div
                key={edge}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  const host = hostRef.current!;
                  const r = host.getBoundingClientRect();
                  const mx = e.clientX - r.left;
                  const my = e.clientY - r.top;
                  if (s.kind === 'rect') setDrag({ type: 'resize-rect', id: s.id, startX: mx, startY: my, edge: edge as any, orig: { ...(s as RectShape) } });
                  else setDrag({ type: 'resize-text', id: s.id, startX: mx, startY: my, edge: edge as any, orig: { ...(s as TextShape) } });
                }}
                style={{
                  position: 'absolute',
                  width: 10, height: 10,
                  background: '#111827',
                  borderRadius: 2,
                  cursor:
                    edge === 'nw' ? 'nwse-resize' :
                    edge === 'ne' ? 'nesw-resize' :
                    edge === 'sw' ? 'nesw-resize' : 'nwse-resize',
                  left: edge.includes('w') ? -5 : undefined,
                  right: edge.includes('e') ? -5 : undefined,
                  top: edge.includes('n') ? -5 : undefined,
                  bottom: edge.includes('s') ? -5 : undefined,
                }}
              />
            ))}
          </div>
        );
      }
    }

    // LINEs (SVG overlay)
    const lineShapes = shapes.filter(s => s.kind === 'line') as LineShape[];
    if (lineShapes.length > 0) {
      els.push(
        <svg key="lines" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          {lineShapes.map(s => (
            <g key={s.id}>
              <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke="#0f172a" strokeWidth={2} />
            </g>
          ))}
        </svg>
      );
      // Draggables for lines (needs pointer events)
      for (const s of lineShapes) {
        const isActive = active === s.id;
        els.push(
          <>
            {/* Endpoints */}
            <div
              key={s.id + '-p1'}
              style={{ position: 'absolute', left: s.x1 - 6, top: s.y1 - 6, width: 12, height: 12, pointerEvents: 'auto',
                       borderRadius: 999, background: '#0f172a', cursor: 'grab' }}
              onMouseDown={(e) => {
                const host = hostRef.current!;
                const r = host.getBoundingClientRect();
                const mx = e.clientX - r.left;
                const my = e.clientY - r.top;
                setActive(s.id);
                setDrag({ type: 'drag-line-p1', id: s.id, startX: mx, startY: my, orig: { ...s } });
              }}
              onClick={() => setActive(s.id)}
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); const host = hostRef.current!; const r = host.getBoundingClientRect(); const mx = e.clientX - r.left; const my = e.clientY - r.top; setMenu({ open: true, x: mx, y: my, targetId: s.id, scope: 'shape' }); }}
            />
            <div
              key={s.id + '-p2'}
              style={{ position: 'absolute', left: s.x2 - 6, top: s.y2 - 6, width: 12, height: 12, pointerEvents: 'auto',
                       borderRadius: 999, background: '#0f172a', cursor: 'grab' }}
              onMouseDown={(e) => {
                const host = hostRef.current!;
                const r = host.getBoundingClientRect();
                const mx = e.clientX - r.left;
                const my = e.clientY - r.top;
                setActive(s.id);
                setDrag({ type: 'drag-line-p2', id: s.id, startX: mx, startY: my, orig: { ...s } });
              }}
              onClick={() => setActive(s.id)}
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); const host = hostRef.current!; const r = host.getBoundingClientRect(); const mx = e.clientX - r.left; const my = e.clientY - r.top; setMenu({ open: true, x: mx, y: my, targetId: s.id, scope: 'shape' }); }}
            />
            {/* Mid handle to move whole line */}
            <div
              key={s.id + '-mid'}
              style={{ position: 'absolute', left: (s.x1 + s.x2)/2 - 7, top: (s.y1 + s.y2)/2 - 7, width: 14, height: 14, pointerEvents: 'auto',
                       borderRadius: 4, background: isActive ? '#22c55e' : '#64748b', cursor: 'move', opacity: 0.9 }}
              onMouseDown={(e) => {
                const host = hostRef.current!;
                const r = host.getBoundingClientRect();
                const mx = e.clientX - r.left;
                const my = e.clientY - r.top;
                setActive(s.id);
                setDrag({ type: 'move-line', id: s.id, startX: mx, startY: my, dx: 0, dy: 0, orig: { ...s } });
              }}
            />
          </>
        );
      }
    }

    return els;
  }, [shapes, active]);

  return (
    <div
      ref={hostRef}
      style={{ position: 'absolute', inset: 0, zIndex: 15, pointerEvents: 'none' }}
      onContextMenu={onHostContextMenu}
    >
      {/* Context menu */}
      {menu.open && (
        <div
          id="drawing-menu"
          style={{ pointerEvents: 'auto',
            position: 'absolute', left: menu.x, top: menu.y, transform: 'translateY(-100%)',
            display: 'grid', background: '#111827', color: '#F9FAFB', border: '1px solid #374151',
            borderRadius: 8, overflow: 'hidden', minWidth: 150, zIndex: 50
          }}
        >
          {(menu.scope === 'canvas' ? ['Text','Rectangle','Line'] : ['Delete']).map(label => (
            <button
              key={label}
              onClick={() => onChoose(label.toLowerCase() as any)}
              style={{
                all: 'unset',
                padding: '8px 12px',
                cursor: 'pointer',
                borderBottom: '1px solid #374151',
              }}
            >
              {label}
            </button>
          ))}
          <div style={{ height: 1, background: '#374151' }} />
          <button
            onClick={() => setMenu({ open: false, x: 0, y: 0 })}
            style={{ all: 'unset', padding: '8px 12px', cursor: 'pointer' }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Shapes */}
      {shapeEls}
    </div>
  );
}
