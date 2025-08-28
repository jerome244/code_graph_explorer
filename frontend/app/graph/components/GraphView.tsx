"use client";
import { useEffect, useRef } from "react";
import cytoscape, { Core, EventObjectNode } from "cytoscape";

type Props = {
  nodes: any[];
  edges: any[];
  /** Fired during drag and on release with the node id + position */
  onNodeMove?: (id: string, pos: { x: number; y: number }) => void;
};

export default function GraphView({ nodes, edges, onNodeMove }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // destroy previous instance
    if (cyRef.current) {
      cyRef.current.destroy();
      cyRef.current = null;
    }

    const hasPositions =
      Array.isArray(nodes) &&
      nodes.some(
        (n: any) =>
          n &&
          n.position &&
          typeof n.position.x === "number" &&
          typeof n.position.y === "number"
      );

    const cy = cytoscape({
      container: containerRef.current,
      elements: { nodes, edges },
      layout: hasPositions
        ? { name: "preset", fit: true }
        : { name: "breadthfirst", fit: true, directed: false, spacingFactor: 1.2 },
      style: [
        {
          selector: "node",
          style: {
            label: "data(label)",
            "text-valign": "center",
            "text-halign": "center",
            "font-size": 10,
            width: 30,
            height: 30,
            "background-color": "#999",
          },
        },
        { selector: 'node[type = "py"]', style: { "background-color": "#3776ab" } },
        { selector: 'node[type = "c"]', style: { "background-color": "#555" } },
        { selector: 'node[type = "html"]', style: { "background-color": "#e34c26" } },
        { selector: 'node[type = "css"]', style: { "background-color": "#264de4" } },
        { selector: 'node[type = "js"]', style: { "background-color": "#f7df1e" } },
        {
          selector: "edge",
          style: {
            width: 1,
            "line-color": "#bbb",
            "target-arrow-color": "#bbb",
            "curve-style": "haystack",
          },
        },
      ],
      wheelSensitivity: 0.2,
    });

    cy.fit();
    cy.nodes().grabify(); // ensure nodes are draggable

    // ---- realtime: send moves ----
    const send = (e: EventObjectNode) => {
      if (!onNodeMove) return;
      const n = e.target;
      const pos = n.position();
      onNodeMove(String(n.id()), { x: pos.x, y: pos.y });
    };

    // During drag for live updates
    cy.on("drag", "node", send);
    // On release to ensure a final precise position
    cy.on("free", "node", send);

    cyRef.current = cy;
    return () => {
      cy.removeListener("drag", "node", send);
      cy.removeListener("free", "node", send);
      cy.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(nodes), JSON.stringify(edges)]);

  return <div ref={containerRef} className="graph-canvas" />;
}
