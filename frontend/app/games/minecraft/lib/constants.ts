import type { BlockId } from "./types";

export type BlockSpec = {
  name: string;
  color: string;
  opacity?: number;
  transparent?: boolean;
  /** Seconds to mine with bare hands (your code can multiply for tools) */
  hardness?: number;
};

export const BLOCKS: Record<BlockId, BlockSpec> = {
  1: { name: "Grass", color: "#3fbf3f", hardness: 0.35 },
  2: { name: "Dirt",  color: "#7a5230", hardness: 0.30 },
  3: { name: "Stone", color: "#8a8f98", hardness: 1.20 },
  4: { name: "Sand",  color: "#e3d7a3", hardness: 0.25 },
  5: { name: "Wood",  color: "#a26a2a", hardness: 0.70 },
  6: { name: "Brick", color: "#b04949", hardness: 1.60 },
  7: { name: "Glass", color: "#7dd3fc", opacity: 0.4, transparent: true, hardness: 0.20 },
  8: { name: "Lava",  color: "#ff6a00", opacity: 0.85, transparent: true, hardness: Infinity },
  9: { name: "Snow",  color: "#ffffff", hardness: 0.15 },
};
