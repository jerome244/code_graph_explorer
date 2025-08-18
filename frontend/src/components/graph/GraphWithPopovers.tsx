"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type NodeData = {
  id: string;
  label?: string;
  path?: string;     // file path (required to fetch code)
  start?: number;    // optional 1-based line start
  end?: number;      // optional 1-based line end (inclusive)
  lang?: string;
};

type EdgeData = { id: string; source: string; target: string; label?: string };

type Props = {
  slug: string;
  nodes: NodeData[];
  edges: EdgeData[];
};

type Pop = {
  id: string;              // node id
  title: string;           // label or path
  path?: string;
  start?: number;
  end?: number;
  content: string;         // code text (or loading/error)
  x: number;               // rendered pixel coords within container
  y: number;
  lang?: string;
};

export default function GraphWithPopovers({ slug, nodes, edges }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<any>(null);
  const [pops, setPops] = useState<Record<string, Pop>>({});

  const elements = useMemo(() => {
    return [
      ...nodes.map((n) => ({ data: n })),
      ...edges.map((e) => ({ data: e })),
    ];
  }, [nodes, edges]);

  // helper: update position for an existing popup
  const positionForNode = (node: any): {x:number,y:number} => {
    const rp = node.renderedPosition();
    return { x: rp.x, y: rp.y };
  };

  const updatePopPositions = () => {
    const cy = cyRef.current;
    if (!cy) return;
    setPops((old) => {
      const next: Record<string, Pop> = { ...old };
      Object.keys(next).forEach((id) => {
        const node = cy.$id(id);
        if (node && node.nonempty()) {
          const { x, y } = positionForNode(node);
          next[id] = { ...next[id], x, y };
        }
      });
      return next;
    });
  };

  // load code for node (via Next proxy)
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

    // if already open, just focus/leave as is (don’t close)
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

    // fetch code and update
    try {
      const code = await fetchCodeFor(d);
      setPops((old) => (old[d.id] ? { ...old, [d.id]: { ...old[d.id], content: code } } : old));
    } catch (e: any) {
      setPops((old) => (old[d.id] ? { ...old, [d.id]: { ...old[d.id], content: String(e?.message || e) } } : old));
    }
  };

  const closePop = (id: string) => {
    setPops((old) => {
      const { [id]: _, ...rest } = old;
      return rest;
    });
  };

  useEffect(() => {
    let cy: any;
    let mounted = true;

    (async () => {
      const cytoscape = (await import("cytoscape")).default;
      if (!containerRef.current) return;

      cy = cytoscape({
        container: containerRef.current,
        elements,
        layout: { name: "cose", animate: false },
        style: [
          { selector: "node",
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
          { selector: "edge",
            style: { width: 1.5, "line-color": "#cbd5e1", "target-arrow-color": "#cbd5e1", "target-arrow-shape":"triangle" }
          },
          { selector: ":selected", style: { "background-color": "#111827", color: "white" } },
        ],
      });
      cyRef.current = cy;

      // events: open popovers
      cy.on("tap", "node", (e: any) => openPop(e.target));

      // keep popovers attached while panning/zooming
      const rePos = () => updatePopPositions();
      cy.on("pan zoom drag free position", rePos);
      window.addEventListener("resize", rePos);

      if (!mounted) return;
    })();

    return () => {
      mounted = false;
      window.removeEventListener("resize", updatePopPositions as any);
      try { cyRef.current?.destroy(); } catch {}
      cyRef.current = null;
      setPops({});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elements]);

  // also reposition when elements change
  useEffect(() => { updatePopPositions(); });

  return (
    <div className="relative w-full h-[75vh] border rounded-lg overflow-hidden">
      {/* cytoscape canvas container */}
      <div ref={containerRef} className="absolute inset-0" />

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
                {p.start ? <span className="text-gray-500"> · L{p.start}{p.end ? `–${p.end}` : ""}</span> : null}
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
