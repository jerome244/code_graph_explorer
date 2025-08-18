"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import CytoscapeComponent from "react-cytoscapejs";
import cytoscape, { Stylesheet } from "cytoscape";
import dagre from "cytoscape-dagre";

cytoscape.use(dagre);

type NodeIn = { id: string; type: string; label?: string; lang?: string; file?: string };
type EdgeIn = { source: string; target: string; type: "declares" | "calls" | "styled-by" };

type Props = { nodes: NodeIn[]; edges: EdgeIn[] };

function toElements(nodes: NodeIn[], edges: EdgeIn[]) {
  // build unique edge ids to avoid duplicates
  const elements: any[] = [];
  for (const n of nodes) {
    elements.push({
      data: {
        id: n.id,
        label: n.label ?? n.id,
        type: n.type,
        lang: n.lang,
        file: n.file,
      },
      selectable: true,
      grabbable: true,
    });
  }
  const seen = new Set<string>();
  for (const e of edges) {
    const id = `${e.type}:${e.source}->${e.target}`;
    if (seen.has(id)) continue;
    seen.add(id);
    elements.push({
      data: { id, source: e.source, target: e.target, type: e.type },
      selectable: true,
    });
  }
  return elements;
}

const stylesheet: Stylesheet[] = [
  { selector: "node", style: {
      "label": "data(label)",
      "font-size": 10,
      "text-valign": "center",
      "text-halign": "center",
      "text-wrap": "wrap",
      "text-max-width": 160,
      "background-color": "#e5e7eb",
      "border-width": 1,
      "border-color": "#9ca3af",
      "width": "label",
      "height": "label",
      "padding": "6px",
      "shape": "round-rectangle",
    }},
  { selector: 'node[type = "file"]', style: {
      "background-color": "#dbeafe",
      "border-color": "#60a5fa",
      "shape": "rectangle",
      "font-weight": 600,
    }},
  { selector: 'node[type = "function"]', style: {
      "background-color": "#ecfccb",
      "border-color": "#84cc16",
    }},
  { selector: 'node[type = "unresolved"]', style: {
      "background-color": "#fee2e2",
      "border-color": "#f87171",
      "line-style": "dotted",
    }},
  { selector: 'node[type ^= "html-"]', style: {
      "background-color": "#fde68a",
      "border-color": "#f59e0b",
    }},
  { selector: 'node[type ^= "css-"]', style: {
      "background-color": "#ddd6fe",
      "border-color": "#8b5cf6",
    }},

  { selector: "edge", style: {
      "curve-style": "bezier",
      "width": 1.5,
      "line-color": "#94a3b8",
      "target-arrow-shape": "triangle",
      "target-arrow-color": "#94a3b8",
      "arrow-scale": 0.8,
      "opacity": 0.8,
    }},
  { selector: 'edge[type = "declares"]', style: {
      "line-color": "#3b82f6",
      "target-arrow-color": "#3b82f6",
    }},
  { selector: 'edge[type = "calls"]', style: {
      "line-color": "#10b981",
      "target-arrow-color": "#10b981",
    }},
  { selector: 'edge[type = "styled-by"]', style: {
      "line-color": "#f59e0b",
      "target-arrow-color": "#f59e0b",
      "line-style": "dashed",
    }},

  // highlight classes
  { selector: ".faded", style: { "opacity": 0.15 } },
  { selector: ".highlight", style: { "border-width": 2, "border-color": "#111827" } },
];

