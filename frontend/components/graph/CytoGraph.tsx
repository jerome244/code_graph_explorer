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
              selector: "node:selected",
              style: { "border-width": 2, "border-color": "#2563eb" },
            },
          ],
        });

        // Node click -> select
        cyRef.current.on("tap", "node", (evt: any) => {
          onNodeSelect?.(evt.target.id());
        });
      }

      const cy = cyRef.current;

      // Update elements
      cy.elements().remove();
      if (elements?.length) {
        cy.add(elements);
        const layout = cy.layout({
          name: "cose",
          nodeDimensionsIncludeLabels: true,
          padding: 20,
        });
        layout.run();
        cy.fit(undefined, 30);
      }
    })();
  }, [elements, onNodeSelect]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
