import type { BlockId, Vec3 } from "./types";

export const WORLD_SIZE = 20;
export const STORAGE_KEY = "minecraft_like_world_3d_v1";

export const keyOf = ([x, y, z]: Vec3) => `${x},${y},${z}`;
export function parseKey(k: string): Vec3 {
  const [x, y, z] = k.split(",").map(Number);
  return [x, y, z];
}

export function seedWorld(): Record<string, BlockId> {
  const map: Record<string, BlockId> = {};
  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      map[keyOf([x, 0, z])] = "GRASS";
      if (Math.random() < 0.1) map[keyOf([x, 1, z])] = "DIRT";
    }
  }
  return map;
}

export function loadWorld(): Record<string, BlockId> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as Record<string, BlockId>;
  } catch {
    return null;
  }
}

export function saveWorld(map: Record<string, BlockId>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {}
}
