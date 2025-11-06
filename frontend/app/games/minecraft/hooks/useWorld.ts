"use client";

import { useCallback, useState } from "react";
import { key } from "../lib/utils";
import type { BlockId, WorldBlock } from "../lib/types";

export function useWorld(initialRange = 12) {
  const [blocks, setBlocks] = useState<Map<string, WorldBlock>>(() => {
    const m = new Map<string, WorldBlock>();
    for (let x = -initialRange; x <= initialRange; x++) {
      for (let z = -initialRange; z <= initialRange; z++) {
        const y = 0;
        m.set(key(x, y, z), { pos: [x, y, z], id: 1 });
      }
    }
    return m;
  });

  const hasBlock = useCallback((x: number, y: number, z: number) => blocks.has(key(x, y, z)), [blocks]);

  const place = useCallback((x: number, y: number, z: number, id: BlockId) => {
    setBlocks((prev) => {
      const k = key(x, y, z);
      if (prev.has(k)) return prev;
      const next = new Map(prev);
      next.set(k, { pos: [x, y, z], id });
      return next;
    });
  }, []);

  const remove = useCallback((x: number, y: number, z: number) => {
    setBlocks((prev) => {
      const k = key(x, y, z);
      if (!prev.has(k)) return prev;
      const next = new Map(prev);
      next.delete(k);
      return next;
    });
  }, []);

  return { blocks, place, remove, hasBlock };
}
