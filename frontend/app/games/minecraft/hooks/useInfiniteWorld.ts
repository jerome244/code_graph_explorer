// hooks/useInfiniteWorld.ts
"use client";

import { useCallback, useEffect, useRef, useState, startTransition } from "react";
import * as THREE from "three";
import type { BlockId, WorldBlock } from "../lib/types";
import { CHUNK_SIZE, chunkKey, worldToChunk, cellKey, chunkBounds } from "../lib/chunks";
import { generateChunk, heightAt, blockFor } from "../lib/worldgen";

type BlocksMap = Map<string, WorldBlock>;

// Helper for (x,z) key
const topKey = (x: number, z: number) => `${x},${z}`;

export function useInfiniteWorld({
  viewDistance = 3,     // smaller default to keep it snappy
  perFrameLoads = 2,    // process N chunks per RAF
}: { viewDistance?: number; perFrameLoads?: number } = {}) {
  const [blocks, setBlocks] = useState<BlocksMap>(new Map());

  // What chunks are resident
  const loadedChunks = useRef<Set<string>>(new Set());
  // Queue of chunks to load (nearest-first)
  const loadQueue = useRef<Array<{ cx: number; cz: number; d: number }>>([]);

  // Persistent edits: key -> BlockId | 0 (0 means removed)
  const edits = useRef<Map<string, BlockId | 0>>(new Map());

  // Track current top Y per column (x,z) for progressive dig/place
  const columnTop = useRef<Map<string, number>>(new Map());
  // Base surface height from worldgen (immutable), used to decide dirt/stone below
  const baseHeight = useRef<Map<string, number>>(new Map());

  // ========== Queries & Mutations ==========

  const getTopY = useCallback((x: number, z: number) => {
    const tk = topKey(x, z);
    if (columnTop.current.has(tk)) return columnTop.current.get(tk)!;
    // not seen yet: use worldgen height
    const h = heightAt(x, z);
    baseHeight.current.set(tk, h);
    return h;
  }, []);

  const hasBlock = useCallback((x: number, y: number, z: number) => {
    const k = cellKey(x, y, z);
    const e = edits.current.get(k);
    if (e === 0) return false;
    if (typeof e === "number") return true;
    return blocks.has(k);
  }, [blocks]);

  const place = useCallback((x: number, y: number, z: number, id: BlockId) => {
    const tk = topKey(x, z);
    startTransition(() => {
      setBlocks(prev => {
        const next = new Map(prev);
        next.set(cellKey(x, y, z), { pos: [x, y, z], id });
        return next;
      });
    });
    edits.current.set(cellKey(x, y, z), id);
    // update top-of-column if we placed at or above it
    if (!columnTop.current.has(tk) || y >= columnTop.current.get(tk)!) {
      columnTop.current.set(tk, y);
    }
  }, []);

  const remove = useCallback((x: number, y: number, z: number) => {
    const tk = topKey(x, z);
    const ck = cellKey(x, y, z);

    startTransition(() => {
      setBlocks(prev => {
        if (!prev.has(ck)) return prev;
        const next = new Map(prev);
        next.delete(ck);
        return next;
      });
    });

    edits.current.set(ck, 0);

    // Progressive reveal: if we removed the *top* block, reveal next layer below
    const curTop = columnTop.current.get(tk) ?? getTopY(x, z);
    if (y >= curTop) {
      // find next un-removed level below
      let baseH = baseHeight.current.get(tk);
      if (baseH == null) {
        baseH = heightAt(x, z);
        baseHeight.current.set(tk, baseH);
      }
      let ny = y - 1;
      while (ny >= 0) {
        const nKey = cellKey(x, ny, z);
        const edit = edits.current.get(nKey);
        if (edit === 0) {
          ny -= 1; // explicitly mined before, skip
          continue;
        }
        // reveal: either use previous placed edit, or worldgen layer
        const nid = (typeof edit === "number") ? (edit as BlockId) : (blockFor(ny, baseH) as BlockId);
        // add visual/solid block
        const addY = ny;
        startTransition(() => {
          setBlocks(prev => {
            const next = new Map(prev);
            next.set(nKey, { pos: [x, addY, z], id: nid });
            return next;
          });
        });
        columnTop.current.set(tk, addY);
        break;
      }
      if (ny < 0) {
        // Column fully mined out
        columnTop.current.set(tk, -1);
      }
    }
  }, [getTopY]);

  // ========== Chunk streaming ==========

  // Generate and apply a chunk (surface-only + progressive column bookkeeping)
  const applyChunk = useCallback((cx: number, cz: number) => {
    const ck = chunkKey(cx, cz);
    if (loadedChunks.current.has(ck)) return;

    const gen = generateChunk(cx, cz); // surface-only blocks
    startTransition(() => {
      setBlocks(prev => {
        const next = new Map(prev);
        for (const b of gen) {
          const tk = topKey(b.x, b.z);
          baseHeight.current.set(tk, b.y); // base surface

          const e = edits.current.get(cellKey(b.x, b.y, b.z));

          // ⬅️ handle air (0) safely: don't insert a WorldBlock with id=0
          if (e === 0) {
            // player previously removed this surface block; keep it empty
          } else {
            const id: BlockId =
              (typeof e === "number" ? e : b.id) as BlockId;
            next.set(cellKey(b.x, b.y, b.z), { pos: [b.x, b.y, b.z], id });
          }

          // top is max of seen surface and any prior placements above
          const prevTop = columnTop.current.get(tk);
          columnTop.current.set(tk, prevTop != null ? Math.max(prevTop, b.y) : b.y);
        }
        return next;
      });
    });
    loadedChunks.current.add(ck);
  }, []);

  const removeChunk = useCallback((cx: number, cz: number) => {
    const ck = chunkKey(cx, cz);
    if (!loadedChunks.current.has(ck)) return;

    const { x0, z0, x1, z1 } = chunkBounds(cx, cz);
    startTransition(() => {
      setBlocks(prev => {
        const next = new Map(prev);
        for (let x = x0; x <= x1; x++) {
          for (let z = z0; z <= z1; z++) {
            const top = columnTop.current.get(topKey(x, z));
            if (top != null && top >= 0) {
              next.delete(cellKey(x, top, z));
            }
            // Don't wipe edits: columnTop/baseHeight persist, so resurfacing is fast
          }
        }
        return next;
      });
    });

    loadedChunks.current.delete(ck);
  }, []);

  // Chunk load scheduler (budget per frame)
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      let budget = perFrameLoads;
      // nearest-first
      loadQueue.current.sort((a, b) => a.d - b.d);
      while (budget-- > 0 && loadQueue.current.length > 0) {
        const job = loadQueue.current.shift()!;
        applyChunk(job.cx, job.cz);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [perFrameLoads, applyChunk]);

  // Called from your Canvas each frame to maintain the wanted set
  const updateAround = useCallback((pos: THREE.Vector3) => {
    const { cx, cz } = worldToChunk(pos.x, pos.z);

    const want = new Set<string>();
    for (let dz = -viewDistance; dz <= viewDistance; dz++) {
      for (let dx = -viewDistance; dx <= viewDistance; dx++) {
        const x = cx + dx, z = cz + dz;
        const k = chunkKey(x, z);
        want.add(k);
        if (!loadedChunks.current.has(k)) {
          // enqueue if not already queued
          if (!loadQueue.current.find(j => j.cx === x && j.cz === z)) {
            const d = Math.abs(dx) + Math.abs(dz); // manhattan ring
            loadQueue.current.push({ cx: x, cz: z, d });
          }
        }
      }
    }

    // unload far chunks immediately (cheap — we only remove top instances)
    for (const k of Array.from(loadedChunks.current)) {
      if (!want.has(k)) {
        const [sx, sz] = k.split(",").map(Number);
        removeChunk(sx, sz);
      }
    }
  }, [viewDistance, removeChunk]);

  return {
    blocks,
    hasBlock,
    place,
    remove,
    updateAround,
    // helpers for UI/placement:
    getTopY,
  };
}
