// frontend/app/games/minecraft/lib/trees.ts
// Sparse trees; cold => sapin (fir), warm => small round crown.
// No runtime cycles: only *type* imports from worldgen.

import type { BlockId } from "./types";
import type { Biome } from "./worldgen"; // type-only, erased at runtime

export type TreeEnv = {
  heightAt: (x: number, z: number) => number;
  seaLevelY: number;
  temperatureAt?: (x: number, z: number, y: number) => number; // 0..1
};

export const TREE_IDS = {
  trunk: 5 as BlockId, // Wood
  leaf: 1 as BlockId,  // Placeholder leaves (Grass). Swap to your LEAF id if you have one.
};

export const TREE_CONFIG = {
  grid: 11,
  baseP: { plains: 0.14, taiga: 0.20 },
  slopeMax: 1,
  maxTrunk: 6,
  coldTemp: 0.38,
} as const;

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
function hash2(x: number, y: number, seed = 1337) {
  const h = ((x * 374761393) ^ (y * 668265263) ^ seed) >>> 0;
  return ((h ^ (h >>> 13)) * 1274126177 >>> 0) / 4294967296;
}
function valueNoise2(x: number, z: number, scale: number, seed = 0) {
  const xs = x / scale, zs = z / scale;
  const xi = Math.floor(xs), zi = Math.floor(zs);
  const xf = xs - xi, zf = zs - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi, seed), b = hash2(xi + 1, zi, seed);
  const c = hash2(xi, zi + 1, seed), d = hash2(xi + 1, zi + 1, seed);
  const x1 = a + (b - a) * u, x2 = c + (d - c) * u;
  return x1 + (x2 - x1) * v;
}
function fbm2(x: number, z: number, scale: number, oct = 4, gain = 0.5, seed = 0) {
  let a = 1, s = 0, n = 0, sc = scale;
  for (let i = 0; i < oct; i++) {
    s += a * valueNoise2(x, z, sc, seed + i * 1013);
    n += a; a *= gain; sc /= 2;
  }
  return s / n;
}

// rare “forest patches” to sometimes densify
const FOREST_INTENSITY = 1.75;     // >1 boosts probability
const FOREST_THRESH = 0.62;
const FOREST_SCALE_PLAINS = 260;
const FOREST_SCALE_TAIGA  = 220;

function forestBoost(x: number, z: number, biome: Biome) {
  const sc = biome === "taiga" ? FOREST_SCALE_TAIGA : FOREST_SCALE_PLAINS;
  const f = fbm2(x + 12000, z - 12000, sc, 4, 0.55, 909); // 0..1
  const t = clamp((f - (FOREST_THRESH - 0.1)) / 0.2, 0, 1); // smoothstep
  return 0.6 + t * (FOREST_INTENSITY - 0.6);
}

function isTreeCandidate(x: number, z: number, biome: Biome, y: number, env: TreeEnv) {
  if (y <= env.seaLevelY) return false;
  if (biome === "beach" || biome === "desert" || biome === "alpine" || biome === "mountains") return false;

  // blue-noise-ish: one candidate per grid cell
  const g = TREE_CONFIG.grid;
  const gx = Math.floor(x / g), gz = Math.floor(z / g);
  const rx = Math.floor(hash2(gx, gz, 9001) * g);
  const rz = Math.floor(hash2(gx, gz, 9002) * g);
  if ((x % g + g) % g !== rx) return false;
  if ((z % g + g) % g !== rz) return false;

  const baseP = biome === "taiga" ? TREE_CONFIG.baseP.taiga : TREE_CONFIG.baseP.plains;
  const boosted = Math.min(0.5, baseP * forestBoost(x, z, biome));
  return hash2(x, z, 9317) < boosted;
}

