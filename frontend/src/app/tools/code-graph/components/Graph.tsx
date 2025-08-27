'use client';

import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import cytoscape, { Core, ElementDefinition, LayoutOptions } from 'cytoscape';

export type GraphHandle = { fit: () => void };

function isEdge(el: ElementDefinition) {
  const d: any = (el as any).data;
  return d && typeof d.source === 'string' && typeof d.target === 'string';
}
function isNode(el: ElementDefinition) {
  return !isEdge(el);
}
function sameIdSet(a: Set<string>, b: Set<string>) {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

type PosMap = Record<string, { x: number; y: number }>;
type Move = { id: string; x: number; y: number };

export const Graph = forwardRef<GraphHandle, {
  elements: ElementDefinition[];
  layoutName: string;
  hiddenFiles: Set<string>;
  openPopups: Set<string>;
  onTogglePopup: (id: string) => void;

  // popup overlay (screen) positions
  onPositions: (p: Record<string, { x: number; y: number }>) => void;

  // Live Share
  remoteSelectedIds?: string[];

  // NEW: apply authoritative model positions from server
  presetPositions?: PosMap;

  // NEW: stream model coord deltas while dragging
  onModelDelta?: (moves: Move[]) => void;

  // NEW: after layout or rebuild, provide a full model snapshot
  onModelSnapshot?: (all: PosMap) => void;
}>(
function GraphImpl(
  { elements, layoutName, hiddenFiles, openPopups, onTogglePopup, onPositions,
    remoteSelectedIds, presetPositions, onModelDelta, onModelSnapshot },
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
        { selector: 'node.folder', style: {
          'background-opacity': 0.08, 'border-width': 1, 'border-color': '#CBD5E1', 'shape': 'round-rectangle',
          'label': 'data(label)', 'text-valign': 'top', 'text-halign': 'center', 'font-size': 12, 'color': '#475569', 'padding': '12px',
        }},
        { selector: 'node.file', style: {
          'background-color': '#E5E7EB','border-color': '#9CA3AF','border-width': 1,'shape': 'round-rectangle',
          'label': 'data(label)','font-size': 11,'text-wrap': 'wrap','text-max-width': 120,'color': '#111827','padding': '6px',
          'width': 'mapData(size, 0, 50000, 40, 120)','height': 'mapData(size, 0, 50000, 24, 48)',
        }},
        { selector: 'node.file.js',   style: { 'background-color': '#FEF3C7' } },
        { selector: 'node.file.py',   style: { 'background-color': '#DBEAFE' } },
        { selector: 'node.file.html', style: { 'background-color': '#FDE68A' } },
        { selector: 'node.file.css',  style: { 'background-color': '#DCFCE7' } },
        { selector: 'node.file.c',    style: { 'background-color': '#E9D5FF' } },

        { selector: 'edge.dep', style: {
          'width': 1.5, 'line-color': '#94A3B8', 'curve-style': 'bezier',
          'target-arrow-shape': 'triangle', 'target-arrow-color': '#94A3B8', 'arrow-scale': 0.9,
        }},
        { selector: 'edge.call', style: {
          'width': 1.6, 'line-color': '#f472b6', 'curve-style': 'bezier',
          'target-arrow-shape': 'triangle', 'target-arrow-color': '#f472b6', 'line-style': 'dashed',
          'arrow-scale': 0.95,
        }},
        { selector: 'node.remote-selected', style: { 'border-width': 3, 'border-color': '#60A5FA' } },
        { selector: 'node.hidden-file', style: { 'display': 'none' } },
      ],
      layout: { name: 'cose', animate: true } as LayoutOptions,
      wheelSensitivity: 0.2,
    });

    cy.on('tap', 'node.file', (evt) => onTogglePopup(evt.target.id()));

    // Send popup overlay (rendered/screen) positions for open popups
    const updateRenderedPositions = () => {
      const out: Record<string, { x: number; y: number }> = {};
      for (const id of openRef.current) {
        const node = cy.getElementById(id);
        if (node.empty() || node.hasClass('hidden-file')) continue;
        const p = node.renderedPosition(); // screen coords for overlay
        out[id] = { x: p.x, y: p.y };
      }
      onPositions(out);
    };
    cy.on('render zoom pan position dragfree layoutstop', updateRenderedPositions);
    updateRenderedPositions();

    // Stream model deltas while dragging
    cy.on('drag', 'node.file', (evt) => {
      const n = evt.target;
      const id = n.id();
      const p = n.position(); // MODEL coords
      onModelDelta?.([{ id, x: p.x, y: p.y }]);
      // also keep overlay synced
      updateRenderedPositions();
    });

    // After layout completes, send full model snapshot
    cy.on('layoutstop', () => {
      const all: PosMap = {};
      cy.nodes('.file').forEach(n => {
        const p = n.position();
        all[n.id()] = { x: p.x, y: p.y };
      });
      onModelSnapshot?.(all);
      updateRenderedPositions();
    });

    cyRef.current = cy;
    return () => { cy.destroy(); cyRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // when open popups set changes, refresh overlay positions
  useEffect(() => {
    const cy = cyRef.current; if (!cy) return;
    const out: Record<string, { x: number; y: number }> = {};
    for (const id of openPopups) {
      const node = cy.getElementById(id);
      if (node.empty() || node.hasClass('hidden-file')) continue;
      const p = node.renderedPosition();
      out[id] = { x: p.x, y: p.y };
    }
    onPositions(out);
  }, [openPopups, onPositions]);

  function applyHiddenToEdges(cy: Core) {
    cy.edges().forEach(e => {
      const hide = hiddenFiles.has(e.source().id()) || hiddenFiles.has(e.target().id());
      e.style('display', hide ? 'none' : 'element');
    });
  }

  // elements/layout changes
  useEffect(() => {
    const cy = cyRef.current; if (!cy) return;

    const incomingNodes = elements.filter(isNode);
    const incomingEdges = elements.filter(isEdge);

    const currentNodeIds = new Set<string>(cy.nodes().map(n => n.id()));
    const newNodeIds = new Set<string>(incomingNodes.map((el: any) => el.data.id));
    const nodesUnchanged = sameIdSet(currentNodeIds, newNodeIds);

    if (nodesUnchanged) {
      cy.startBatch();
      cy.edges().remove();
      cy.add(incomingEdges as any);
      applyHiddenToEdges(cy);
      cy.endBatch();
    } else {
      cy.startBatch();
      cy.elements().remove();
      cy.add(elements as any);

      // If we have authoritative positions, apply them and use preset
      const hasPreset = presetPositions && Object.keys(presetPositions).length > 0;
      if (hasPreset) {
        for (const [id, p] of Object.entries(presetPositions!)) {
          const n = cy.getElementById(id);
          if (!n.empty()) n.position({ x: p.x, y: p.y });
        }
        cy.endBatch();
        cy.layout({ name: 'preset', animate: false }).run();
      } else {
        cy.endBatch();
        cy.layout({ name: layoutName as any, animate: true }).run();
      }

      applyHiddenToEdges(cy);
    }
  }, [elements, layoutName, /* NOTE: include key to re-apply when preset exists */ Object.keys(presetPositions || {}).join('|')]);

  // apply hidden files
  useEffect(() => {
    const cy = cyRef.current; if (!cy) return;
    cy.startBatch();
    cy.nodes('.file').forEach(n => {
      hiddenFiles.has(n.id()) ? n.addClass('hidden-file') : n.removeClass('hidden-file');
    });
    applyHiddenToEdges(cy);
    cy.endBatch();
  }, [hiddenFiles]);

  // apply incoming remote positions incrementally
  useEffect(() => {
    const cy = cyRef.current; if (!cy) return;
    if (!presetPositions) return;
    cy.startBatch();
    for (const [id, p] of Object.entries(presetPositions)) {
      const n = cy.getElementById(id);
      if (!n.empty()) n.position({ x: p.x, y: p.y });
    }
    cy.endBatch();
    // no layout run here; we are directly positioning nodes
  }, [presetPositions]);

  // Live Share: highlight remote selections
  useEffect(() => {
    const cy = cyRef.current; if (!cy) return;
    cy.startBatch();
    cy.nodes('.file').removeClass('remote-selected');
    for (const id of (remoteSelectedIds || [])) {
      const n = cy.getElementById(id);
      if (!n.empty()) n.addClass('remote-selected');
    }
    cy.endBatch();
  }, [remoteSelectedIds]);

  useImperativeHandle(ref, () => ({ fit: () => cyRef.current?.fit(undefined, 20) }), []);

  return <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />;
});
