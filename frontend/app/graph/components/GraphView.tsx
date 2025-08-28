"use client";
import { useEffect, useImperativeHandle, useMemo, useRef } from "react";
import cytoscape, { Core, EventObjectNode } from "cytoscape";

type Props = {
  nodes: any[];              // Cytoscape elements: { data: { id, label, ... }, position? }
  edges: any[];
  /** live during drag */
  onNodeMove?: (id: string, pos: { x: number; y: number }) => void;
  /** once on release to commit */
  onNodeMoveEnd?: (id: string, pos: { x: number; y: number }) => void;
  /** parent gets an API with moveNode so it can apply remote moves directly */
  onReady?: (api: { moveNode: (id: string, x: number, y: number) => void }) => void;
};

export default function GraphView({ nodes, edges, onNodeMove, onNodeMoveEnd, onReady }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);

  // signature of element sets (ids only) — used to detect structural changes, not position changes
  const sig = useMemo(() => {
    const ns = (nodes || []).map((n: any) => String(n?.data?.id ?? n?.id)).sort().join(",");
    const es = (edges || []).map((e: any) => String(e?.data?.id ?? `${e?.data?.source}->${e?.data?.target}`)).sort().join(",");
    return `${ns}|${es}`;
  }, [nodes, edges]);

  // init once
  useEffect(() => {
    if (!containerRef.current) return;
    if (cyRef.current) return;

    // if any node has an explicit position, use preset, otherwise do an automatic layout once
    const hasPositions =
      Array.isArray(nodes) &&
      nodes.some((n: any) => n?.position && typeof n.position.x === "number" && typeof n.position.y === "number");

    const cy = cytoscape({
      container: containerRef.current,
      elements: { nodes, edges },
      layout: hasPositions ? { name: "preset", fit: true } : { name: "breadthfirst", fit: true, spacingFactor: 1.2 },
      style: [
        { selector: "node", style: { label: "data(label)", "text-valign": "center", "text-halign": "center", "font-size": 10, width: 30, height: 30, "background-color": "#999" } },
        { selector: 'node[type = "py"]',   style: { "background-color": "#3776ab" } },
        { selector: 'node[type = "c"]',    style: { "background-color": "#555"    } },
        { selector: 'node[type = "html"]', style: { "background-color": "#e34c26" } },
        { selector: 'node[type = "css"]',  style: { "background-color": "#264de4" } },
        { selector: 'node[type = "js"]',   style: { "background-color": "#f7df1e" } },
        { selector: "edge", style: { width: 1, "line-color": "#bbb", "target-arrow-color": "#bbb", "curve-style": "haystack" } },
      ],
      wheelSensitivity: 0.2,
    });

    // make sure nodes can be dragged
    cy.nodes().unlock().grabify();

    const emitMove = (e: EventObjectNode) => {
      const n = e.target;
      const p = n.position();
      onNodeMove?.(String(n.id()), { x: p.x, y: p.y });
    };
    const emitEnd = (e: EventObjectNode) => {
      const n = e.target;
      const p = n.position();
      onNodeMoveEnd?.(String(n.id()), { x: p.x, y: p.y });
    };

    cy.on("drag", "node", emitMove); // smooth live updates
    cy.on("free", "node", emitEnd);  // commit on release

    // expose API to parent for remote moves
    onReady?.({
      moveNode: (id: string, x: number, y: number) => {
        const el = cy.getElementById(String(id));
        if (el && el.nonempty()) {
          el.unlock(); // just in case
          el.position({ x, y });
        }
      },
    });

    cyRef.current = cy;

    return () => {
      try {
        cy.removeListener("drag", "node", emitMove);
        cy.removeListener("free", "node", emitEnd);
        cy.destroy();
      } catch {}
      cyRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount once

  // reflect structural changes (added/removed nodes/edges) without recreating the instance
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    // current ids
    const currentIds = new Set(cy.nodes().map((n) => n.id()));
    const nextIds = new Set((nodes || []).map((n: any) => String(n?.data?.id ?? n?.id)));

    // remove nodes no longer present
    cy.nodes().forEach((n) => {
      if (!nextIds.has(n.id())) n.remove();
    });

    // add new nodes
    (nodes || []).forEach((n: any) => {
      const id = String(n?.data?.id ?? n?.id);
      if (!currentIds.has(id)) cy.add(n);
    });

    // edges: simple replace strategy (safe for typical sizes)
    cy.edges().remove();
    cy.add(edges || []);

    // if positions provided, apply them (no layout run)
    (nodes || []).forEach((n: any) => {
      if (n?.position && typeof n.position.x === "number" && typeof n.position.y === "number") {
        cy.getElementById(String(n?.data?.id ?? n?.id)).position(n.position);
      }
    });

    cy.resize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]); // only when ids set changes

  // reflect position-only updates (cheap)
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    (nodes || []).forEach((n: any) => {
      if (n?.position && typeof n.position.x === "number" && typeof n.position.y === "number") {
        cy.getElementById(String(n?.data?.id ?? n?.id)).position(n.position);
      }
    });
  }, [nodes]);

  return <div ref={containerRef} className="graph-canvas" />;
}
