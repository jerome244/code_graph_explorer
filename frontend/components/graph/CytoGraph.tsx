// components/graph/CytoGraph.tsx
"use client";

import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { ElementDefinition } from "cytoscape";
import { highlightSource } from "@/lib/analyze";

/** Throttle helper (leading+trailing) */
function throttle<T extends (...args: any[]) => void>(fn: T, ms = 60): T {
  let last = 0;
  let timer: number | null = null;
  // @ts-ignore
  return function (...args: any[]) {
    const now = Date.now();
    const remaining = ms - (now - last);
    if (remaining <= 0) {
      last = now;
      fn(...args);
    } else if (!timer) {
      timer = window.setTimeout(() => {
        last = Date.now();
        timer = null;
        fn(...args);
      }, remaining);
    }
  } as T;
}

// deterministic color for cursors
function colorFromId(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return `hsl(${h}, 90%, 55%)`;
}

// darken a hex color (0..1)
function darkenHex(hex: string, amount = 0.35) {
  let h = hex.trim();
  if (h.startsWith("#")) h = h.slice(1);
  if (h.length === 3) h = h.split("").map(c => c + c).join("");
  if (h.length !== 6) return hex;
  const n = parseInt(h, 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const q = Math.max(0, Math.min(1, 1 - amount));
  r = Math.round(r * q); g = Math.round(g * q); b = Math.round(b * q);
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

export type CytoGraphHandle = {
  applyLiveMove: (id: string, pos: { x: number; y: number }, opts?: { animate?: boolean }) => void;
  exportElementsWithPositions: () => ElementDefinition[];
  openPopup: (id: string, label?: string) => void;
  closePopup: (id: string) => void;
  getOpenPopups: () => { id: string; label: string }[];
  updateRemoteCursor: (clientId: string, pos: { x: number; y: number }, meta?: { name?: string; color?: string }) => void;
  removeRemoteCursor: (clientId: string) => void;

  /** apply remote creation/color/label/size ops */
  addAdhoc: (payload: {
    id: string;
    kind: "rect" | "text" | "node";
    position: { x: number; y: number };
    data?: Record<string, any>;
    classes?: string;
  }) => void;
  setRectColor: (id: string, bg: string, border: string) => void;
  setLabel: (id: string, label: string) => void;
  setRectSize: (id: string, width: number, height: number) => void;
};

type Props = {
  elements: ElementDefinition[] | { elements: ElementDefinition[] } | any;
  hiddenIds?: string[];
  files?: Record<string, string>;
  onNodeSelect?: (id: string) => void;
  onHideNode?: (id: string) => void;
  onUpdateFile?: (path: string, content: string) => void;
  onMoveNode?: (id: string, position: { x: number; y: number }) => void;
  onMoveCommit?: (id: string, position: { x: number; y: number }) => void;
  onPopupOpened?: (id: string, label: string) => void;
  onPopupClosed?: (id: string) => void;
  onCursorMove?: (pos: { x: number; y: number }) => void;

  /** emit local changes */
  onCreateAdhoc?: (payload: {
    id: string;
    kind: "rect" | "text" | "node";
    position: { x: number; y: number };
    data?: Record<string, any>;
    classes?: string;
  }) => void;
  onRectColorChange?: (id: string, bg: string, border: string) => void;
  onLabelChange?: (id: string, label: string) => void;
  /** ✨ new: emit rectangle resize */
  onRectResize?: (id: string, width: number, height: number) => void;
};

const CytoGraph = forwardRef<CytoGraphHandle, Props>(function CytoGraph(
  {
    elements,
    hiddenIds = [],
    files = {},
    onNodeSelect,
    onHideNode,
    onUpdateFile,
    onMoveNode,
    onMoveCommit,
    onPopupOpened,
    onPopupClosed,
    onCursorMove,
    onCreateAdhoc,
    onRectColorChange,
    onLabelChange,
    onRectResize,
  },
  ref
) {
  // normalize to always be an array
  const els: ElementDefinition[] = Array.isArray(elements)
    ? elements
    : (elements as any)?.elements ?? [];

  const cyRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Remote-move smoothing
  const lerpTargetsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const lerpRafRef = useRef<number>(0);

  const tickLerp = () => {
    const cy = cyRef.current;
    if (!cy) { lerpTargetsRef.current.clear(); lerpRafRef.current = 0; return; }

    let anyActive = false;

    lerpTargetsRef.current.forEach((target, id) => {
      const n = cy.getElementById(id);
      if (!n || !n.length) { lerpTargetsRef.current.delete(id); return; }
      if (n.grabbed && n.grabbed()) { lerpTargetsRef.current.delete(id); return; }

      const p = n.position();
      const dx = target.x - p.x;
      const dy = target.y - p.y;
      const dist2 = dx * dx + dy * dy;

      if (dist2 < 0.25) {
        n.position(target);
        lerpTargetsRef.current.delete(id);
        return;
      }

      const alpha = 0.35;
      n.position({ x: p.x + dx * alpha, y: p.y + dy * alpha });
      anyActive = true;
    });

    if (anyActive) {
      lerpRafRef.current = requestAnimationFrame(tickLerp);
    } else {
      lerpRafRef.current = 0;
    }
  };

  useEffect(() => {
    return () => {
      if (lerpRafRef.current) cancelAnimationFrame(lerpRafRef.current);
      lerpRafRef.current = 0;
      lerpTargetsRef.current.clear();
    };
  }, []);

  // popups for file nodes
  const [popups, setPopups] = useState<{ id: string; label: string }[]>([]);
  const popupRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // per-popup line mute
  const [mutedPopups, setMutedPopups] = useState<Set<string>>(new Set());
  const mutedRef = useRef<Set<string>>(new Set());
  useEffect(() => { mutedRef.current = mutedPopups; }, [mutedPopups]);

  // popup inline code editing
  const [editing, setEditing] = useState<Set<string>>(new Set());
  const [buffers, setBuffers] = useState<Record<string, string>>({});
  const isEditing = (id: string) => editing.has(id);
  const startEdit = (id: string, initial: string) => {
    setEditing(s => (s.has(id) ? s : new Set(s).add(id)));
    setBuffers(b => (id in b ? b : { ...b, [id]: initial })); 
    setMutedPopups(m => new Set(m).add(id));
  };
  const cancelEdit = (id: string) => {
    setEditing(s => { const n = new Set(s); n.delete(id); return n; });
    setMutedPopups(m => { const n = new Set(m); n.delete(id); return n; });
    setBuffers(b => { const { [id]: _, ...rest } = b; return rest; });
  };
  const saveEdit = (id: string) => {
    const content = buffers[id];
    if (typeof content === "string") onUpdateFile?.(id, content);
    cancelEdit(id);
  };

  // function names for highlight + lines
  const fnNames = useMemo(() => {
    const names = new Set<string>();
    for (const el of els) {
      if ((el as any).group !== "edges") continue;
      const fn = (el as any).data?.fn;
      if (typeof fn === "string" && fn) names.add(fn);
    }
    return Array.from(names);
  }, [els]);

  // lines overlay
  type Conn = { x1: number; y1: number; x2: number; y2: number; color: string };
  const [connections, setConnections] = useState<Conn[]>([]);
  const rafConn = useRef<number>(0);
  const scheduleConnections = () => {
    if (rafConn.current) return;
    rafConn.current = requestAnimationFrame(() => { rafConn.current = 0; recomputeConnections(); });
  };
  const recomputeConnections = () => {
    const container = containerRef.current; if (!container) return;
    const crect = container.getBoundingClientRect();
    type Anchor = { x:number; y:number; color:string; popupId:string; fn:string };
    const perFn: Record<string, Anchor[]> = {};

    popupRefs.current.forEach((popupEl, popupId) => {
      if (mutedRef.current.has(popupId)) return;
      const hits = Array.from(popupEl.querySelectorAll<HTMLElement>(".fn-hit[data-fn]"));
      if (!hits.length) return;
      const firstPerFn: Record<string, HTMLElement> = {};
      for (const el of hits) { const fn = el.dataset.fn!; if (!firstPerFn[fn]) firstPerFn[fn] = el; }
      for (const [fn, el] of Object.entries(firstPerFn)) {
        const r = el.getBoundingClientRect();
        const x = r.left + r.width/2 - crect.left;
        const y = r.top + r.height/2 - crect.top;
        const color = el.dataset.color || "#999";
        (perFn[fn] ||= []).push({ x, y, color, popupId, fn });
      }
    });

    const conns: Conn[] = [];
    Object.values(perFn).forEach(anchors => {
      if (anchors.length < 2) return;
      for (let i=0;i<anchors.length-1;i++) for (let j=i+1;j<anchors.length;j++) {
        const a = anchors[i], b = anchors[j];
        conns.push({ x1:a.x, y1:a.y, x2:b.x, y2:b.y, color:a.color });
      }
    });
    setConnections(conns);
  };

  // popup ref management
  const cleanupRefs = useRef<Map<string, () => void>>(new Map());
  const setPopupRef = (id: string) => (el: HTMLDivElement | null) => {
    if (!el) {
      cleanupRefs.current.get(id)?.(); cleanupRefs.current.delete(id);
      popupRefs.current.delete(id); scheduleConnections(); return;
    }
    popupRefs.current.set(id, el);
    const codePane = el.querySelector<HTMLElement>(".popup-code");
    const onScroll = () => scheduleConnections();
    const ro = new ResizeObserver(() => scheduleConnections());
    if (codePane) { codePane.addEventListener("scroll", onScroll, { passive: true }); ro.observe(codePane); }
    ro.observe(el);
    cleanupRefs.current.set(id, () => { codePane?.removeEventListener("scroll", onScroll); ro.disconnect(); });
    scheduleConnections();
    const cy = cyRef.current;
    if (cy) {
      const node = cy.getElementById(id);
      if (node && node.length) {
        const pos = node.renderedPosition();
        el.style.transform = `translate(${pos.x + 14}px, ${pos.y - 14}px)`;
      }
    }
  };

  // quick palette (dblclick background)
  const [palette, setPalette] = useState<{ x:number; y:number; model:{x:number;y:number} } | null>(null);

  // inline label editor for adhoc nodes
  const [labelEdit, setLabelEdit] = useState<{ id: string; value: string; x: number; y: number; w: number } | null>(null);

  // selection of adhoc rects for resize handles
  const [selectedRects, setSelectedRects] = useState<string[]>([]);
  const handleRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const setHandleRef = (id: string) => (el: HTMLDivElement | null) => {
    if (!el) handleRefs.current.delete(id);
    else handleRefs.current.set(id, el);
  };

  // resize state
  const resizingRef = useRef<{
    id: string; startX: number; startY: number; startRW: number; startRH: number; startZoom: number;
  } | null>(null);

  const isAdhoc = (n: any) => n.hasClass("adhoc");
  const isRect = (n: any) => n.hasClass("shape-rect");
  const isText = (n: any) => n.hasClass("shape-text");

  // color panel state for rectangles
  const [colorPanel, setColorPanel] = useState<{ id: string; x: number; y: number; color: string } | null>(null);
  const presetColors = ["#fde68a", "#fca5a5", "#93c5fd", "#bbf7d0", "#e9d5ff", "#fef08a", "#fecaca", "#a7f3d0", "#c7d2fe"];

  // remote cursor state
  type RemoteCursor = { id: string; name?: string; color: string; pos: { x: number; y: number }; last: number };
  const cursorsRef = useRef<Map<string, RemoteCursor>>(new Map());
  const [cursorTick, setCursorTick] = useState(0);
  const touchCursor = (id: string, pos: { x: number; y: number }, meta?: { name?: string; color?: string }) => {
    const m = new Map(cursorsRef.current);
    const prev = m.get(id);
    m.set(id, {
      id,
      pos,
      name: meta?.name ?? prev?.name,
      color: meta?.color ?? prev?.color ?? colorFromId(id),
      last: Date.now(),
    });
    cursorsRef.current = m;
    setCursorTick(t => t + 1);
  };
  const dropCursor = (id: string) => {
    if (!cursorsRef.current.has(id)) return;
    const m = new Map(cursorsRef.current);
    m.delete(id);
    cursorsRef.current = m;
    setCursorTick(t => t + 1);
  };

  // ── Cytoscape init ─────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      if (!containerRef.current || cyRef.current) return;
      const cytoscape = (await import("cytoscape")).default;
      const cy = cytoscape({
        container: containerRef.current,
        elements: [],
        wheelSensitivity: 0.2,
        layout: { name: "preset" }, // keep manual positions stable
        style: [
          // Base nodes (file nodes)
          {
            selector: "node",
            style: {
              "z-index-compare": "manual",
              "z-index": 10,
              width: 12,
              height: 12,
              "background-color": "#111111",
              label: "data(label)",
              "font-size": 8,
              "min-zoomed-font-size": 6,
              color: "#111827",
              "text-wrap": "wrap",
              "text-max-width": 160,
              "text-outline-color": "#ffffff",
              "text-outline-width": 1,
            },
          },
          // Edges
          {
            selector: "edge",
            style: {
              width: 2,
              "curve-style": "bezier",
              "control-point-step-size": 24,
              "line-color": "#cbd5e1",
              "target-arrow-shape": "triangle",
              "target-arrow-color": "#cbd5e1",
              "arrow-scale": 0.8,
              opacity: 0.95,
            },
          },
          // Selected node border
          { selector: "node:selected", style: { "border-width": 2, "border-color": "#2563eb" } },

          // Custom shapes (behind)
          {
            selector: "node.adhoc.shape-rect",
            style: {
              "z-index-compare": "manual",
              "z-index": 0,
              shape: "round-rectangle",
              width: 160,
              height: 100,
              "background-color": "data(bg)",
              "border-color": "data(border)",
              "border-width": 1,
              label: "data(label)",
              "font-size": 12,
              color: "#0f172a",
              "text-wrap": "wrap",
              "text-max-width": 150,
              "text-valign": "center",
              "text-halign": "center",
            },
          },
          {
            selector: "node.adhoc.shape-text",
            style: {
              "z-index-compare": "manual",
              "z-index": 5,
              shape: "round-rectangle",
              width: 220,
              height: 44,
              "background-opacity": 0,
              "border-width": 0,
              label: "data(label)",
              "font-size": 13,
              color: "#0f172a",
              "text-wrap": "wrap",
              "text-max-width": 220,
              "text-valign": "center",
              "text-halign": "center",
            },
          },
        ],
      });

      // tap node: open/close popup for file nodes and plain adhoc nodes (not for rect/text)
      cy.on("tap", "node", (evt: any) => {
        const n = evt.target;
        const id = n.id();
        const label = n.data("label") || id;
        if (!n || n.hidden()) return;

        setPalette(null);
        setColorPanel(null);

        // rectangles & text: selection-only
        if (isAdhoc(n) && (isRect(n) || isText(n))) {
          return;
        }

        setPopups((prev) => {
          const open = prev.some((p) => p.id === id);
          if (open) {
            setEditing((s) => { const nn = new Set(s); nn.delete(id); return nn; });
            setMutedPopups((s) => { const nn = new Set(s); nn.delete(id); return nn; });
            onPopupClosed?.(id);
            return prev.filter((p) => p.id !== id);
          }
          onNodeSelect?.(id);
          onPopupOpened?.(id, label);
          return [...prev, { id, label }];
        });
      });

      // double-click node: inline label editor for adhoc nodes
      cy.on("dbltap", "node", (evt: any) => {
        const n = evt.target;
        const bb = n.renderedBoundingBox();
        setLabelEdit({
          id: n.id(),
          value: n.data("label") || "",
          x: bb.x1,
          y: bb.y1 - 28,
          w: Math.max(120, bb.w),
        });
      });

      // Right click
      cy.on("cxttap", "node", (evt: any) => {
        const n = evt.target;
        const id = n.id();

        // rectangles: open color panel
        if (isAdhoc(n) && isRect(n)) {
          const rp = evt.renderedPosition;
          const current = n.data("bg") || n.style("background-color") || "#fde68a";
          setColorPanel({ id, x: rp.x, y: rp.y, color: current });
          return;
        }

        // others: hide
        onHideNode?.(id);
        setPalette(null);
        setColorPanel(null);
        setPopups((prev) => prev.filter((p) => p.id !== id));
        setEditing((s) => { const S = new Set(s); S.delete(id); return S; });
        setMutedPopups((s) => { const S = new Set(s); S.delete(id); return S; });
        scheduleConnections();
      });

      // Double-click background → palette
      cy.on("dbltap", (evt: any) => {
        if (evt.target !== cy) return;
        const rp = evt.renderedPosition;
        const mp = evt.position;
        setPalette({ x: rp.x, y: rp.y, model: { x: mp.x, y: mp.y } });
        setColorPanel(null);
      });

      // selection change -> update selected rects (for resize handle)
      cy.on("select unselect", "node.adhoc.shape-rect", () => {
        const sel = cy.$("node.adhoc.shape-rect:selected").map((n: any) => n.id());
        setSelectedRects(sel);
      });

      // Stream MOVE_NODE while dragging (throttled)
      const FPS = 20;
      const emitMove = throttle((id: string, pos: { x: number; y: number }) => {
        onMoveNode?.(id, pos);
      }, Math.round(1000 / FPS));

      const onDrag = (e: any) => {
        const n = e.target;
        emitMove(n.id(), n.position());
      };
      cy.on("drag", "node", onDrag);

      // Precise final update on release
      const onFreeCommit = (e: any) => {
        const n = e.target;
        const p = n.position();
        onMoveCommit?.(n.id(), { x: p.x, y: p.y });
      };
      cy.on("free", "node", onFreeCommit);

      // Local mouse move → broadcast model coords (20 fps)
      const onMouseMove = throttle((evt: any) => {
        if (!evt || !evt.position) return;
        onCursorMove?.(evt.position);
      }, Math.round(1000 / 20));
      cy.on("mousemove", onMouseMove as any);

      // rAF-throttled follow-ups for overlays
      let raf = 0;
      const schedule = () => {
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0;
          popupRefs.current.forEach((el, id) => {
            const node = cy.getElementById(id);
            if (el && node && node.length) {
              const pos = node.renderedPosition();
              el.style.transform = `translate(${pos.x + 14}px, ${pos.y - 14}px)`;
            }
          });
          handleRefs.current.forEach((el, id) => {
            const node = cy.getElementById(id);
            if (!el || !node || !node.length) return;
            const bb = node.renderedBoundingBox();
            el.style.transform = `translate(${bb.x2 - 6}px, ${bb.y2 - 6}px)`;
          });
          if (labelEdit) {
            const n = cy.getElementById(labelEdit.id);
            if (n && n.length) {
              const bb = n.renderedBoundingBox();
              setLabelEdit(prev => prev ? { ...prev, x: bb.x1, y: bb.y1 - 28, w: Math.max(120, bb.w) } : prev);
            }
          }
          if (colorPanel) {
            const n = cy.getElementById(colorPanel.id);
            if (n && n.length) {
              const bb = n.renderedBoundingBox();
              const nx = bb.x2 + 8, ny = bb.y1;
              if (Math.abs(nx - colorPanel.x) > 0.5 || Math.abs(ny - colorPanel.y) > 0.5) {
                setColorPanel(prev => (prev ? { ...prev, x: nx, y: ny } : prev));
              }
            }
          }
          // bump cursor overlay projection
          setCursorTick(t => t + 1);
          scheduleConnections();
        });
      };
      cy.on("viewport layoutstop", schedule);
      cy.on("position drag free", "node", schedule);
      window.addEventListener("resize", scheduleConnections);

      // keyboard
      const onKey = (ev: KeyboardEvent) => {
        const ae = document.activeElement as HTMLElement | null;
        const tag = (ae?.tagName || "").toLowerCase();
        const editable = tag === "textarea" || tag === "input";
        if (editable) return;
        if (ev.key === "Delete" || ev.key === "Backspace") {
          const sel = cy.$("node:selected.adhoc");
          if (sel.length) {
            sel.remove();
            setSelectedRects([]);
            if (labelEdit && !cy.getElementById(labelEdit.id).length) setLabelEdit(null);
            if (colorPanel && !cy.getElementById(colorPanel.id).length) setColorPanel(null);
            setPalette(null);
          }
        } else if (ev.key === "Escape") {
          setPalette(null);
          setLabelEdit(null);
          setColorPanel(null);
        }
      };
      window.addEventListener("keydown", onKey);

      cyRef.current = cy;

      return () => {
        window.removeEventListener("resize", scheduleConnections);
        window.removeEventListener("keydown", onKey);
        cy.off("tap");
        cy.off("dbltap");
        cy.off("cxttap");
        cy.off("viewport", schedule);
        cy.off("layoutstop", schedule);
        cy.off("position", "node", schedule);
        cy.off("drag", "node", schedule);
        cy.off("free", "node", schedule);
        cy.off("drag", "node", onDrag);
        cy.off("free", "node", onFreeCommit);
        cy.off("mousemove", onMouseMove as any);
      };
    })();
  }, [onNodeSelect, onHideNode, onMoveNode, onMoveCommit, labelEdit?.id, colorPanel?.id, onPopupOpened, onPopupClosed, onCursorMove]);

  // ── Preserve positions on updates; layout only when node set changes ──
  const prevNodeIdsRef = useRef<Set<string>>(new Set());
  const didInitialLayoutRef = useRef(false);

  useEffect(() => {
    const cy = cyRef.current; if (!cy) return;

    const newNodeIds = new Set(
      (els || [])
        .filter((e: any) => (e.group ?? e?.data?.group ?? "nodes") === "nodes")
        .map((e: any) => e?.data?.id)
        .filter(Boolean)
    );
    const prevNodeIds = prevNodeIdsRef.current;
    const hadPrev = prevNodeIds.size > 0;
    const sameNodeSet =
      newNodeIds.size === prevNodeIds.size &&
      Array.from(newNodeIds).every((id) => prevNodeIds.has(id as string));

    // Snapshot current positions of existing non-adhoc nodes
    const currentPos = new Map<string, { x: number; y: number }>();
    cy.nodes(":not(.adhoc)").forEach((n: any) => currentPos.set(n.id(), n.position()));

    // Incoming explicit positions
    const incomingPos = new Map<string, { x: number; y: number }>();
    (els || []).forEach((e: any) => {
      if ((e.group ?? e?.data?.group ?? "nodes") !== "nodes") return;
      const id = e?.data?.id;
      if (!id) return;
      if (e.position && typeof e.position.x === "number" && typeof e.position.y === "number") {
        incomingPos.set(id, { x: e.position.x, y: e.position.y });
      }
    });

    const pan = cy.pan();
    const zoom = cy.zoom();

    cy.startBatch();

    // Remove only non-adhoc; preserve user shapes
    cy.elements(":not(.adhoc)").remove();

    // Re-add new elements
    if (els.length) cy.add(els);

    if (sameNodeSet && hadPrev) {
      cy.nodes(":not(.adhoc)").forEach((n: any) => {
        const id = n.id();
        const pIncoming = incomingPos.get(id);
        const pExisting = currentPos.get(id);
        if (pIncoming) n.position(pIncoming);
        else if (pExisting) n.position(pExisting);
      });
      cy.pan(pan);
      cy.zoom(zoom);
    } else {
      const layout = cy.layout({
        name: "cose",
        nodeDimensionsIncludeLabels: true,
        padding: 20,
      });
      layout.run();
      if (!didInitialLayoutRef.current) {
        cy.fit(undefined, 80);
        didInitialLayoutRef.current = true;
      }
    }

    cy.endBatch();

    prevNodeIdsRef.current = newNodeIds;

    scheduleConnections();
  }, [els]);

  // apply hide/show incrementally
  useEffect(() => {
    const cy = cyRef.current; if (!cy) return;
    const hideSet = new Set(hiddenIds);
    cy.startBatch();
    cy.nodes().forEach((n: any) => { if (hideSet.has(n.id())) n.hide(); else n.show(); });
    cy.endBatch();
    setPopups(prev => prev.filter(p => hideSet.has(p.id) ? false : true));
    setEditing(prev => { const next = new Set(prev); hiddenIds.forEach(id => next.delete(id)); return next; });
    setMutedPopups(prev => { const next = new Set(prev); hiddenIds.forEach(id => next.delete(id)); return next; });
    scheduleConnections();
  }, [hiddenIds]);

  // recompute lines on changes
  useEffect(() => { scheduleConnections(); }, [popups, files, fnNames, mutedPopups]);

  const closePopup = (id: string) => {
    setPopups(prev => prev.filter(p => p.id !== id));
    setEditing(s => { const n = new Set(s); n.delete(id); return n; });
    setMutedPopups(s => { const n = new Set(s); n.delete(id); return n; });
    onPopupClosed?.(id);
    scheduleConnections();
  };
  const togglePopupLines = (id: string) => {
    setMutedPopups(old => { const n = new Set(old); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };

  // palette add (rect/text/node) — also emits onCreateAdhoc
  const makeId = (() => { let c = 0; return (p="custom") => `${p}-${Date.now().toString(36)}-${(c++).toString(36)}`; })();
  const addAt = (kind: "node" | "rect" | "text") => {
    const cy = cyRef.current; if (!cy || !palette) return;
    const id = makeId(kind);
    const pos = palette.model;
    const isRectK = kind === "rect";
    const data: any = {
      id,
      label: kind === "text" ? "Text" : isRectK ? "Rectangle" : "New node",
      ...(isRectK ? { bg: "#fde68a", border: "#f59e0b" } : {}),
    };
    const classes = `adhoc${isRectK ? " shape-rect" : kind === "text" ? " shape-text" : ""}`;
    cy.add({ group: "nodes", data, position: pos, classes });
    onCreateAdhoc?.({ id, kind, position: pos, data, classes });
    setPalette(null);
  };

  // start/stop resizing — ✨ emits onRectResize (throttled)
  const emitRectResize = useRef(throttle((id: string, width: number, height: number) => {
    onRectResize?.(id, width, height);
  }, 50));

  const onHandleMouseDown = (id: string) => (e: React.MouseEvent) => {
    e.stopPropagation();
    const cy = cyRef.current; if (!cy) return;
    const node = cy.getElementById(id);
    if (!node || !node.length) return;
    const resizingRefLocal = resizingRef;
    resizingRefLocal.current = {
      id,
      startX: e.clientX,
      startY: e.clientY,
      startRW: node.renderedWidth(),
      startRH: node.renderedHeight(),
      startZoom: cy.zoom(),
    };
    const onMove = (ev: MouseEvent) => {
      const r = resizingRefLocal.current; if (!r) return;
      const dx = ev.clientX - r.startX;
      const dy = ev.clientY - r.startY;
      const newRW = Math.max(40, r.startRW + dx);
      const newRH = Math.max(30, r.startRH + dy);
      // convert rendered px to model units using the zoom at drag start
      const w = newRW / r.startZoom;
      const h = newRH / r.startZoom;
      node.style({ width: w, height: h });
      const el = handleRefs.current.get(id);
      if (el) {
        const bb = node.renderedBoundingBox();
        el.style.transform = `translate(${bb.x2 - 6}px, ${bb.y2 - 6}px)`;
      }
      emitRectResize.current(id, w, h); // ✨ broadcast throttled
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      resizingRefLocal.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // update rectangle color — also emits onRectColorChange
  const applyRectColor = (id: string, color: string) => {
    const cy = cyRef.current; if (!cy) return;
    const n = cy.getElementById(id);
    if (!n || !n.length) return;
    const bg = color;
    const border = darkenHex(color, 0.35);
    n.data("bg", bg);
    n.data("border", border);
    setColorPanel(prev => (prev ? { ...prev, color: bg } : prev));
    onRectColorChange?.(id, bg, border);
    scheduleConnections();
  };

  useImperativeHandle(ref, () => ({
    applyLiveMove(id, pos, _opts) {
      lerpTargetsRef.current.set(id, { x: pos.x, y: pos.y });
      if (!lerpRafRef.current) {
        lerpRafRef.current = requestAnimationFrame(tickLerp);
      }
    },
    exportElementsWithPositions() {
      const cy = cyRef.current;
      const base: ElementDefinition[] = Array.isArray(els) ? els : (els as any)?.elements ?? [];
      if (!cy) return base;

      const pos: Record<string, { x: number; y: number }> = {};
      cy.nodes(':not(.adhoc)').forEach((n: any) => {
        const p = n.position();
        pos[n.id()] = { x: p.x, y: p.y };
      });

      return base.map((el: any) => {
        const isNode = (el.group ?? el?.data?.group ?? "nodes") === "nodes";
        if (!isNode) return el;
        const id = el?.data?.id;
        if (!id || !pos[id]) return el;
        return { ...el, position: pos[id] };
      });
    },
    openPopup(id, label) {
      setPopups((prev) => {
        if (prev.some((p) => p.id === id)) return prev;
        const cy = cyRef.current;
        const lbl = label ?? (cy?.getElementById(id)?.data("label") || id);
        return [...prev, { id, label: lbl }];
      });
      scheduleConnections();
    },
    closePopup(id) {
      setPopups((prev) => prev.filter((p) => p.id !== id));
      setEditing((s) => { const n = new Set(s); n.delete(id); return n; });
      setMutedPopups((s) => { const n = new Set(s); n.delete(id); return n; });
      scheduleConnections();
    },
    getOpenPopups() {
      return popups;
    },
    updateRemoteCursor(clientId, pos, meta) {
      touchCursor(clientId, pos, meta);
    },
    removeRemoteCursor(clientId) {
      dropCursor(clientId);
    },

    // remote apply methods
    addAdhoc(payload) {
      const cy = cyRef.current; if (!cy) return;
      const { id, kind, position, data = {}, classes } = payload;
      const cls =
        classes ??
        (kind === "rect" ? "adhoc shape-rect" : kind === "text" ? "adhoc shape-text" : "adhoc");
      if (cy.getElementById(id).length) return;
      cy.add({
        group: "nodes",
        data: { id, label: data.label ?? (kind === "text" ? "Text" : kind === "rect" ? "Rectangle" : "New node"), ...data },
        position,
        classes: cls,
      });
      scheduleConnections();
    },
    setRectColor(id, bg, border) {
      const cy = cyRef.current; if (!cy) return;
      const n = cy.getElementById(id);
      if (!n || !n.length) return;
      n.data("bg", bg);
      n.data("border", border);
      scheduleConnections();
    },
    setLabel(id, label) {
      const cy = cyRef.current; if (!cy) return;
      const n = cy.getElementById(id);
      if (!n || !n.length) return;
      n.data("label", label);
      scheduleConnections();
    },
    // ✨ apply remote rectangle size
    setRectSize(id, width, height) {
      const cy = cyRef.current; if (!cy) return;
      const n = cy.getElementById(id);
      if (!n || !n.length) return;
      n.style({ width, height });
      // keep resize handle aligned if visible
      const el = handleRefs.current.get(id);
      if (el) {
        const bb = n.renderedBoundingBox();
        el.style.transform = `translate(${bb.x2 - 6}px, ${bb.y2 - 6}px)`;
      }
      scheduleConnections();
    },
  }), [els, popups]);

  // Remote cursor overlay projection
  const cursorOverlay = useMemo(() => {
    const cy = cyRef.current;
    if (!cy) return null;
    const { x: panX, y: panY } = cy.pan();
    const zoom = cy.zoom();
    const now = Date.now();
    const cursors = Array.from(cursorsRef.current.values());
    return cursors.map((c) => {
      const age = now - c.last;
      if (age > 4000) return null; // fadeout after 4s idle
      const rx = c.pos.x * zoom + panX;
      const ry = c.pos.y * zoom + panY;
      const alpha = age > 3000 ? 1 - (age - 3000) / 1000 : 1;
      return (
        <div key={c.id} style={{ position: "absolute", transform: `translate(${rx}px, ${ry}px)`, opacity: alpha }}>
          <div
            style={{
              transform: "translate(8px, -4px)",
              padding: "2px 6px",
              borderRadius: 6,
              fontSize: 11,
              background: "white",
              border: "1px solid #e5e7eb",
              boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
              color: "#111827",
              pointerEvents: "none",
              whiteSpace: "nowrap",
            }}
          >
            <span
              style={{
                display: "inline-block",
                width: 8,
                height: 8,
                borderRadius: 999,
                marginRight: 6,
                background: c.color,
              }}
            />
            {c.name ?? "Guest"}
          </div>
          <div
            style={{
              width: 0,
              height: 0,
              borderLeft: "6px solid transparent",
              borderRight: "6px solid transparent",
              borderTop: `10px solid ${c.color}`,
              transform: "translate(0px, -2px)",
            }}
          />
        </div>
      );
    });
  }, [cursorTick]);

  // Label editor: commit hooks emit onLabelChange
  const commitLabel = (id: string, value: string) => {
    const cy = cyRef.current; if (!cy) return;
    cy.getElementById(id).data("label", value);
    onLabelChange?.(id, value);
    scheduleConnections();
  };

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* Cytoscape canvas */}
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />

      {/* Popups (file code) */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 9 }}>
        {popups.map((p) => {
          const raw = files[p.id] ?? "";
          const inEdit = isEditing(p.id);
          const html = highlightSource(raw, fnNames);
          const muted = mutedPopups.has(p.id);
          return (
            <div
              key={p.id}
              ref={setPopupRef(p.id)}
              style={{
                position: "absolute",
                transform: "translate(0px, 0px)",
                background: "white",
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                padding: 8,
                fontSize: 12,
                color: "#111827",
                pointerEvents: "auto",
                zIndex: 9,
                resize: "both",
                overflow: "auto",
                minWidth: 260,
                minHeight: 140,
                maxWidth: "80vw",
                maxHeight: "80vh",
                display: "flex",
                flexDirection: "column",
                gap: 6,
              } as React.CSSProperties}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <strong style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.label}</strong>
                {!inEdit && (
                  <button
                    onClick={() => togglePopupLines(p.id)}
                    title={muted ? "Show lines from this popup" : "Hide lines from this popup"}
                    style={{
                      border: "1px solid #e5e7eb",
                      background: muted ? "#f9fafb" : "#ffffff",
                      borderRadius: 6,
                      padding: "2px 6px",
                      lineHeight: 1.2,
                      fontSize: 11,
                      cursor: "pointer",
                    }}
                  >
                    {muted ? "Show lines" : "Hide lines"}
                  </button>
                )}
                {inEdit && (
                  <>
                    <button
                      onClick={() => saveEdit(p.id)}
                      title="Save (Ctrl/Cmd+S)"
                      style={{ border: "1px solid #10b981", background: "#ecfdf5", color: "#065f46", borderRadius: 6, padding: "2px 8px", lineHeight: 1.2, fontSize: 11, cursor: "pointer" }}
                    >
                      Save
                    </button>
                    <button
                      onClick={() => cancelEdit(p.id)}
                      title="Cancel (Esc)"
                      style={{ border: "1px solid #e5e7eb", background: "#ffffff", borderRadius: 6, padding: "2px 8px", lineHeight: 1.2, fontSize: 11, cursor: "pointer" }}
                    >
                      Cancel
                    </button>
                  </>
                )}
                <button onClick={() => closePopup(p.id)} title="Close" style={{ marginLeft: "auto", border: "none", background: "transparent", cursor: "pointer", padding: 0, lineHeight: 1, fontSize: 14 }}>×</button>
              </div>

              {/* Scrollable code area */}
              <div
                className="popup-code"
                style={{
                  border: "1px solid #f3f4f6",
                  borderRadius: 6,
                  background: inEdit ? "#ffffff" : "#f9fafb",
                  overflow: "auto",
                  flex: 1,
                  minHeight: 0,
                  minWidth: 0,
                  position: "relative",
                }}
                onClick={() => {
                  if (!inEdit) startEdit(p.id, raw);
                }}
              >
                {(() => {
                  const codeFont =
                    'ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace';
                  const lineHeight = 1.45;
                  const fontSize = 11;
                  const gutterWidth = 44;
                  const content = inEdit ? (buffers[p.id] ?? raw) : raw;
                  const lineCount = Math.max(1, content.split("\n").length);

                  return (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: `${gutterWidth}px 1fr`,
                        alignItems: "stretch",
                        height: "100%",
                        fontFamily: codeFont,
                        fontSize,
                        lineHeight,
                      }}
                    >
                      {/* Gutter */}
                      <div
                        aria-hidden
                        style={{
                          background: inEdit ? "#fafafa" : "#f3f4f6",
                          borderRight: "1px solid #e5e7eb",
                          color: "#9ca3af",
                          textAlign: "right",
                          padding: "8px 6px",
                          userSelect: "none",
                          whiteSpace: "pre",
                          height: "100%",
                        }}
                      >
                        {Array.from({ length: lineCount }, (_, i) => (
                          <div key={i} style={{ height: `${lineHeight}em`, lineHeight: `${lineHeight}em` }}>
                            {i + 1}
                          </div>
                        ))}
                      </div>

                      {/* Code column */}
                      <div
                        style={{
                          padding: "8px 10px",
                          minWidth: 0,
                          height: "100%",
                          display: "flex",
                        }}
                      >
                        {!inEdit ? (
                          <pre
                            style={{
                              margin: 0,
                              fontFamily: codeFont,
                              fontSize,
                              lineHeight,
                              whiteSpace: "pre",
                              minHeight: "100%",
                              width: "100%",
                            }}
                          >
                            <code dangerouslySetInnerHTML={{ __html: highlightSource(raw, fnNames) }} />
                          </pre>
                        ) : (
                          <textarea
                            value={buffers[p.id] ?? raw}
                            onChange={(e) => setBuffers((prev) => ({ ...prev, [p.id]: e.target.value }))}
                            onKeyDown={(e) => {
                              if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
                                e.preventDefault();
                                saveEdit(p.id);
                              } else if (e.key === "Escape") {
                                e.preventDefault();
                                cancelEdit(p.id);
                              }
                            }}
                            spellCheck={false}
                            wrap="off"
                            style={{
                              boxSizing: "border-box",
                              width: "100%",
                              height: "100%",
                              border: "none",
                              outline: "none",
                              resize: "none",
                              fontFamily: codeFont,
                              fontSize,
                              lineHeight,
                              whiteSpace: "pre",
                              overflow: "hidden",
                              background: "#ffffff",
                              color: "#111827",
                              caretColor: "#111827",
                              WebkitTextFillColor: "#111827" as any,
                            }}
                          />
                        )}
                      </div>
                    </div>
                  );
                })()}

                {!inEdit && (
                  <div
                    style={{
                      position: "absolute",
                      bottom: 6,
                      right: 8,
                      fontSize: 10,
                      color: "#94a3b8",
                      userSelect: "none",
                      pointerEvents: "none",
                    }}
                  >
                    Click to edit
                  </div>
                )}
              </div>

              <div style={{ color: "#6b7280" }}><code style={{ fontSize: 11 }}>{p.id}</code></div>
            </div>
          );
        })}
      </div>

      {/* Inline label editor for adhoc nodes */}
      {labelEdit && (
        <input
          autoFocus
          value={labelEdit.value}
          onChange={(e) => setLabelEdit(le => le ? { ...le, value: e.target.value } : le)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commitLabel(labelEdit.id, labelEdit.value);
              setLabelEdit(null);
            } else if (e.key === "Escape") setLabelEdit(null);
          }}
          onBlur={() => {
            commitLabel(labelEdit.id, labelEdit.value);
            setLabelEdit(null);
          }}
          style={{
            position: "absolute",
            left: labelEdit.x,
            top: labelEdit.y,
            width: Math.max(120, labelEdit.w),
            zIndex: 10001,
            padding: "6px 8px",
            border: "1px solid #e5e7eb",
            borderRadius: 6,
            background: "#ffffff",
            fontSize: 12,
          }}
        />
      )}

      {/* Resize handles for selected adhoc rectangles */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 10000 }}>
        {selectedRects.map((id) => (
          <div
            key={id}
            ref={setHandleRef(id)}
            onMouseDown={onHandleMouseDown(id)}
            title="Drag to resize"
            style={{
              position: "absolute",
              width: 12,
              height: 12,
              background: "#2563eb",
              borderRadius: 2,
              boxShadow: "0 0 0 2px #ffffff",
              cursor: "nwse-resize",
              pointerEvents: "auto",
              transform: "translate(-9999px, -9999px)",
            }}
          />
        ))}
      </div>

      {/* Quick Palette */}
      {palette && (
        <div
          style={{
            position: "absolute",
            left: palette.x,
            top: palette.y,
            transform: "translate(8px, 8px)",
            zIndex: 10000,
            background: "white",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            boxShadow: "0 8px 20px rgba(0,0,0,0.12)",
            padding: 8,
            display: "flex",
            gap: 8,
            alignItems: "center",
            pointerEvents: "auto",
          }}
        >
          <button onClick={() => addAt("text")} title="Add text" style={btnStyle}>✍️ Text</button>
          <button onClick={() => addAt("rect")} title="Add rectangle" style={btnStyle}>⬛ Rectangle</button>
          <button onClick={() => addAt("node")} title="Add node" style={btnStyle}>🔘 Node</button>
          <button onClick={() => setPalette(null)} title="Close" style={{ ...btnStyle, marginLeft: 4 }}>×</button>
        </div>
      )}

      {/* Color Panel for rectangles */}
      {colorPanel && (
        <div
          style={{
            position: "absolute",
            left: colorPanel.x,
            top: colorPanel.y,
            transform: "translate(8px, -8px)",
            zIndex: 10002,
            background: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            boxShadow: "0 8px 20px rgba(0,0,0,0.12)",
            padding: 10,
            display: "flex",
            alignItems: "center",
            gap: 8,
            pointerEvents: "auto",
          }}
        >
          {presetColors.map((c) => (
            <button
              key={c}
              onClick={() => applyRectColor(colorPanel.id, c)}
              title={c}
              style={{
                width: 18,
                height: 18,
                borderRadius: 4,
                border: "1px solid #e5e7eb",
                background: c,
                cursor: "pointer",
              }}
            />
          ))}
          <input
            type="color"
            value={colorPanel.color}
            onChange={(e) => applyRectColor(colorPanel.id, e.target.value)}
            style={{ width: 28, height: 28, border: "none", padding: 0, background: "transparent", cursor: "pointer" }}
          />
          <button onClick={() => setColorPanel(null)} title="Close" style={{ ...btnStyle, padding: "2px 6px" }}>×</button>
        </div>
      )}

      {/* Remote cursor overlay */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 10001 }}>
        {cursorOverlay}
      </div>

      {/* Lines on top */}
      <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 9999 }}>
        {connections.map((c, i) => (
          <line key={i} x1={c.x1} y1={c.y1} x2={c.x2} y2={c.y2} stroke={c.color} strokeWidth={2} strokeOpacity={0.98} />
        ))}
      </svg>
    </div>
  );
});

export default CytoGraph;

const btnStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  background: "#ffffff",
  borderRadius: 6,
  padding: "4px 8px",
  lineHeight: 1.2,
  fontSize: 12,
  cursor: "pointer",
};
