// components/graph/CytoGraph.tsx
"use client";

import { useEffect, useRef } from "react";
import type { ElementDefinition } from "cytoscape";

export default function CytoGraph({
  elements,
  onNodeSelect,
}: {
  elements: ElementDefinition[];
  onNodeSelect?: (id: string) => void;
}) {
  const cyRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cy: any;
    let disposed = false;

    (async () => {
      if (!containerRef.current) return;

      const cytoscape = (await import("cytoscape")).default;

      // Create once
      if (!cyRef.current) {
        cyRef.current = cytoscape({
          container: containerRef.current,
          elements: [],
          style: [
            {
              selector: "node",
              style: {
                "background-color": "#93c5fd",
                label: "data(label)",
                "font-size": 10,
                color: "#111827",
                "text-wrap": "wrap",
                "text-max-width": 120,
              },
            },
            {
              selector: ":parent",
              style: {
                "background-opacity": 0.08,
                "border-color": "#9ca3af",
                "border-width": 1,
                "text-valign": "top",
                "text-halign": "left",
                padding: 12,
              },
            },
            { selector: "node:selected", style: { "border-width": 2, "border-color": "#2563eb" } },
          ],
        });

        // Node click -> select
        cyRef.current.on("tap", "node", (evt: any) => {
          onNodeSelect?.(evt.target.id());
        });
      }

      cy = cyRef.current;
      // Update elements
      cy.elements().remove();
      cy.add(elements);
      const layout = cy.layout({
        name: "cose",
        nodeDimensionsIncludeLabels: true,
        padding: 20,
      });
      layout.run();

      // Fit once elements are placed
      cy.fit(undefined, 30);
    })();

    return () => {
      if (disposed) return;
      // keep cy instance across renders; do not destroy
    };
  }, [elements, onNodeSelect]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