function slopeOk(env: TreeEnv, x: number, z: number, y: number) {
  const h1 = env.heightAt(x + 1, z), h2 = env.heightAt(x - 1, z);
  const h3 = env.heightAt(x, z + 1), h4 = env.heightAt(x, z - 1);
  const maxDiff = Math.max(Math.abs(h1 - y), Math.abs(h2 - y), Math.abs(h3 - y), Math.abs(h4 - y));
  return maxDiff <= TREE_CONFIG.slopeMax;
}

function plantTree(
  blocks: Array<{ x: number; y: number; z: number; id: BlockId }>,
  x: number, z: number, ySurface: number,
  biome: Biome, env: TreeEnv,
  bounds: { x0: number; x1: number; z0: number; z1: number }
) {
  const trunkId = TREE_IDS.trunk, leafId = TREE_IDS.leaf;

  const temp = env.temperatureAt ? env.temperatureAt(x, z, ySurface) : undefined;
  const isCold = typeof temp === "number" ? temp < TREE_CONFIG.coldTemp : (biome === "taiga");

  const Hbase = isCold ? 6 : 3;
  const jitter = isCold ? (hash2(x, z, 4444) < 0.5 ? 1 : 0) : (hash2(x, z, 4444) < 0.35 ? 1 : 0);
  const H = Math.min(TREE_CONFIG.maxTrunk, Hbase + jitter);

  // trunk
  for (let i = 1; i <= H; i++) blocks.push({ x, y: ySurface + i, z, id: trunkId });

  const yTop = ySurface + H;

  if (isCold) {
    // SAPIN cone: top cap
    blocks.push({ x, y: yTop + 1, z, id: leafId });
    // yTop ring: plus
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      if (Math.abs(dx) + Math.abs(dz) > 1 || (dx === 0 && dz === 0)) continue;
      const ax = x + dx, az = z + dz;
      if (ax < bounds.x0 || ax > bounds.x1 || az < bounds.z0 || az > bounds.z1) continue;
      blocks.push({ x: ax, y: yTop, z: az, id: leafId });
    }
    // yTop-1 ring: tiny diamond
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      if (Math.abs(dx) + Math.abs(dz) > 2 || (dx === 0 && dz === 0)) continue;
      const ax = x + dx, az = z + dz;
      if (ax < bounds.x0 || ax > bounds.x1 || az < bounds.z0 || az > bounds.z1) continue;
      blocks.push({ x: ax, y: yTop - 1, z: az, id: leafId });
    }
    // optional lower skirt
    if (H >= 6 && hash2(x, z, 9157) < 0.35) {
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        if (Math.abs(dx) + Math.abs(dz) !== 1) continue;
        const ax = x + dx, az = z + dz;
        if (ax < bounds.x0 || ax > bounds.x1 || az < bounds.z0 || az > bounds.z1) continue;
        blocks.push({ x: ax, y: yTop - 2, z: az, id: leafId });
      }
    }
  } else {
    // plains: small rounded crown
    for (let dy = -1; dy <= 0; dy++) {
      const r = dy === 0 ? 2 : 1, yL = yTop + dy;
      for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
        if (Math.abs(dx) + Math.abs(dz) > r || (dx === 0 && dz === 0)) continue;
        const ax = x + dx, az = z + dz;
        if (ax < bounds.x0 || ax > bounds.x1 || az < bounds.z0 || az > bounds.z1) continue;
        blocks.push({ x: ax, y: yL, z: az, id: leafId });
      }
    }
    blocks.push({ x, y: yTop + 1, z, id: leafId });
  }
}

// 👇 THIS is the named export you’re importing in worldgen
export function maybeAddTree(
  blocks: Array<{ x: number; y: number; z: number; id: BlockId }>,
  x: number, z: number, ySurface: number,
  biome: Biome, env: TreeEnv,
  bounds: { x0: number; x1: number; z0: number; z1: number }
) {
  if (!isTreeCandidate(x, z, biome, ySurface, env)) return;
  if (!slopeOk(env, x, z, ySurface)) return;
  plantTree(blocks, x, z, ySurface, biome, env, bounds);
}
