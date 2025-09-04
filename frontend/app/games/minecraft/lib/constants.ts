import type { BlockId } from "./types";

export const BLOCKS: Record<BlockId, { name: string; color: string; opacity?: number; transparent?: boolean }> = {
  1: { name: "Grass", color: "#3fbf3f" },
  2: { name: "Dirt", color: "#7a5230" },
  3: { name: "Stone", color: "#8a8f98" },
  4: { name: "Sand", color: "#e3d7a3" },
  5: { name: "Wood", color: "#a26a2a" },
  6: { name: "Brick", color: "#b04949" },
  7: { name: "Glass", color: "#7dd3fc", opacity: 0.4, transparent: true },
};
