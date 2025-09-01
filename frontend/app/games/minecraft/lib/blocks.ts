import type { BlockId } from "./types";

export const BLOCKS: { id: BlockId; label: string; key?: string; color: string }[] = [
  { id: "GRASS", label: "Grass", key: "1", color: "#57a639" },
  { id: "DIRT",  label: "Dirt",  key: "2", color: "#6b4f2d" },
  { id: "STONE", label: "Stone", key: "3", color: "#9ca3af" },
  { id: "SAND",  label: "Sand",  key: "4", color: "#f5d08a" },
  { id: "WATER", label: "Water", key: "5", color: "#60a5fa" },
  { id: "WOOD",  label: "Wood",  key: "6", color: "#8b5a2b" },
  { id: "EMPTY", label: "Air",   key: "7", color: "#ffffff" },
];

export function colorFor(id: BlockId): string {
  switch (id) {
    case "GRASS": return "#57a639";
    case "DIRT":  return "#6b4f2d";
    case "STONE": return "#9ca3af";
    case "SAND":  return "#f5d08a";
    case "WATER": return "#60a5fa";
    case "WOOD":  return "#8b5a2b";
    case "EMPTY": return "#ffffff";
  }
}

/**
 * Approximate time in seconds to break a block when holding LEFT mouse.
 * Tune these to your liking. Non-solid blocks (WATER/EMPTY) are 0.
 */
export const HARDNESS: Record<BlockId, number> = {
  GRASS: 1.0,
  DIRT: 1.2,
  SAND: 0.8,
  WOOD: 1.6,
  STONE: 2.2,
  WATER: 0,
  EMPTY: 0,
};

/** Helper: returns a sane default if a block id isn’t listed. */
export function hardnessFor(id: BlockId): number {
  return HARDNESS[id] ?? 1.2;
}
