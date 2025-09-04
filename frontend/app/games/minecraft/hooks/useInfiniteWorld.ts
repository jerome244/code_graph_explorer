// hooks/useInfiniteWorld.ts
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BlockId, WorldBlock } from "../lib/types";
import { CHUNK_SIZE, chunkKey, worldToChunk, cellKey, chunkBounds } from "../lib/chunks";
import { generateChunk } from "../lib/worldgen";
import * as THREE from "three";

type BlocksMap = Map<string, WorldBlock>;

export function useInfiniteWorld({
  viewDistance = 6,   // chunks radius
  seed = 1337,        // in case you want to vary noise later
}: { viewDistance?: number; seed?: number } = {}) {
  const [blocks, setBlocks] = useState<BlocksMap>(new Map());
  const loadedChunks = useRef<Set<string>>(new Set());

  // persistent edits map: key -> BlockId | 0 (0 means removed)
  const edits = useRef<Map<string, BlockId | 0>>(new Map());

  // --- helpers ---
  const hasBlock = useCallback((x: number, y: number, z: number) => {
    const k = cellKey(x, y, z);
    const e = edits.current.get(k);
    if (e === 0) return false; // explicitly removed
    if (typeof e === "number") return true; // explicitly placed
    return blocks.has(k);
  }, [blocks]);

  const place = useCallback((x: number, y: number, z: number, id: BlockId) => {
    const k = cellKey(x, y, z);
    setBlocks(prev => {
      const next = new Map(prev);
      next.set(k, { pos: [x, y, z], id });
      return next;
    });
    edits.current.set(k, id); // persist
  }, []);

  const remove = useCallback((x: number, y: number, z: number) => {
    const k = cellKey(x, y, z);
    setBlocks(prev => {
      if (!prev.has(k)) return prev;
      const next = new Map(prev);
      next.delete(k);
      return next;
    });
    edits.current.set(k, 0); // mark removed persistently
  }, []);

  // --- chunk (un)loading ---
  const applyChunk = useCallback((cx: number, cz: number) => {
    const key = chunkKey(cx, cz);
    if (loadedChunks.current.has(key)) return;

    const gen = generateChunk(cx, cz);
    setBlocks(prev => {
      const next = new Map(prev);
      for (const b of gen) {
        const k = cellKey(b.x, b.y, b.z);
        // apply edits override
        if (edits.current.has(k)) {
          const e = edits.current.get(k)!;
          if (e === 0) {
            next.delete(k);
          } else {
            next.set(k, { pos: [b.x, b.y, b.z], id: e });
          }
        } else {
          next.set(k, { pos: [b.x, b.y, b.z], id: b.id });
        }
      }
      return next;
    });
    loadedChunks.current.add(key);
  }, []);

  const removeChunk = useCallback((cx: number, cz: number) => {
    const key = chunkKey(cx, cz);
    if (!loadedChunks.current.has(key)) return;
    const { x0, z0, x1, z1 } = chunkBounds(cx, cz);
    setBlocks(prev => {
      const next = new Map(prev);
      for (let x = x0; x <= x1; x++) {
        for (let z = z0; z <= z1; z++) {
          // We don’t know the height; delete any keys with these x/z by scanning y range that’s plausible
          // To keep it cheap, just try a reasonable band (0..128). Adjust for your world ceiling.
          for (let y = 0; y <= 128; y++) {
            next.delete(cellKey(x, y, z));
          }
        }
      }
      return next;
    });
    loadedChunks.current.delete(key);
  }, []);

  // --- streaming around the player ---
  // We use a tiny component-local RAF/throttle that you call from your page to pass camera pos,
  // but to keep it self-contained, we expose an 'updateAround(position)' you should call per frame (or throttled).
  const lastCenter = useRef<{ cx: number; cz: number } | null>(null);

  const updateAround = useCallback((pos: THREE.Vector3) => {
    const { cx, cz } = worldToChunk(pos.x, pos.z);
    const centerChanged = !lastCenter.current || lastCenter.current.cx !== cx || lastCenter.current.cz !== cz;
    if (!centerChanged) return;

    lastCenter.current = { cx, cz };

    // determine desired set
    const want = new Set<string>();
    for (let dz = -viewDistance; dz <= viewDistance; dz++) {
      for (let dx = -viewDistance; dx <= viewDistance; dx++) {
        const k = chunkKey(cx + dx, cz + dz);
        want.add(k);
        if (!loadedChunks.current.has(k)) applyChunk(cx + dx, cz + dz);
      }
    }

    // unload chunks not wanted anymore
    for (const k of loadedChunks.current) {
      if (!want.has(k)) {
        const [sx, sz] = k.split(",").map(Number);
        removeChunk(sx, sz);
      }
    }
  }, [applyChunk, removeChunk, viewDistance]);

  return { blocks, hasBlock, place, remove, updateAround, CHUNK_SIZE };
}
