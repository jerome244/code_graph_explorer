"use client";
import { useEffect, useRef } from "react";
import cytoscape, { Core } from "cytoscape";

type Props = { nodes: any[]; edges: any[] };

export default function GraphView({ nodes, edges }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    if (cyRef.current) {
      cyRef.current.destroy();
      cyRef.current = null;
    }

    const cy = cytoscape({
      container: containerRef.current,
      elements: { nodes, edges },
      layout: { name: "breadthfirst", fit: true, directed: false, spacingFactor: 1.2 },
      style: [
        { selector: "node", style: { label: "data(label)", "text-valign": "center", "text-halign": "center", "font-size": 10, width: 30, height: 30, "background-color": "#999" } },
        { selector: 'node[type = "py"]', style: { "background-color": "#3776ab" } },
        { selector: 'node[type = "c"]', style: { "background-color": "#555" } },
        { selector: 'node[type = "html"]', style: { "background-color": "#e34c26" } },
        { selector: 'node[type = "css"]', style: { "background-color": "#264de4" } },
        { selector: 'node[type = "js"]', style: { "background-color": "#f7df1e" } },
        { selector: "edge", style: { width: 1, "line-color": "#bbb", "target-arrow-color": "#bbb", "curve-style": "haystack" } },
      ],
      wheelSensitivity: 0.2,
    });

    cy.fit();
    cyRef.current = cy;
    return () => cy.destroy();
  }, [JSON.stringify(nodes), JSON.stringify(edges)]);

  return <div ref={containerRef} className="graph-canvas" />;
}
