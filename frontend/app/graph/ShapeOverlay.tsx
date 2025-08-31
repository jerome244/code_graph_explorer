// app/graph/ShapeOverlay.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";

type ShapeRect = {
  id: string;
  type: "rect";
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;  // border/accent color; "#ffffff" => solid white fill with gray border
  label: string;  // editable text
};
type ShapeLine = { id: string; type: "line"; x1: number; y1: number; x2: number; y2: number };
export type Shape = ShapeRect | ShapeLine;

type DragState = {
  id: string;
  kind: "rect" | "line" | "p1" | "p2";
  dx: number;
  dy: number;
};

// Add white as a selectable color (first entry)
const PALETTE = ["#FFFFFF", "#EF4444", "#F59E0B", "#10B981", "#3B82F6", "#8B5CF6", "#EC4899", "#6B7280", "#111827"];

function hexToRgba(hex: string, alpha: number) {
  const h = hex.replace("#", "");
  const to255 = (pair: string) => parseInt(pair, 16);
  if (h.length === 3) {
    const r = to255(h[0] + h[0]);
    const g = to255(h[1] + h[1]);
    const b = to255(h[2] + h[2]);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  if (h.length === 6) {
    const r = to255(h.slice(0, 2));
    const g = to255(h.slice(2, 4));
    const b = to255(h.slice(4, 6));
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return hex;
}

export default function ShapeOverlay({ containerRef }: { containerRef: React.RefObject<HTMLDivElement> }) {
  // Double-click "Create" menu (background only)
  const [createMenu, setCreateMenu] = useState<{ x: number; y: number } | null>(null);

  // Right-click shape menu
  const [shapeMenu, setShapeMenu] = useState<{ x: number; y: number; id: string; type: "rect" | "line" } | null>(null);

  // Which rectangle is currently being edited (double-click to enter)
  const [editingId, setEditingId] = useState<string | null>(null);

  // Shapes
  const [shapes, setShapes] = useState<Shape[]>([]);

  // Dragging
  const dragRef = useRef<DragState | null>(null);

  // Resize observers for rectangles
  const rectObservers = useRef<Map<string, ResizeObserver>>(new Map());
  const resizeRAF = useRef<Map<string, number>>(new Map());

  // Double-click on background to open create menu (ignore shapes)
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    const onDbl = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("[data-shape-id]")) return; // ignore dblclicks on shapes (used for editing)
      const rect = root.getBoundingClientRect();
      setCreateMenu({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      setShapeMenu(null);
      setEditingId(null);
      e.stopPropagation();
      e.preventDefault();
    };

    root.addEventListener("dblclick", onDbl, true);
    return () => root.removeEventListener("dblclick", onDbl, true);
  }, [containerRef]);

  // Close menus when clicking elsewhere
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      const insideMenu = !!el.closest("[data-create-menu]") || !!el.closest("[data-shape-menu]");
      if (!insideMenu) {
        setCreateMenu(null);
        setShapeMenu(null);
      }
    };
    window.addEventListener("mousedown", onDown, true);
    return () => window.removeEventListener("mousedown", onDown, true);
  }, []);

  // Global drag handlers (capture drag state once for TS)
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;

      setShapes((cur) =>
        cur.map((s) => {
          if (s.id !== d.id) return s;

          if (s.type === "rect" && d.kind === "rect") {
            return { ...s, x: e.clientX - d.dx, y: e.clientY - d.dy };
          }

          if (s.type === "line") {
            if (d.kind === "line") {
              const nx1 = e.clientX - d.dx;
              const ny1 = e.clientY - d.dy;
              const dx = nx1 - s.x1;
              const dy = ny1 - s.y1;
              return { ...s, x1: nx1, y1: ny1, x2: s.x2 + dx, y2: s.y2 + dy };
            }
            if (d.kind === "p1") {
              return { ...s, x1: e.clientX - d.dx, y1: e.clientY - d.dy };
            }
            if (d.kind === "p2") {
              return { ...s, x2: e.clientX - d.dx, y2: e.clientY - d.dy };
            }
          }

          return s;
        })
      );

      e.preventDefault();
    };

    const onUp = () => {
      dragRef.current = null;
    };

    window.addEventListener("mousemove", onMove, true);
    window.addEventListener("mouseup", onUp, true);
    return () => {
      window.removeEventListener("mousemove", onMove, true);
      window.removeEventListener("mouseup", onUp, true);
    };
  }, []);

  // Sync rectangle size (CSS resize) back to state
  useEffect(() => {
    // cleanup removed
    for (const [id, obs] of rectObservers.current) {
      if (!shapes.find((s) => s.id === id && s.type === "rect")) {
        obs.disconnect();
        rectObservers.current.delete(id);
      }
    }

    const root = containerRef.current;
    if (!root) return;

    const els = Array.from(
      root.parentElement?.querySelectorAll<HTMLElement>('[data-shape-id][data-kind="rect"]') || []
    );
    for (const el of els) {
      const id = el.dataset.shapeId!;
      if (rectObservers.current.has(id)) continue;
      const obs = new ResizeObserver(() => {
        const r = el.getBoundingClientRect();
        const w = r.width;
        const h = r.height;
        const prev = resizeRAF.current.get(id);
        if (prev) cancelAnimationFrame(prev);
        const rafId = requestAnimationFrame(() => {
          setShapes((cur) => cur.map((s) => (s.id === id && s.type === "rect" ? { ...s, w, h } : s)));
        });
        resizeRAF.current.set(id, rafId);
      });
      obs.observe(el);
      rectObservers.current.set(id, obs);
    }

    return () => {
      for (const [, raf] of resizeRAF.current) cancelAnimationFrame(raf);
    };
  }, [shapes, containerRef]);

  // Auto-focus editor when entering edit mode
  useEffect(() => {
    if (!editingId) return;
    const el = document.querySelector<HTMLDivElement>(`[data-editor-for="${editingId}"]`);
    if (el) {
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, [editingId]);

  // Shape ops
  const addRect = (x: number, y: number) => {
    const id = "rect-" + Math.random().toString(36).slice(2, 9);
    setShapes((cur) => [
      ...cur,
      {
        id,
        type: "rect",
        x: Math.max(8, x - 60),
        y: Math.max(8, y - 40),
        w: 200,
        h: 120,
        color: "#ffffff", // default WHITE
        label: "",
      },
    ]);
    setCreateMenu(null);
  };

  const addLine = (x: number, y: number) => {
    const id = "line-" + Math.random().toString(36).slice(2, 9);
    setShapes((cur) => [...cur, { id, type: "line", x1: x - 70, y1: y - 40, x2: x + 70, y2: y + 40 }]);
    setCreateMenu(null);
  };

  const removeShape = (id: string) => {
    setShapes((cur) => cur.filter((s) => s.id !== id));
    setShapeMenu(null);
    if (editingId === id) setEditingId(null);
  };

  const setRectColor = (id: string, color: string) => {
    setShapes((cur) => cur.map((s) => (s.id === id && s.type === "rect" ? { ...s, color } : s)));
    setShapeMenu(null);
  };

  const setRectLabel = (id: string, label: string) => {
    const cleaned = label.replace(/\s+$/g, "");
    setShapes((cur) => cur.map((s) => (s.id === id && s.type === "rect" ? { ...s, label: cleaned } : s)));
  };

  // Helpers
  const openShapeMenuAtEvent = (e: React.MouseEvent, id: string, type: "rect" | "line") => {
    e.preventDefault();
    e.stopPropagation();
    const root = containerRef.current;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    setCreateMenu(null);
    setShapeMenu({ x: e.clientX - rect.left, y: e.clientY - rect.top, id, type });
  };

  return (
    <>
      {/* Background double-click "Create" menu */}
      {createMenu && (
        <div
          style={{
            position: "absolute",
            left: createMenu.x,
            top: createMenu.y,
            transform: "translate(-50%, -110%)",
            zIndex: 26,
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
          <button
            onClick={(e) => {
              e.stopPropagation();
              addRect(createMenu.x, createMenu.y);
            }}
            style={{ border: "1px solid #ddd", padding: "6px 10px", borderRadius: 6, fontSize: 12 }}
            title="Draw a resizable rectangle"
          >
            ▭ Rectangle
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              addLine(createMenu.x, createMenu.y);
            }}
            style={{ border: "1px solid #ddd", padding: "6px 10px", borderRadius: 6, fontSize: 12 }}
            title="Draw a line (drag endpoints to resize)"
          >
            ／ Line
          </button>
          <button
            onClick={() => setCreateMenu(null)}
            style={{ border: "1px solid #ddd", padding: "6px 10px", borderRadius: 6, fontSize: 12 }}
            title="Close menu"
          >
            ✕
          </button>
        </div>
      )}

      {/* Right-click Shape menu */}
      {shapeMenu && (
        <div
          style={{
            position: "absolute",
            left: shapeMenu.x,
            top: shapeMenu.y,
            transform: "translate(-50%, -110%)",
            zIndex: 27,
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
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 4,
                      border: "1px solid #d1d5db",
                      background: c,
                      cursor: "pointer",
                    }}
                  />
                ))}
              </div>
              <div style={{ width: 10 }} />
            </>
          )}
          <button
            onClick={() => removeShape(shapeMenu.id)}
            style={{ border: "1px solid #ef4444", color: "#ef4444", padding: "6px 10px", borderRadius: 6, fontSize: 12 }}
            title="Delete shape"
          >
            Delete
          </button>
          <button
            onClick={() => setShapeMenu(null)}
            style={{ border: "1px solid #ddd", padding: "6px 10px", borderRadius: 6, fontSize: 12 }}
            title="Close menu"
          >
            ✕
          </button>
        </div>
      )}

      {/* Shapes overlay */}
      <div style={{ position: "absolute", inset: 0, zIndex: 19, pointerEvents: "none" }}>
        {shapes.map((s) => {
          if (s.type === "rect") {
            const isEditing = editingId === s.id;
            const isWhite = s.color.toLowerCase() === "#ffffff" || s.color.toLowerCase() === "white";
            const borderColor = isWhite ? "#d1d5db" : s.color;          // gray border when white
            const bg = isWhite ? "#ffffff" : hexToRgba(s.color, 0.12);  // solid white vs tinted

            return (
              <div
                key={s.id}
                data-shape-id={s.id}
                data-kind="rect"
                style={{
                  position: "absolute",
                  left: s.x,
                  top: s.y,
                  width: s.w,
                  height: s.h,
                  border: `2px dashed ${borderColor}`,
                  background: bg,
                  borderRadius: 8,
                  resize: "both",
                  overflow: "hidden",
                  boxSizing: "border-box",
                  pointerEvents: "auto",
                  userSelect: "none",
                  display: "flex",
                }}
                // NORMAL GRAB: start dragging on mousedown (unless resizing corner or editing)
                onMouseDown={(e) => {
                  const el = e.currentTarget as HTMLElement;
                  const r = el.getBoundingClientRect();
                  const isOnResizeCorner = e.clientX > r.right - 16 && e.clientY > r.bottom - 16;
                  if (isEditing || isOnResizeCorner) return;
                  if (e.detail >= 2) return; // let dblclick handler take over for editing
                  dragRef.current = { id: s.id, kind: "rect", dx: e.clientX - s.x, dy: e.clientY - s.y };
                  e.stopPropagation();
                }}
                // EDIT ON DOUBLE-LEFT-CLICK
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setEditingId(s.id);
                  setCreateMenu(null);
                  setShapeMenu(null);
                }}
                onContextMenu={(e) => openShapeMenuAtEvent(e, s.id, "rect")}
                onWheel={(e) => e.stopPropagation()}
                title="Drag to move. Resize from corner. Double-click to edit text. Right-click for options."
              >
                {/* Editable content area */}
                <div
                  style={{
                    pointerEvents: isEditing ? "auto" : "none",
                    outline: "none",
                    flex: 1,
                    padding: 8,
                    whiteSpace: "pre-wrap",
                    overflow: "auto",
                    cursor: isEditing ? "text" : "move",
                    fontSize: 13,
                    lineHeight: 1.35,
                    color: "#111827",
                  }}
                  className="rect-editor"
                  contentEditable={isEditing}
                  suppressContentEditableWarning
                  spellCheck={false}
                  data-editor-for={s.id}
                  onBlur={(e) => {
                    const text = e.currentTarget.textContent ?? "";
                    setRectLabel(s.id, text);
                    setEditingId(null);
                  }}
                  onKeyDown={(e) => {
                    // ESC or Ctrl/Cmd+Enter to finish editing
                    if (e.key === "Escape" || (e.key === "Enter" && (e.ctrlKey || e.metaKey))) {
                      (e.currentTarget as HTMLDivElement).blur();
                    }
                  }}
                >
                  {s.label || ""}
                </div>
              </div>
            );
          }

          // ------- line -------
          const w = Math.abs(s.x2 - s.x1) + 24;
          const h = Math.abs(s.y2 - s.y1) + 24;
          const left = Math.min(s.x1, s.x2) - 12;
          const top = Math.min(s.y1, s.y2) - 12;
          const x1 = s.x1 - left;
          const y1 = s.y1 - top;
          const x2 = s.x2 - left;
          const y2 = s.y2 - top;

          return (
            <svg
              key={s.id}
              data-shape-id={s.id}
              data-kind="line"
              style={{ position: "absolute", left, top, width: w, height: h, pointerEvents: "auto", overflow: "visible" }}
              onMouseDown={(e) => {
                dragRef.current = { id: s.id, kind: "line", dx: e.clientX - s.x1, dy: e.clientY - s.y1 };
                e.stopPropagation();
              }}
              onContextMenu={(e) => openShapeMenuAtEvent(e, s.id, "line")}
              onWheel={(e) => e.stopPropagation()}
            >
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#111827" strokeWidth={2} vectorEffect="non-scaling-stroke" />
              <circle
                cx={x1}
                cy={y1}
                r={6}
                fill="#fff"
                stroke="#111827"
                strokeWidth={2}
                onMouseDown={(e) => {
                  dragRef.current = { id: s.id, kind: "p1", dx: e.clientX - s.x1, dy: e.clientY - s.y1 };
                  e.stopPropagation();
                }}
              />
              <circle
                cx={x2}
                cy={y2}
                r={6}
                fill="#fff"
                stroke="#111827"
                strokeWidth={2}
                onMouseDown={(e) => {
                  dragRef.current = { id: s.id, kind: "p2", dx: e.clientX - s.x2, dy: e.clientY - s.y2 };
                  e.stopPropagation();
                }}
              />
            </svg>
          );
        })}
      </div>
    </>
  );
}
