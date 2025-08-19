// components/graph/CytoGraph.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ElementDefinition } from "cytoscape";
import { highlightSource } from "@/lib/analyze";

type Popup = { id: string; label: string };
type Conn = { x1: number; y1: number; x2: number; y2: number; color: string };

export default function CytoGraph({
  elements,
  hiddenIds = [],
  files = {},
  onNodeSelect,
  onHideNode,     // from graph right-click
  onUpdateFile,   // <-- NEW: save edits back to parent
}: {
  elements: ElementDefinition[];
  hiddenIds?: string[];
  files?: Record<string, string>;
  onNodeSelect?: (id: string) => void;
  onHideNode?: (id: string) => void;
  onUpdateFile?: (path: string, content: string) => void;
}) {
  const cyRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [popups, setPopups] = useState<Popup[]>([]);
  const popupRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Per-popup Hide/Show lines (muted popups don't generate anchors)
  const [mutedPopups, setMutedPopups] = useState<Set<string>>(new Set());
  const mutedRef = useRef<Set<string>>(new Set());
  useEffect(() => { mutedRef.current = mutedPopups; }, [mutedPopups]);

  // Inline editing state per popup
  const [editing, setEditing] = useState<Set<string>>(new Set());
  const [buffers, setBuffers] = useState<Record<string, string>>({});
  const isEditing = (id: string) => editing.has(id);

  const startEdit = (id: string, initial: string) => {
    setEditing((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
    setBuffers((prev) => (id in prev ? prev : { ...prev, [id]: initial }));
    setMutedPopups((prev) => new Set(prev).add(id)); // mute lines while editing
  };
  const cancelEdit = (id: string) => {
    setEditing((prev) => {
      const next = new Set(prev); next.delete(id); return next;
    });
    setMutedPopups((prev) => {
      const next = new Set(prev); next.delete(id); return next;
    });
    setBuffers((prev) => {
      const { [id]: _, ...rest } = prev; return rest;
    });
  };
  const saveEdit = (id: string) => {
    const content = buffers[id];
    if (typeof content === "string") {
      onUpdateFile?.(id, content);
    }
    // exit edit mode (parent will re-parse & re-render edges/files)
    cancelEdit(id);
  };

  // Function names used for code highlighting (from edges with data.fn)
  const fnNames = useMemo(() => {
    const names = new Set<string>();
    for (const el of elements || []) {
      if ((el as any).group !== "edges") continue;
      const fn = (el as any).data?.fn;
      if (typeof fn === "string" && fn) names.add(fn);
    }
    return Array.from(names);
  }, [elements]);

  // ---------------- Cross-popup connection overlay ----------------
  const [connections, setConnections] = useState<Conn[]>([]);
  const rafConn = useRef<number>(0);
  const scheduleConnections = () => {
    if (rafConn.current) return;
    rafConn.current = requestAnimationFrame(() => { rafConn.current = 0; recomputeConnections(); });
  };

  const recomputeConnections = () => {
    const container = containerRef.current;
    if (!container) return;
    const crect = container.getBoundingClientRect();

    type Anchor = { x: number; y: number; color: string; popupId: string; fn: string };
    const perFn: Record<string, Anchor[]> = {};

    popupRefs.current.forEach((popupEl, popupId) => {
      if (mutedRef.current.has(popupId)) return;      // muted (including editing) -> skip
      const hits = Array.from(popupEl.querySelectorAll<HTMLElement>(".fn-hit[data-fn]"));
      if (!hits.length) return;

      const firstPerFn: Record<string, HTMLElement> = {};
      for (const el of hits) {
        const fn = el.dataset.fn!;
        if (!firstPerFn[fn]) firstPerFn[fn] = el;
      }
      for (const [fn, el] of Object.entries(firstPerFn)) {
        const r = el.getBoundingClientRect();
        const x = r.left + r.width / 2 - crect.left;
        const y = r.top + r.height / 2 - crect.top;
        const color = el.dataset.color || "#999";
        (perFn[fn] ||= []).push({ x, y, color, popupId, fn });
      }
    });

    const conns: Conn[] = [];
    Object.values(perFn).forEach((anchors) => {
      if (anchors.length < 2) return;
      for (let i = 0; i < anchors.length - 1; i++) {
        for (let j = i + 1; j < anchors.length; j++) {
          const a = anchors[i], b = anchors[j];
          conns.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, color: a.color });
        }
      }
    });
    setConnections(conns);
  };

  // Manage popup refs + listeners (scroll/resize)
  const cleanupRefs = useRef<Map<string, () => void>>(new Map());
  const setPopupRef = (id: string) => (el: HTMLDivElement | null) => {
    if (!el) {
      cleanupRefs.current.get(id)?.();
      cleanupRefs.current.delete(id);
      popupRefs.current.delete(id);
      scheduleConnections();
      return;
    }
    popupRefs.current.set(id, el);

    const codePane = el.querySelector<HTMLElement>(".popup-code");
    const onScroll = () => scheduleConnections();
    const ro = new ResizeObserver(() => scheduleConnections());
    if (codePane) { codePane.addEventListener("scroll", onScroll, { passive: true }); ro.observe(codePane); }
    ro.observe(el);

    cleanupRefs.current.set(id, () => { codePane?.removeEventListener("scroll", onScroll); ro.disconnect(); });

    // initial placement + lines
    scheduleConnections();

    // snap near node if cy exists
    const cy = cyRef.current;
    if (cy) {
      const node = cy.getElementById(id);
      if (node && node.length) {
        const pos = node.renderedPosition();
        el.style.transform = `translate(${pos.x + 14}px, ${pos.y - 14}px)`;
      }
    }
  };

  // ---------------- Cytoscape init (run once) ----------------
  useEffect(() => {
    (async () => {
      if (!containerRef.current || cyRef.current) return;
      const cytoscape = (await import("cytoscape")).default;
      const cy = cytoscape({
        container: containerRef.current,
        elements: [],
        wheelSensitivity: 0.2,
        style: [
          {
            selector: "node",
            style: {
              width: 12,
              height: 12,
              "background-color": "#111111ff",
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
          { selector: "node:selected", style: { "border-width": 2, "border-color": "#2563eb" } },
        ],
      });

      // Left click toggles popup
      cy.on("tap", "node", (evt: any) => {
        const id = evt.target.id();
        const label = evt.target.data("label") || id;

        const node = cy.getElementById(id);
        if (!node || node.hidden()) return;

        setPopups((prev) => {
          const open = prev.some((p) => p.id === id);
          if (open) {
            // close; also exit edit/mute
            setEditing((s) => { const n = new Set(s); n.delete(id); return n; });
            setMutedPopups((s) => { const n = new Set(s); n.delete(id); return n; });
            return prev.filter((p) => p.id !== id);
          }
          onNodeSelect?.(id);
          return [...prev, { id, label }];
        });
      });

      // Right click: hide node (parent updates hiddenIds); close popup & exit edit
      cy.on("cxttap", "node", (evt: any) => {
        const id = evt.target.id();
        onHideNode?.(id);
        setPopups((prev) => prev.filter((p) => p.id !== id));
        setEditing((s) => { const n = new Set(s); n.delete(id); return n; });
        setMutedPopups((s) => { const n = new Set(s); n.delete(id); return n; });
        scheduleConnections();
      });

      // rAF-throttled reposition + lines on move/zoom/layout
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
          scheduleConnections();
        });
      };

      cy.on("viewport layoutstop", schedule);
      cy.on("position drag free", "node", schedule);
      window.addEventListener("resize", scheduleConnections);

      cyRef.current = cy;

      return () => {
        window.removeEventListener("resize", scheduleConnections);
        cy.off("viewport", schedule);
        cy.off("layoutstop", schedule);
        cy.off("position", "node", schedule);
        cy.off("drag", "node", schedule);
        cy.off("free", "node", schedule);
        if (raf) cancelAnimationFrame(raf);
      };
    })();
  }, [onNodeSelect, onHideNode]);

  // ---------------- Rebuild graph only when `elements` change ----------------
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    cy.startBatch();
    cy.elements().remove();

    if (elements?.length) {
      cy.add(elements);
      const layout = cy.layout({ name: "cose", nodeDimensionsIncludeLabels: true, padding: 20 });
      layout.run();
      cy.fit(undefined, 80);
    }
    cy.endBatch();

    // Keep popups as-is (don’t clear on reparse so editing UX is nice)
    scheduleConnections();
  }, [elements]);

  // ---------------- Apply hide/show incrementally when `hiddenIds` change ----------------
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    const hideSet = new Set(hiddenIds);

    cy.startBatch();
    cy.nodes().forEach((n: any) => {
      if (hideSet.has(n.id())) n.hide();
      else n.show();
    });
    cy.endBatch();

    // Close popups of hidden nodes + exit edit for them
    setPopups((prev) => prev.filter((p) => !hideSet.has(p.id)));
    setEditing((prev) => {
      const next = new Set(prev);
      hiddenIds.forEach((id) => next.delete(id));
      return next;
    });
    setMutedPopups((prev) => {
      const next = new Set(prev);
      hiddenIds.forEach((id) => next.delete(id));
      return next;
    });

    scheduleConnections();
  }, [hiddenIds]);

  // Recompute lines when popups/files/fns/muted change
  useEffect(() => { scheduleConnections(); }, [popups, files, fnNames, mutedPopups]);

  const closePopup = (id: string) => {
    setPopups((prev) => prev.filter((p) => p.id !== id));
    setEditing((s) => { const n = new Set(s); n.delete(id); return n; });
    setMutedPopups((s) => { const n = new Set(s); n.delete(id); return n; });
    scheduleConnections();
  };

  const togglePopupLines = (id: string) => {
    setMutedPopups((old) => {
      const next = new Set(old);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* Cytoscape canvas */}
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />

      {/* Popups */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 9 }}>
        {popups.map((p) => {
          const raw = files[p.id] ?? "";
          const inEdit = isEditing(p.id);
          const draft = buffers[p.id] ?? raw;
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
                <strong style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {p.label}
                </strong>

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
                      style={{
                        border: "1px solid #10b981",
                        background: "#ecfdf5",
                        color: "#065f46",
                        borderRadius: 6,
                        padding: "2px 8px",
                        lineHeight: 1.2,
                        fontSize: 11,
                        cursor: "pointer",
                      }}
                    >
                      Save
                    </button>
                    <button
                      onClick={() => cancelEdit(p.id)}
                      title="Cancel (Esc)"
                      style={{
                        border: "1px solid #e5e7eb",
                        background: "#ffffff",
                        borderRadius: 6,
                        padding: "2px 8px",
                        lineHeight: 1.2,
                        fontSize: 11,
                        cursor: "pointer",
                      }}
                    >
                      Cancel
                    </button>
                  </>
                )}

                <button
                  onClick={() => closePopup(p.id)}
                  title="Close"
                  style={{
                    marginLeft: "auto",
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    padding: 0,
                    lineHeight: 1,
                    fontSize: 14,
                  }}
                >
                  ×
                </button>
              </div>

              {/* Code area */}
              <div
                className="popup-code"
                style={{
                  border: "1px solid #f3f4f6",
                  borderRadius: 6,
                  background: inEdit ? "#fff" : "#f9fafb",
                  overflow: "auto",
                  flex: 1,
                  minHeight: 0,
                  minWidth: 0,
                  position: "relative",
                }}
                onClick={() => {
                  if (!inEdit) startEdit(p.id, raw); // click-to-edit
                }}
              >
                {!inEdit ? (
                  <pre
                    style={{
                      margin: 0,
                      padding: "8px 10px",
                      fontFamily:
                        'ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace',
                      fontSize: 11,
                      lineHeight: 1.45,
                      whiteSpace: "pre",
                      cursor: "text",
                    }}
                  >
                    <code dangerouslySetInnerHTML={{ __html: html }} />
                  </pre>
                ) : (
                <textarea
                  value={draft}
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
                  style={{
                    boxSizing: "border-box",
                    width: "100%",
                    height: "100%",
                    border: "none",
                    outline: "none",
                    resize: "none",
                    fontFamily:
                      'ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace',
                    fontSize: 11,
                    lineHeight: 1.45,
                    padding: "8px 10px",
                    // ✅ Ensure readable text in edit mode:
                    background: "#ffffff",       // or "#0b1220" if you prefer dark
                    color: "#111827",
                    caretColor: "#111827",
                    WebkitTextFillColor: "#111827" as any, // fixes some Safari themes
                  }}
                />

                )}

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

              <div style={{ color: "#6b7280" }}>
                <code style={{ fontSize: 11 }}>{p.id}</code>
              </div>
            </div>
          );
        })}
      </div>

      {/* Lines on FIRST PLAN (front-most) */}
      <svg
        width="100%"
        height="100%"
        style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 9999 }}
      >
        {connections.map((c, i) => (
          <line
            key={i}
            x1={c.x1}
            y1={c.y1}
            x2={c.x2}
            y2={c.y2}
            stroke={c.color}
            strokeWidth={2}
            strokeOpacity={0.98}
          />
        ))}
      </svg>
    </div>
  );
}
