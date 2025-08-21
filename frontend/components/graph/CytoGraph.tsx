// components/graph/CytoGraph.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ElementDefinition } from "cytoscape";
import { highlightSource } from "@/lib/analyze";

type Popup = { id: string; label: string };
type Conn = { x1: number; y1: number; x2: number; y2: number; color: string };

// helper id
const makeId = (() => { let c = 0; return (p="custom") => `${p}-${Date.now().toString(36)}-${(c++).toString(36)}`; })();

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

// simple throttle
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

export default function CytoGraph({
  elements,
  hiddenIds = [],
  files = {},
  onNodeSelect,
  onHideNode,     // right-click hide for non-rect nodes
  onUpdateFile,   // save edits from popup
  onMoveNode,     // 🔹 NEW: emit when a node moves (drag)
}: {
  elements: ElementDefinition[] | { elements: ElementDefinition[] } | any; // robust
  hiddenIds?: string[];
  files?: Record<string, string>;
  onNodeSelect?: (id: string) => void;
  onHideNode?: (id: string) => void;
  onUpdateFile?: (path: string, content: string) => void;
  onMoveNode?: (id: string, position: { x: number; y: number }) => void;
}) {
  // normalize to always be an array
  const els: ElementDefinition[] = Array.isArray(elements)
    ? elements
    : (elements as any)?.elements ?? [];

  const cyRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // popups for file nodes
  const [popups, setPopups] = useState<Popup[]>([]);
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
    cancelEdit(id); // keep this if you want to exit edit mode on save
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

  // ── Cytoscape init ─────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      if (!containerRef.current || cyRef.current) return;
      const cytoscape = (await import("cytoscape")).default;
      const cy = cytoscape({
        container: containerRef.current,
        elements: [],
        wheelSensitivity: 0.2,
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

      // tap node: open popup for file nodes and plain adhoc nodes (not for rect/text)
      cy.on("tap", "node", (evt: any) => {
        const n = evt.target;
        const id = n.id();
        const label = n.data("label") || id;
        if (!n || n.hidden()) return;

        setPalette(null);
        setColorPanel(null);

        // 🔸 Keep rectangles and text as selection-only (no popup)
        if (isAdhoc(n) && (isRect(n) || isText(n))) {
          return;
        }

        // ✅ File nodes and plain adhoc "node" → toggle popup
        setPopups((prev) => {
          const open = prev.some((p) => p.id === id);
          if (open) {
            setEditing((s) => { const nn = new Set(s); nn.delete(id); return nn; });
            setMutedPopups((s) => { const nn = new Set(s); nn.delete(id); return nn; });
            return prev.filter((p) => p.id !== id);
          }
          onNodeSelect?.(id);
          return [...prev, { id, label }];
        });
      });

      // double-click node: inline label editor for adhoc nodes
      cy.on("dbltap", "node", (evt: any) => {
        const n = evt.target;
        if (!isAdhoc(n)) return;
        const bb = n.renderedBoundingBox();
        setLabelEdit({
          id: n.id(),
          value: n.data("label") || "",
          x: bb.x1,
          y: bb.y1 - 28,
          w: Math.max(120, bb.w),
        });
      });

      // Right click:
      cy.on("cxttap", "node", (evt: any) => {
        const n = evt.target;
        const id = n.id();

        // Rectangles: open color panel instead of hide/delete
        if (isAdhoc(n) && isRect(n)) {
          const rp = evt.renderedPosition;
          const current = n.data("bg") || n.style("background-color") || "#fde68a";
          setColorPanel({ id, x: rp.x, y: rp.y, color: current });
          return;
        }

        // Others keep old behavior (hide)
        onHideNode?.(id);
        setPalette(null);
        setColorPanel(null);
        setPopups((prev) => prev.filter((p) => p.id !== id));
        setEditing((s) => { const S = new Set(s); S.delete(id); return S; });
        setMutedPopups((s) => { const S = new Set(s); S.delete(id); return S; });
        scheduleConnections();
      });

      // Double-click on empty background → open palette
      cy.on("dbltap", (evt: any) => {
        if (evt.target !== cy) return; // background only
        const rp = evt.renderedPosition; // px in container
        const mp = evt.position;         // model coords
        setPalette({ x: rp.x, y: rp.y, model: { x: mp.x, y: mp.y } });
        setColorPanel(null);
      });

      // selection change -> update selected rects (for resize handle)
      cy.on("select unselect", "node.adhoc.shape-rect", () => {
        const sel = cy.$("node.adhoc.shape-rect:selected").map((n: any) => n.id());
        setSelectedRects(sel);
      });

      // 🔹 Emit MOVE_NODE while dragging (throttled)
      const emitMove = throttle((id: string, pos: { x: number; y: number }) => {
        onMoveNode?.(id, pos);
      }, 60);

      const onPos = (e: any) => {
        const n = e.target;
        // only while user is dragging, so we don't spam on initial layout
        if (n.grabbed()) {
          emitMove(n.id(), n.position());
        }
      };
      cy.on("position", "node", onPos);

      // rAF-throttled reposition, handles, editors, panel follow, and lines overlay
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
          scheduleConnections();
        });
      };
      cy.on("viewport layoutstop", schedule);
      cy.on("position drag free", "node", schedule);
      window.addEventListener("resize", scheduleConnections);

      // keyboard: Delete/Backspace removes selected adhoc nodes
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
        cy.off("position", "node", onPos); // cleanup MOVE_NODE listener
      };
    })();
  }, [onNodeSelect, onHideNode, onMoveNode, labelEdit?.id, colorPanel?.id]);

  // ── Preserve positions when els change; keep adhoc nodes; layout only on real change ──
  const prevNodeIdsRef = useRef<Set<string>>(new Set());
  const didInitialLayoutRef = useRef(false);

  useEffect(() => {
    const cy = cyRef.current; if (!cy) return;

    // Build new node id set from els
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

    // Snapshot positions of existing non-adhoc nodes
    const currentPos = new Map<string, { x: number; y: number }>();
    cy.nodes(":not(.adhoc)").forEach((n: any) => currentPos.set(n.id(), n.position()));

    // Gather incoming explicit positions from props (so remote MOVE_NODE can apply)
    const incomingPos = new Map<string, { x: number; y: number }>();
    (els || []).forEach((e: any) => {
      if ((e.group ?? e?.data?.group ?? "nodes") !== "nodes") return;
      const id = e?.data?.id;
      if (!id) return;
      if (e.position && typeof e.position.x === "number" && typeof e.position.y === "number") {
        incomingPos.set(id, { x: e.position.x, y: e.position.y });
      }
    });

    // Optionally capture current viewport (pan/zoom) — not strictly required
    const pan = cy.pan();
    const zoom = cy.zoom();

    cy.startBatch();

    // Remove only non-adhoc elements, keep user-added shapes
    cy.elements(":not(.adhoc)").remove();

    // Re-add new elements
    if (els.length) cy.add(els);

    if (sameNodeSet && hadPrev) {
      // Prefer explicit incoming positions; otherwise keep existing positions
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
      // First load or node set actually changed → run layout
      const layout = cy.layout({
        name: "cose",
        nodeDimensionsIncludeLabels: true,
        padding: 20,
      });
      layout.run();

      // Only fit on the very first layout
      if (!didInitialLayoutRef.current) {
        cy.fit(undefined, 80);
        didInitialLayoutRef.current = true;
      }
    }

    cy.endBatch();

    // Update previous ids
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
    setPopups(prev => prev.filter(p => !hideSet.has(p.id)));
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
    scheduleConnections();
  };
  const togglePopupLines = (id: string) => {
    setMutedPopups(old => { const n = new Set(old); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };

  // palette add
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
    setPalette(null);
  };

  // start/stop resizing
  const onHandleMouseDown = (id: string) => (e: React.MouseEvent) => {
    e.stopPropagation();
    const cy = cyRef.current; if (!cy) return;
    const node = cy.getElementById(id);
    if (!node || !node.length) return;
    resizingRef.current = {
      id,
      startX: e.clientX,
      startY: e.clientY,
      startRW: node.renderedWidth(),
      startRH: node.renderedHeight(),
      startZoom: cy.zoom(),
    };
    const onMove = (ev: MouseEvent) => {
      const r = resizingRef.current; if (!r) return;
      const dx = ev.clientX - r.startX;
      const dy = ev.clientY - r.startY;
      const newRW = Math.max(40, r.startRW + dx);
      const newRH = Math.max(30, r.startRH + dy);
      const w = newRW / r.startZoom;
      const h = newRH / r.startZoom;
      node.style({ width: w, height: h });
      const el = handleRefs.current.get(id);
      if (el) {
        const bb = node.renderedBoundingBox();
        el.style.transform = `translate(${bb.x2 - 6}px, ${bb.y2 - 6}px)`;
      }
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      resizingRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // update rectangle color
  const applyRectColor = (id: string, color: string) => {
    const cy = cyRef.current; if (!cy) return;
    const n = cy.getElementById(id);
    if (!n || !n.length) return;
    n.data("bg", color);
    n.data("border", darkenHex(color, 0.35));
    setColorPanel(prev => (prev ? { ...prev, color } : prev));
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

              {/* Scrollable code area with a line-number gutter that fills the popup */}
              <div
                className="popup-code"
                style={{
                  border: "1px solid #f3f4f6",
                  borderRadius: 6,
                  background: inEdit ? "#ffffff" : "#f9fafb",
                  overflow: "auto",   // single scroll container (gutter + code)
                  flex: 1,
                  minHeight: 0,
                  minWidth: 0,
                  position: "relative",
                }}
                onClick={() => {
                  if (!inEdit) startEdit(p.id, raw); // click-to-edit
                }}
              >
                {(() => {
                  const codeFont =
                    'ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace';
                  const lineHeight = 1.45;   // keep consistent in both modes
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
                            <code dangerouslySetInnerHTML={{ __html: html }} />
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
                              overflow: "hidden",   // parent scrolls
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
            const cy = cyRef.current; if (!cy) return;
            if (e.key === "Enter") {
              cy.getElementById(labelEdit.id).data("label", labelEdit.value);
              setLabelEdit(null);
            } else if (e.key === "Escape") setLabelEdit(null);
          }}
          onBlur={() => {
            const cy = cyRef.current; if (!cy) return;
            cy.getElementById(labelEdit.id).data("label", labelEdit.value);
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
              transform: "translate(-9999px, -9999px)", // repositioned by schedule()
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

      {/* Lines on top (below color panel & palette) */}
      <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 9999 }}>
        {connections.map((c, i) => (
          <line key={i} x1={c.x1} y1={c.y1} x2={c.x2} y2={c.y2} stroke={c.color} strokeWidth={2} strokeOpacity={0.98} />
        ))}
      </svg>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  background: "#ffffff",
  borderRadius: 6,
  padding: "4px 8px",
  lineHeight: 1.2,
  fontSize: 12,
  cursor: "pointer",
};
