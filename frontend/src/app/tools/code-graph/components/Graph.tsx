'use client';

import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import cytoscape, { Core, ElementDefinition, LayoutOptions } from 'cytoscape';

export type GraphHandle = { fit: () => void };

export const Graph = forwardRef<GraphHandle, {
  elements: ElementDefinition[];
  layoutName: string;
  hiddenFiles: Set<string>;
  openPopups: Set<string>;
  onTogglePopup: (id: string) => void;
  onPositions: (p: Record<string, { x: number; y: number }>) => void;
}>(
function GraphImpl(
  { elements, layoutName, hiddenFiles, openPopups, onTogglePopup, onPositions },
  ref
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);
  const openRef = useRef<Set<string>>(openPopups);

  useEffect(() => { openRef.current = openPopups; }, [openPopups]);

  // init once
  useEffect(() => {
    if (!containerRef.current) return;
    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        // Folders (compound)
        {
          selector: 'node.folder',
          style: {
            'background-opacity': 0.08,
            'border-width': 1,
            'border-color': '#CBD5E1',
            'shape': 'round-rectangle',
            'label': 'data(label)',
            'text-valign': 'top',
            'text-halign': 'center',
            'font-size': 12,
            'color': '#475569',
            'padding': '12px',
          },
        },
        // Files
        {
          selector: 'node.file',
          style: {
            'background-color': '#E5E7EB',
            'border-color': '#9CA3AF',
            'border-width': 1,
            'shape': 'round-rectangle',
            'label': 'data(label)',
            'font-size': 11,
            'text-wrap': 'wrap',
            'text-max-width': 120,
            'color': '#111827',
            'padding': '6px',
            'width': 'mapData(size, 0, 50000, 40, 120)',
            'height': 'mapData(size, 0, 50000, 24, 48)',
          },
        },
        // File accents
        { selector: 'node.file.js',   style: { 'background-color': '#FEF3C7' } },
        { selector: 'node.file.py',   style: { 'background-color': '#DBEAFE' } },
        { selector: 'node.file.html', style: { 'background-color': '#FDE68A' } },
        { selector: 'node.file.css',  style: { 'background-color': '#DCFCE7' } },
        { selector: 'node.file.c',    style: { 'background-color': '#E9D5FF' } },

        // Edges
        {
          selector: 'edge.dep',
          style: {
            'width': 1.5,
            'line-color': '#94A3B8',
            'curve-style': 'bezier',
            'target-arrow-shape': 'triangle',
            'target-arrow-color': '#94A3B8',
            'arrow-scale': 0.9,
          },
        },

        // Hidden node
        { selector: 'node.hidden-file', style: { 'display': 'none' } },
      ],
      layout: { name: 'cose', animate: true } as LayoutOptions,
      wheelSensitivity: 0.2,
    });

    // toggle popup on node click
    cy.on('tap', 'node.file', (evt) => {
      const id = evt.target.id();
      onTogglePopup(id);
    });

    // update popup positions on viewport or node movement changes
    const updatePositions = () => {
      const out: Record<string, { x: number; y: number }> = {};
      for (const id of openRef.current) {
        const node = cy.getElementById(id);
        if (node.empty() || node.hasClass('hidden-file')) continue;
        const p = node.renderedPosition();
        out[id] = { x: p.x, y: p.y };
      }
      onPositions(out);
    };

    cy.on('render zoom pan position dragfree layoutstop', updatePositions);

    cyRef.current = cy;
    return () => { cy.destroy(); cyRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // push new elements whenever they change (fixes “missing nodes” after ZIP)
  useEffect(() => {
    const cy = cyRef.current; if (!cy) return;
    cy.startBatch();
    cy.elements().remove();
    cy.add(elements as any);
    cy.endBatch();
    cy.layout({ name: layoutName as any, animate: true }).run();
  }, [elements, layoutName]);

  // Apply hidden state to nodes and edges
  useEffect(() => {
    const cy = cyRef.current; if (!cy) return;
    cy.startBatch();
    cy.nodes('.file').forEach(n => {
      hiddenFiles.has(n.id()) ? n.addClass('hidden-file') : n.removeClass('hidden-file');
    });
    cy.edges().forEach(e => {
      const hide = hiddenFiles.has(e.source().id()) || hiddenFiles.has(e.target().id());
      e.style('display', hide ? 'none' : 'element');
    });
    cy.endBatch();
    // refresh positions (hidden nodes won't report)
    const out: Record<string, { x: number; y: number }> = {};
    for (const id of openRef.current) {
      const n = cy.getElementById(id);
      if (n.empty() || n.hasClass('hidden-file')) continue;
      const p = n.renderedPosition();
      out[id] = { x: p.x, y: p.y };
    }
    onPositions(out);
  }, [hiddenFiles, onPositions]);

  // expose fit()
  useImperativeHandle(ref, () => ({
    fit: () => cyRef.current?.fit(undefined, 20),
  }), []);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        inset: 0,
      }}
    />
  );
});