export default function CytoGraph({ nodes, edges }: Props) {
  const cyRef = useRef<cytoscape.Core | null>(null);
  const elements = useMemo(() => toElements(nodes, edges), [nodes, edges]);

  const [layoutName, setLayoutName] = useState<"dagre" | "cose" | "grid">("dagre");
  const [filters, setFilters] = useState({
    files: true,
    functions: true,
    html: true,
    css: true,
    unresolved: true,
  });
  const [selected, setSelected] = useState<any | null>(null);

  const runLayout = () => {
    const cy = cyRef.current!;
    cy.layout(
      layoutName === "dagre"
        ? { name: "dagre", rankDir: "LR", nodeSep: 20, rankSep: 40, edgeSep: 10 }
        : layoutName === "cose"
        ? { name: "cose", animate: false, gravity: 1.25, idealEdgeLength: 100 }
        : { name: "grid", rows: undefined, cols: undefined }
    ).run();
    cy.fit(undefined, 40);
  };

  // Initialize events & run first layout
  const onCyReady = (cy: cytoscape.Core) => {
    cyRef.current = cy;

    cy.on("tap", "node", (evt) => {
      const n = evt.target;
      setSelected({
        id: n.id(),
        type: n.data("type"),
        label: n.data("label"),
        lang: n.data("lang"),
        file: n.data("file"),
        degree: n.degree(),
        indegree: n.indegree(),
        outdegree: n.outdegree(),
      });

      // highlight neighborhood
      cy.elements().removeClass("faded highlight");
      const neighborhood = n.closedNeighborhood();
      cy.elements().difference(neighborhood).addClass("faded");
      n.addClass("highlight");
      neighborhood.edges().addClass("highlight");
    });

    cy.on("tap", (evt) => {
      if (evt.target === cy) {
        cy.elements().removeClass("faded highlight");
        setSelected(null);
      }
    });

    runLayout();
  };

  // Re-apply filters whenever toggled
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.elements().style("display", "element"); // reset

    const hideSelectors: string[] = [];
    if (!filters.files) hideSelectors.push('node[type = "file"]');
    if (!filters.functions) hideSelectors.push('node[type = "function"]');
    if (!filters.html) hideSelectors.push('node[type ^= "html-"]');
    if (!filters.css) hideSelectors.push('node[type ^= "css-"]');
    if (!filters.unresolved) hideSelectors.push('node[type = "unresolved"]');

    if (hideSelectors.length) {
      cy.$(hideSelectors.join(", ")).style("display", "none");
      // also hide edges connected to hidden nodes
      const hidden = cy.$(hideSelectors.join(", "));
      hidden.connectedEdges().style("display", "none");
    }
    // keep view tidy
    cy.resize();
  }, [filters]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
      {/* Controls */}
      <div className="lg:col-span-1 border rounded-xl p-4 space-y-3">
        <div>
          <div className="font-semibold mb-1">Layout</div>
          <select
            className="border rounded p-2 w-full"
            value={layoutName}
            onChange={(e) => setLayoutName(e.target.value as any)}
          >
            <option value="dagre">Dagre (LR)</option>
            <option value="cose">COSE (force)</option>
            <option value="grid">Grid</option>
          </select>
          <button
            className="mt-2 border rounded px-3 py-1"
            onClick={() => runLayout()}
          >
            Re-run layout
          </button>
          <button
            className="mt-2 ml-2 border rounded px-3 py-1"
            onClick={() => cyRef.current?.fit(undefined, 40)}
          >
            Fit
          </button>
        </div>

        <div>
          <div className="font-semibold mb-1">Filter</div>
          {[
            ["files", "Files"],
            ["functions", "Functions"],
            ["html", "HTML"],
            ["css", "CSS"],
            ["unresolved", "Unresolved"],
          ].map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={(filters as any)[key]}
                onChange={(e) => setFilters((f) => ({ ...f, [key]: e.target.checked }))}
              />
              {label}
            </label>
          ))}
        </div>

        <div>
          <div className="font-semibold mb-1">Selected</div>
          {!selected ? (
            <p className="text-sm text-gray-600">Click a node to see details.</p>
          ) : (
            <div className="text-sm space-y-1">
              <div><span className="font-medium">Label:</span> {selected.label}</div>
              <div><span className="font-medium">Type:</span> {selected.type}{selected.lang ? ` (${selected.lang})` : ""}</div>
              {selected.file && <div><span className="font-medium">File:</span> {selected.file}</div>}
              <div><span className="font-medium">Degree:</span> {selected.degree} (in {selected.indegree} / out {selected.outdegree})</div>
            </div>
          )}
        </div>
      </div>

      {/* Graph */}
      <div className="lg:col-span-3 h-[70vh] border rounded-xl overflow-hidden">
        <CytoscapeComponent
          elements={elements}
          stylesheet={stylesheet}
          style={{ width: "100%", height: "100%" }}
          cy={(cy) => onCyReady(cy)}
          wheelSensitivity={0.2}
          minZoom={0.05}
          maxZoom={3}
        />
      </div>
    </div>
  );
}
