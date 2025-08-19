// components/graph/CytoGraph.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ElementDefinition } from "cytoscape";

type Popup = { id: string; label: string };

export default function CytoGraph({
  elements,
  hiddenIds = [],
  files = {},
  onNodeSelect,
}: {
  elements: ElementDefinition[];
  hiddenIds?: string[];
  files?: Record<string, string>;
  onNodeSelect?: (id: string) => void;
}) {
  const cyRef = useRef<any>(null);

  // wrapper/overlay so HTML popups sit above the canvas
  const containerRef = useRef<HTMLDivElement | null>(null);

  // popups & refs (Map keeps latest set independent of React closures)
  const [popups, setPopups] = useState<Popup[]>([]);
  const popupRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // keep hidden set fresh without re-subscribing listeners
  const hiddenSet = useMemo(() => new Set(hiddenIds || []), [hiddenIds]);

  // Create Cytoscape once
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
              "background-color": "#93c5fd",
              label: "data(label)",
              "font-size": 8,
              "min-zoomed-font-size": 6,
              color: "#111827",
              "text-wrap": "wrap",
              "text-max-width": 120,
              "text-outline-color": "#ffffff",
              "text-outline-width": 1,
            },
          },
          { selector: "node:selected", style: { "border-width": 2, "border-color": "#2563eb" } },
        ],
      });

      // Open popup on node tap (allow multiple)
      cy.on("tap", "node", (evt: any) => {
        const id = evt.target.id();
        const label = evt.target.data("label") || id;
        setPopups((prev) => (prev.some((p) => p.id === id) ? prev : [...prev, { id, label }]));
        onNodeSelect?.(id);
      });

      // rAF-throttled reposition that uses the REFS (no stale state)
      let raf = 0;
      const schedule = () => {
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0;
          repositionAll();
        });
      };

      const repositionAll = () => {
        popupRefs.current.forEach((_el, id) => positionPopup(id));
      };

      const positionPopup = (id: string) => {
        const el = popupRefs.current.get(id);
        if (!el) return;
        const node = cy.getElementById(id);
        if (!node || node.length === 0 || !node.isNode()) return;

        // hide popup if node hidden
        if (node.hidden()) {
          el.style.display = "none";
          return;
        }
        el.style.display = "block";

        const pos = node.renderedPosition(); // pixels in the cy container
        const x = pos.x + 14;
        const y = pos.y - 14;
        el.style.transform = `translate(${x}px, ${y}px)`;
      };

      // Listen to pan/zoom/layout/node moves
      cy.on("viewport", schedule);                // pan/zoom
      cy.on("layoutstop", schedule);              // after layouts
      cy.on("position", "node", schedule);        // programmatic position changes
      cy.on("drag", "node", schedule);            // user drag
      cy.on("free", "node", schedule);            // drag end

      window.addEventListener("resize", schedule);

      // expose for debugging if needed:
      // (window as any)._cy = cy;

      cyRef.current = cy;

      return () => {
        window.removeEventListener("resize", schedule);
        cy.off("viewport", schedule);
        cy.off("layoutstop", schedule);
        cy.off("position", "node", schedule);
        cy.off("drag", "node", schedule);
        cy.off("free", "node", schedule);
        if (raf) cancelAnimationFrame(raf);
        // keep cy alive across HMR; destroy if you prefer:
        // cy.destroy(); cyRef.current = null;
      };
    })();
  }, [onNodeSelect]);

  // Rebuild graph ONLY when ELEMENTS change
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    cy.startBatch();
    cy.elements().remove();

    if (elements?.length) {
      cy.add(elements);
      const layout = cy.layout({
        name: "cose",
        nodeDimensionsIncludeLabels: true,
        padding: 20,
      });
      layout.run();
      cy.fit(undefined, 80);
    }
    cy.endBatch();

    // show/hide per hiddenSet
    cy.nodes().forEach((n: any) => (hiddenSet.has(n.id()) ? n.hide() : n.show()));

    // Optionally clear popups on new dataset
    setPopups([]);
    // initial placement
    requestAnimationFrame(() => {
      popupRefs.current.forEach((_el, id) => {
        const node = cy.getElementById(id);
        if (node && node.length) {
          const pos = node.renderedPosition();
          const el = popupRefs.current.get(id);
          if (el) el.style.transform = `translate(${pos.x + 14}px, ${pos.y - 14}px)`;
        }
      });
    });
  }, [elements]); // <- do NOT include hiddenSet here

  // Apply hide/show when hiddenIds change (no rebuild)
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.nodes().forEach((n: any) => (hiddenSet.has(n.id()) ? n.hide() : n.show()));
    // also reflect in popups
    popupRefs.current.forEach((_el, id) => {
      const node = cy.getElementById(id);
      const el = popupRefs.current.get(id);
      if (!node || !el) return;
      el.style.display = node.hidden() ? "none" : "block";
    });
  }, [hiddenSet]);

  // Keep popups placed when the list changes (open/close)
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    requestAnimationFrame(() => {
      popupRefs.current.forEach((_el, id) => {
        const node = cy.getElementById(id);
        if (!node || node.length === 0) return;
        const pos = node.renderedPosition();
        const el = popupRefs.current.get(id);
        if (el) el.style.transform = `translate(${pos.x + 14}px, ${pos.y - 14}px)`;
      });
    });
  }, [popups, files]);

  // ref setter that registers/unregisters in the map and places immediately
  const setPopupRef = (id: string) => (el: HTMLDivElement | null) => {
    if (!el) {
      popupRefs.current.delete(id);
    } else {
      popupRefs.current.set(id, el);
      const cy = cyRef.current;
      if (cy) {
        const node = cy.getElementById(id);
        if (node && node.length) {
          const pos = node.renderedPosition();
          el.style.transform = `translate(${pos.x + 14}px, ${pos.y - 14}px)`;
        }
      }
    }
  };

  const closePopup = (id: string) => setPopups((prev) => prev.filter((p) => p.id !== id));

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* Cytoscape canvas */}
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />

      {/* Popup overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none", // graph interactions pass through
        }}
      >
        {popups.map((p) => {
          const code = files[p.id] ?? "";
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
                pointerEvents: "auto", // enable click/scroll in popup
                width: 360,
                maxWidth: "40vw",
                maxHeight: "45vh",
                display: "block",
                zIndex: 5,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <strong style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {p.label}
                </strong>
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

              <div
                style={{
                  border: "1px solid #f3f4f6",
                  borderRadius: 6,
                  overflow: "auto",
                  maxHeight: "36vh",
                  background: "#f9fafb",
                }}
              >
                <pre
                  style={{
                    margin: 0,
                    padding: "8px 10px",
                    fontFamily:
                      'ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace',
                    fontSize: 11,
                    lineHeight: 1.45,
                    whiteSpace: "pre",
                  }}
                >
                  <code>{code}</code>
                </pre>
              </div>

              <div style={{ color: "#6b7280", marginTop: 6 }}>
                <code style={{ fontSize: 11 }}>{p.id}</code>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
