// app/graph/ShapeOverlay.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";

export type ShapeRect = {
  id: string;
  type: "rect";
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;   // translucent fill color source
  label: string;   // rect label
};
export type ShapeLine = { id: string; type: "line"; x1: number; y1: number; x2: number; y2: number };
export type Shape = ShapeRect | ShapeLine;

type DragState =
  | { id: string; kind: "rect"; dx: number; dy: number }
  | { id: string; kind: "rect-nw" | "rect-ne" | "rect-sw" | "rect-se"; ox: number; oy: number; ow: number; oh: number }
  | { id: string; kind: "line" | "p1" | "p2"; dx: number; dy: number };

const PALETTE = ["#FFFFFF", "#EF4444", "#F59E0B", "#10B981", "#3B82F6", "#8B5CF6", "#EC4899", "#6B7280", "#111827"];

function hexToRgba(hex: string, alpha: number) {
  const h = hex.replace("#", "");
  const to255 = (p: string) => parseInt(p, 16);
  if (h.length === 3) {
    const r = to255(h[0] + h[0]), g = to255(h[1] + h[1]), b = to255(h[2] + h[2]);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  if (h.length === 6) {
    const r = to255(h.slice(0, 2)), g = to255(h.slice(2, 4)), b = to255(h.slice(4, 6));
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return hex;
}

export default function ShapeOverlay({
  containerRef,
  shapes,
  onChange,
}: {
  containerRef: React.RefObject<HTMLDivElement>;
  shapes: Shape[];
  onChange: React.Dispatch<React.SetStateAction<Shape[]>>;
}) {
  const [createMenu, setCreateMenu] = useState<{ x: number; y: number } | null>(null);
  const [shapeMenu, setShapeMenu] = useState<{ x: number; y: number; id: string; type: "rect" | "line" } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Hold SHIFT to drag from inside the rect
  const [dragAnywhere, setDragAnywhere] = useState(false);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && t.closest("input,textarea,[contenteditable='true']")) return;
      if (e.key === "Shift") setDragAnywhere(true);
    };
    const up = (e: KeyboardEvent) => { if (e.key === "Shift") setDragAnywhere(false); };
    const blur = () => setDragAnywhere(false);
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    window.addEventListener("blur", blur, true);
    return () => {
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
      window.removeEventListener("blur", blur, true);
    };
  }, []);

  const dragRef = useRef<DragState | null>(null);

  // Double-click background → create menu
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const onDbl = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("[data-shape-id]") || el.closest("[data-label-editor]")) return;
      const r = root.getBoundingClientRect();
      setCreateMenu({ x: e.clientX - r.left, y: e.clientY - r.top });
      setShapeMenu(null);
      setEditingId(null);
      e.stopPropagation();
      e.preventDefault();
    };
    root.addEventListener("dblclick", onDbl, true);
    return () => root.removeEventListener("dblclick", onDbl, true);
  }, [containerRef]);

  // Commit editor safely
  const setRectLabel = (id: string, label: string) => {
    const cleaned = label.replace(/\s+$/g, "");
    onChange((cur) => cur.map((s) => (s.id === id && s.type === "rect" ? { ...s, label: cleaned } : s)));
  };
  const commitEditorIfOpen = () => {
    if (!editingId) return;
    const el = document.querySelector<HTMLDivElement>('[data-label-editor] [contenteditable="true"]');
    const text = el?.textContent ?? "";
    setRectLabel(editingId, text);
    setEditingId(null);
  };

  // Close menus and (now) commit label on outside click
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      const inside =
        el.closest("[data-create-menu]") ||
        el.closest("[data-shape-menu]") ||
        el.closest("[data-label-editor]");
      if (!inside) {
        setCreateMenu(null);
        setShapeMenu(null);
        // commit label before closing editor
        commitEditorIfOpen();
      }
    };
    window.addEventListener("mousedown", onDown, true);
    return () => window.removeEventListener("mousedown", onDown, true);
  }, [editingId]);

  // Global drag move/up
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      onChange((cur) =>
        cur.map((s) => {
          if (s.id !== d.id) return s;
          if (s.type === "rect") {
            if (d.kind === "rect") return { ...s, x: e.clientX - d.dx, y: e.clientY - d.dy };
            const minW = 40, minH = 30;
            const dx = e.clientX - d.ox, dy = e.clientY - d.oy;
            if (d.kind === "rect-se") return { ...s, w: Math.max(minW, d.ow + dx), h: Math.max(minH, d.oh + dy) };
            if (d.kind === "rect-ne") {
              const h = Math.max(minH, d.oh - dy), y = s.y + (s.h - h);
              const w = Math.max(minW, d.ow + dx);
              return { ...s, y, w, h };
            }
            if (d.kind === "rect-sw") {
              const w = Math.max(minW, d.ow - dx), x = s.x + (s.w - w);
              const h = Math.max(minH, d.oh + dy);
              return { ...s, x, w, h };
            }
            if (d.kind === "rect-nw") {
              const w = Math.max(minW, d.ow - dx), h = Math.max(minH, d.oh - dy);
              const x = s.x + (s.w - w), y = s.y + (s.h - h);
              return { ...s, x, y, w, h };
            }
          }
          if (s.type === "line") {
            if (d.kind === "line") {
              const nx1 = e.clientX - d.dx, ny1 = e.clientY - d.dy;
              const dx = nx1 - s.x1, dy = ny1 - s.y1;
              return { ...s, x1: nx1, y1: ny1, x2: s.x2 + dx, y2: s.y2 + dy };
            }
            if (d.kind === "p1") return { ...s, x1: e.clientX - d.dx, y1: e.clientY - d.dy };
            if (d.kind === "p2") return { ...s, x2: e.clientX - d.dx, y2: e.clientY - d.dy };
          }
          return s;
        })
      );
      e.preventDefault();
    };
    const onUp = () => (dragRef.current = null);
    window.addEventListener("mousemove", onMove, true);
    window.addEventListener("mouseup", onUp, true);
    return () => {
      window.removeEventListener("mousemove", onMove, true);
      window.removeEventListener("mouseup", onUp, true);
    };
  }, [onChange]);

  // Mutators
  const addRect = (x: number, y: number) => {
    const id = "rect-" + Math.random().toString(36).slice(2, 9);
    onChange((cur) => [
      ...cur,
      { id, type: "rect", x: Math.max(8, x - 60), y: Math.max(8, y - 40), w: 200, h: 120, color: "#ffffff", label: "" },
    ]);
    setCreateMenu(null);
  };
  const addLine = (x: number, y: number) => {
    const id = "line-" + Math.random().toString(36).slice(2, 9);
    onChange((cur) => [...cur, { id, type: "line", x1: x - 70, y1: y - 40, x2: x + 70, y2: y + 40 }]);
    setCreateMenu(null);
  };
  const removeShape = (id: string) => {
    onChange((cur) => cur.filter((s) => s.id !== id));
    setShapeMenu(null);
    if (editingId === id) setEditingId(null);
  };
  const setRectColor = (id: string, color: string) => {
    onChange((cur) => cur.map((s) => (s.id === id && s.type === "rect" ? { ...s, color } : s)));
    setShapeMenu(null);
  };
  const openShapeMenuAtEvent = (e: React.MouseEvent, id: string, type: "rect" | "line") => {
    e.preventDefault();
    e.stopPropagation();
    const root = containerRef.current;
    if (!root) return;
    const r = root.getBoundingClientRect();
    setCreateMenu(null);
    setShapeMenu({ x: e.clientX - r.left, y: e.clientY - r.top, id, type });
  };

  const rectById = (id: string) => shapes.find((s) => s.id === id && s.type === "rect") as ShapeRect | undefined;

  return (
    <>
      {/* Create menu */}
      {createMenu && (
        <div
          style={{
            position: "absolute",
            left: createMenu.x,
            top: createMenu.y,
            transform: "translate(-50%, -110%)",
            zIndex: 60,
            background: "white",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            boxShadow: "0 10px 25px rgba(0,0,0,.08)",
            padding: 8,
            display: "flex",
            gap: 8,
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
          data-create-menu
        >
          <button onClick={() => addRect(createMenu.x, createMenu.y)} style={{ border: "1px solid #ddd", padding: "6px 10px", borderRadius: 6, fontSize: 12 }}>
            ▭ Rectangle
          </button>
          <button onClick={() => addLine(createMenu.x, createMenu.y)} style={{ border: "1px solid #ddd", padding: "6px 10px", borderRadius: 6, fontSize: 12 }}>
            ／ Line
          </button>
          <button onClick={() => setCreateMenu(null)} style={{ border: "1px solid #ddd", padding: "6px 10px", borderRadius: 6, fontSize: 12 }}>
            ✕
          </button>
        </div>
      )}

      {/* Right-click menu */}
      {shapeMenu && (
        <div
          style={{
            position: "absolute",
            left: shapeMenu.x,
            top: shapeMenu.y,
            transform: "translate(-50%, -110%)",
            zIndex: 61,
            background: "white",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            boxShadow: "0 10px 25px rgba(0,0,0,.10)",
            padding: 8,
            display: "flex",
            alignItems: "center",
            gap: 10,
            whiteSpace: "nowrap",
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
          data-shape-menu
        >
          {shapeMenu.type === "rect" && (
            <>
              <span style={{ fontSize: 12, color: "#374151", marginRight: 2 }}>Color:</span>
              <div style={{ display: "flex", gap: 6 }}>
                {PALETTE.map((c) => (
                  <button
                    key={c}
                    title={c}
                    onClick={() => setRectColor(shapeMenu.id, c)}
                    style={{ width: 18, height: 18, borderRadius: 4, border: "1px solid #d1d5db", background: c, cursor: "pointer" }}
                  />
                ))}
              </div>
              <div style={{ width: 10 }} />
            </>
          )}
          <button onClick={() => removeShape(shapeMenu.id)} style={{ border: "1px solid #ef4444", color: "#ef4444", padding: "6px 10px", borderRadius: 6, fontSize: 12 }}>
            Delete
          </button>
          <button onClick={() => setShapeMenu(null)} style={{ border: "1px solid #ddd", padding: "6px 10px", borderRadius: 6, fontSize: 12 }}>
            ✕
          </button>
        </div>
      )}

      {/* Floating label editor (double-click border to open) */}
      {editingId && (() => {
        const r = rectById(editingId);
        if (!r) return null;
        return (
          <div
            data-label-editor
            style={{
              position: "absolute",
              left: r.x + 8,
              top: r.y + 8,
              minWidth: 120,
              maxWidth: Math.max(160, r.w - 16),
              zIndex: 62,
              background: "white",
              border: "1px solid #e5e7eb",
              borderRadius: 6,
              boxShadow: "0 8px 18px rgba(0,0,0,.08)",
              padding: 6,
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div
              contentEditable
              suppressContentEditableWarning
              spellCheck={false}
              style={{ outline: "none", fontSize: 13, lineHeight: 1.35, minHeight: 18, maxHeight: 180, overflow: "auto" }}
              onBlur={(e) => {
                setRectLabel(r.id, e.currentTarget.textContent ?? "");
                setEditingId(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape" || (e.key === "Enter" && (e.ctrlKey || e.metaKey))) {
                  (e.currentTarget as HTMLDivElement).blur();
                }
              }}
            >
              {r.label || ""}
            </div>
          </div>
        );
      })()}

      {/* SHAPES layer (BELOW nodes) — wrapper doesn't eat clicks; only specific SVG parts are interactive */}
      <div style={{ position: "absolute", inset: 0, zIndex: 19, pointerEvents: "none" }}>
        {shapes.map((s) => {
          if (s.type === "rect") {
            const isWhite = s.color.toLowerCase() === "#ffffff" || s.color.toLowerCase() === "white";
            const borderColor = isWhite ? "#d1d5db" : s.color;
            const fill = hexToRgba(s.color, 0.12);
            const left = s.x - 12, top = s.y - 12, width = s.w + 24, height = s.h + 24;
            const handleSize = 10, hs = handleSize;
            const hx = (ox: number) => 12 + ox - hs / 2;
            const hy = (oy: number) => 12 + oy - hs / 2;

            return (
              <svg
                key={s.id}
                data-shape-id={s.id}
                data-kind="rect"
                // IMPORTANT: svg wrapper ignores pointer events so nodes remain clickable,
                // only child elements (ring/handles/fill when Shift) capture events.
                style={{ position: "absolute", left, top, width, height, overflow: "visible", pointerEvents: "none" }}
              >
                {/* FILL: pass-through unless Shift held */}
                <rect
                  x={12} y={12} width={s.w} height={s.h}
                  fill={fill} stroke="none"
                  pointerEvents={dragAnywhere ? "all" : "none"}
                  onMouseDown={(e) => {
                    if (!dragAnywhere) return;
                    dragRef.current = { id: s.id, kind: "rect", dx: e.clientX - s.x, dy: e.clientY - s.y };
                    e.stopPropagation();
                  }}
                  onContextMenu={(e) => {
                    if (!dragAnywhere) return;
                    openShapeMenuAtEvent(e, s.id, "rect");
                  }}
                  style={{ cursor: dragAnywhere ? "move" : "default" }}
                />

                {/* visible border */}
                <rect
                  x={12} y={12} width={s.w} height={s.h}
                  fill="none" stroke={borderColor} strokeWidth={2} strokeDasharray="6 4"
                  vectorEffect="non-scaling-stroke" pointerEvents="none"
                />

                {/* invisible, THICK hit ring over the border so any border point drags */}
                <rect
                  x={12} y={12} width={s.w} height={s.h}
                  fill="none" stroke="rgba(0,0,0,0)" strokeWidth={12}
                  vectorEffect="non-scaling-stroke" pointerEvents="stroke"
                  onMouseDown={(e) => {
                    dragRef.current = { id: s.id, kind: "rect", dx: e.clientX - s.x, dy: e.clientY - s.y };
                    e.stopPropagation();
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setEditingId(s.id);
                    setCreateMenu(null);
                    setShapeMenu(null);
                  }}
                  onContextMenu={(e) => openShapeMenuAtEvent(e, s.id, "rect")}
                  style={{ cursor: "move" }}
                />

                {/* resize handles */}
                <rect x={hx(0)}   y={hy(0)}   width={hs} height={hs} fill="#fff" stroke={borderColor} strokeWidth={2}
                  pointerEvents="all" style={{ cursor: "nwse-resize" }}
                  onMouseDown={(e) => { dragRef.current = { id: s.id, kind: "rect-nw", ox: e.clientX, oy: e.clientY, ow: s.w, oh: s.h }; e.stopPropagation(); }}
                  onContextMenu={(e) => openShapeMenuAtEvent(e, s.id, "rect")}
                />
                <rect x={hx(s.w)} y={hy(0)}   width={hs} height={hs} fill="#fff" stroke={borderColor} strokeWidth={2}
                  pointerEvents="all" style={{ cursor: "nesw-resize" }}
                  onMouseDown={(e) => { dragRef.current = { id: s.id, kind: "rect-ne", ox: e.clientX, oy: e.clientY, ow: s.w, oh: s.h }; e.stopPropagation(); }}
                  onContextMenu={(e) => openShapeMenuAtEvent(e, s.id, "rect")}
                />
                <rect x={hx(0)}   y={hy(s.h)} width={hs} height={hs} fill="#fff" stroke={borderColor} strokeWidth={2}
                  pointerEvents="all" style={{ cursor: "nesw-resize" }}
                  onMouseDown={(e) => { dragRef.current = { id: s.id, kind: "rect-sw", ox: e.clientX, oy: e.clientY, ow: s.w, oh: s.h }; e.stopPropagation(); }}
                  onContextMenu={(e) => openShapeMenuAtEvent(e, s.id, "rect")}
                />
                <rect x={hx(s.w)} y={hy(s.h)} width={hs} height={hs} fill="#fff" stroke={borderColor} strokeWidth={2}
                  pointerEvents="all" style={{ cursor: "nwse-resize" }}
                  onMouseDown={(e) => { dragRef.current = { id: s.id, kind: "rect-se", ox: e.clientX, oy: e.clientY, ow: s.w, oh: s.h }; e.stopPropagation(); }}
                  onContextMenu={(e) => openShapeMenuAtEvent(e, s.id, "rect")}
                />
              </svg>
            );
          }

          // ------- line -------
          const w = Math.abs(s.x2 - s.x1) + 24;
          const h = Math.abs(s.y2 - s.y1) + 24;
          const left = Math.min(s.x1, s.x2) - 12;
          const top = Math.min(s.y1, s.y2) - 12;
          const x1 = s.x1 - left, y1 = s.y1 - top, x2 = s.x2 - left, y2 = s.y2 - top;

          return (
            <svg
              key={s.id}
              data-shape-id={s.id}
              data-kind="line"
              // same trick: svg ignores pointer events; only stroke/handles are interactive
              style={{ position: "absolute", left, top, width: w, height: h, overflow: "visible", pointerEvents: "none" }}
            >
              <line
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke="#111827" strokeWidth={2} vectorEffect="non-scaling-stroke"
                pointerEvents="stroke" style={{ cursor: "move" }}
                onMouseDown={(e) => { dragRef.current = { id: s.id, kind: "line", dx: e.clientX - s.x1, dy: e.clientY - s.y1 }; e.stopPropagation(); }}
                onContextMenu={(e) => openShapeMenuAtEvent(e, s.id, "line")}
              />
              <circle cx={x1} cy={y1} r={6} fill="#fff" stroke="#111827" strokeWidth={2}
                pointerEvents="all" style={{ cursor: "grab" }}
                onMouseDown={(e) => { dragRef.current = { id: s.id, kind: "p1", dx: e.clientX - s.x1, dy: e.clientY - s.y1 }; e.stopPropagation(); }}
                onContextMenu={(e) => openShapeMenuAtEvent(e, s.id, "line")}
              />
              <circle cx={x2} cy={y2} r={6} fill="#fff" stroke="#111827" strokeWidth={2}
                pointerEvents="all" style={{ cursor: "grab" }}
                onMouseDown={(e) => { dragRef.current = { id: s.id, kind: "p2", dx: e.clientX - s.x2, dy: e.clientY - s.y2 }; e.stopPropagation(); }}
                onContextMenu={(e) => openShapeMenuAtEvent(e, s.id, "line")}
              />
            </svg>
          );
        })}
      </div>

      {/* LABELS layer (ABOVE nodes, non-blocking) */}
      <div style={{ position: "absolute", inset: 0, zIndex: 5, pointerEvents: "none" }}>
        {shapes.map((s) => {
          if (s.type !== "rect" || !s.label) return null;
          return (
            <div
              key={`label-${s.id}`}
              style={{
                position: "absolute",
                left: s.x + 8,
                top: s.y + 8,
                width: Math.max(0, s.w - 16),
                fontSize: 13,
                lineHeight: 1.35,
                color: "#111827",
                whiteSpace: "pre-wrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                pointerEvents: "none",
              }}
            >
              {s.label}
            </div>
          );
        })}
      </div>
    </>
  );
}
