"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";

type NodeData = {
  id: string;
  label?: string;
  path?: string;
  start?: number;
  end?: number;
  lang?: string;
};

type EdgeData = { id: string; source: string; target: string; label?: string };

type Props = {
  slug: string;
  nodes: NodeData[];
  edges: EdgeData[];
};

type Pop = {
  id: string;
  title: string;
  path?: string;
  start?: number;
  end?: number;
  content: string;
  x: number;
  y: number;
  lang?: string;
};

export default function GraphWithPopovers({ slug, nodes, edges }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<any>(null);
  const resizeObsRef = useRef<ResizeObserver | null>(null);
  const [pops, setPops] = useState<Record<string, Pop>>({});

  const elements = useMemo(() => {
    return [
      ...nodes.map((n) => ({ data: n })), // nodes
      ...edges.map((e) => ({ data: e })), // edges
    ];
  }, [nodes, edges]);

  const positionForNode = (node: any): { x: number; y: number } => {
    const rp = node.renderedPosition();
    return { x: rp.x, y: rp.y };
  };

  const updatePopPositions = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;

    setPops((old) => {
      let changed = false;
      const next: Record<string, Pop> = {};

      for (const id of Object.keys(old)) {
        const coll = cy.$id(id);
        const exists = coll && (typeof coll.nonempty === "function" ? coll.nonempty() : coll.length > 0);
        if (exists) {
          const { x, y } = positionForNode(coll);
          const prev = old[id];
          if (prev.x !== x || prev.y !== y) {
            changed = true;
            next[id] = { ...prev, x, y };
          } else {
            next[id] = prev;
          }
        } else {
          next[id] = old[id];
        }
      }

      return changed ? next : old;
    });
  }, []);

  const fetchCodeFor = async (nodeData: NodeData): Promise<string> => {
    if (!nodeData.path) return "No file path on node.";
    const params = new URLSearchParams({ path: nodeData.path });
    if (nodeData.start) params.set("start", String(nodeData.start));
    if (nodeData.end) params.set("end", String(nodeData.end));

    const r = await fetch(`/api/projects/${slug}/file?` + params.toString(), { cache: "no-store" });
    if (!r.ok) return `Error ${r.status}: ${await r.text()}`;
    return await r.text();
  };

  const openPop = async (node: any) => {
    const d = node.data() as NodeData;
    const { x, y } = positionForNode(node);

    setPops((old) => {
      if (old[d.id]) return old;
      return {
        ...old,
        [d.id]: {
          id: d.id,
          title: d.label || d.path || d.id,
          path: d.path,
          start: d.start,
          end: d.end,
          content: "Loading…",
          x,
          y,
          lang: d.lang,
        },
      };
    });

    try {
      const code = await fetchCodeFor(d);
      setPops((old) => (old[d.id] ? { ...old, [d.id]: { ...old[d.id], content: code } } : old));
    } catch (e: any) {
      setPops((old) =>
        old[d.id] ? { ...old, [d.id]: { ...old[d.id], content: String(e?.message || e) } } : old
      );
    }
  };

  const closePop = (id: string) => {
    setPops((old) => {
      const { [id]: _, ...rest } = old;
      return rest;
    });
  };

  // Init Cytoscape (useLayoutEffect so container has real size)
  useLayoutEffect(() => {
    let destroyed = false;
    let cyLocal: any;

    (async () => {
      const cytoscape = (await import("cytoscape")).default;
      if (!containerRef.current || destroyed) return;

      // clean up a stray instance if Strict Mode double-mounted
      try {
        cyRef.current?.destroy();
      } catch {}
      cyRef.current = null;

      cyLocal = cytoscape({
        container: containerRef.current,
        elements: [], // add after init to avoid timing weirdness
        layout: { name: "cose", animate: false },
        style: [
          {
            selector: "node",
            style: {
              "background-color": "#6b7280",
              label: "data(label)",
              "font-size": 10,
              "text-wrap": "wrap",
              "text-max-width": 100,
              "text-valign": "center",
              "text-halign": "center",
              color: "#111827",
            },
          },
          {
            selector: "edge",
            style: {
              width: 1.5,
              "line-color": "#cbd5e1",
              "target-arrow-color": "#cbd5e1",
              "target-arrow-shape": "triangle",
              "curve-style": "bezier",
            },
          },
          { selector: ":selected", style: { "background-color": "#111827", color: "white" } },
        ],
      });

      if (destroyed) {
        try { cyLocal.destroy(); } catch {}
        return;
      }

      cyRef.current = cyLocal;

      // add elements then layout + fit
      if (elements.length) cyLocal.add(elements);
      const layout = cyLocal.layout({ name: "cose", animate: false });
      layout.run();
      cyLocal.ready(() => {
        try {
          if (!cyLocal.destroyed()) cyLocal.fit(undefined, 20);
        } catch {}
      });

      // open popovers
      cyLocal.on("tap", "node", (e: any) => openPop(e.target));

      // keep popovers attached while panning/zooming/dragging
      const rePos = () => updatePopPositions();
      cyLocal.on("pan zoom drag free position", rePos);
      window.addEventListener("resize", rePos);

      // ResizeObserver to keep canvas sized and visible
      if (!resizeObsRef.current && containerRef.current) {
        resizeObsRef.current = new ResizeObserver(() => {
          try {
            if (!cyLocal.destroyed()) {
              cyLocal.resize();
              cyLocal.fit(undefined, 20);
              updatePopPositions();
            }
          } catch {}
        });
        resizeObsRef.current.observe(containerRef.current);
      }

      // initial position sync after layout
      updatePopPositions();
    })();

    return () => {
      destroyed = true;
      try {
        if (resizeObsRef.current && containerRef.current) {
          resizeObsRef.current.unobserve(containerRef.current);
        }
      } catch {}
      try {
        const cy = cyRef.current;
        if (cy) {
          cy.removeAllListeners?.(); // in case plugin adds any
          cy.destroy();
        }
      } catch {}
      cyRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elements, updatePopPositions]);

  // Reposition when elements change (no loops)
  useLayoutEffect(() => {
    updatePopPositions();
  }, [elements, updatePopPositions]);

  const hasData = nodes.length + edges.length > 0;

  return (
      <div className="relative w-full h-[75vh] min-h-0 border rounded-lg overflow-hidden">
      {/* cytoscape canvas container */}
      <div
        ref={containerRef}
        className="w-full h-full"
        style={{ width: "100%", height: "100%" }} // be explicit for Cytoscape
      />

      {/* empty-state helper */}
      {!hasData && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-500">
          No nodes/edges to display.
        </div>
      )}

      {/* popovers overlay */}
      <div className="absolute inset-0 pointer-events-none">
        {Object.values(pops).map((p) => (
          <div
            key={p.id}
            style={{
              position: "absolute",
              left: Math.max(8, p.x + 8),
              top: Math.max(8, p.y + 8),
              maxWidth: 420,
              zIndex: 30,
            }}
            className="pointer-events-auto shadow-lg border rounded-xl bg-white"
          >
            <div className="flex items-center justify-between px-3 py-2 border-b">
              <div className="text-xs font-semibold truncate" title={p.title}>
                {p.title}
                {p.start ? (
                  <span className="text-gray-500">
                    {" "}
                    · L{p.start}
                    {p.end ? `–${p.end}` : ""}
                  </span>
                ) : null}
              </div>
              <button
                className="text-xs border rounded px-2 py-0.5"
                onClick={() => closePop(p.id)}
              >
                Close
              </button>
            </div>
            <pre className="text-xs p-3 overflow-auto max-h-64 whitespace-pre-wrap">
{p.content}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}
