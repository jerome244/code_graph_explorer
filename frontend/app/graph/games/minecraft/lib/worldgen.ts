// lib/worldgen.ts
// Deterministic terrain + biomes (temperature × moisture) with no deps.
// Alps mode: tall massifs, sharp ridges; rivers & seas; deeper oceans; stacked water columns.
// Surface-only generation per (x,z) column; trees added via lib/trees.ts.

import type { BlockId } from "./types";
import { chunkBounds } from "./chunks";
// Robust import to avoid transient hot-reload shape issues
import * as Trees from "./trees";

// -------- utils: hash, lerp, noise, fbm --------
function hash2(x: number, y: number, seed = 1337) {
  const h = ((x * 374761393) ^ (y * 668265263) ^ seed) >>> 0;
  return ((h ^ (h >>> 13)) * 1274126177 >>> 0) / 4294967296;
}
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10); // Perlin fade
function smoothStep01(e0: number, e1: number, x: number) {
  const t = clamp((x - e0) / Math.max(1e-6, e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

function valueNoise2(x: number, z: number, scale: number, seed = 0) {
  const xs = x / scale, zs = z / scale;
  const xi = Math.floor(xs), zi = Math.floor(zs);
  const xf = xs - xi, zf = zs - zi;
  const u = fade(xf), v = fade(zf);
  const a = hash2(xi, zi, seed);
  const b = hash2(xi + 1, zi, seed);
  const c = hash2(xi, zi + 1, seed);
  const d = hash2(xi + 1, zi + 1, seed);
  const x1 = lerp(a, b, u);
  const x2 = lerp(c, d, u);
  return lerp(x1, x2, v); // [0,1]
}

function fbm2(
  x: number,
  z: number,
  {
    octaves = 4,
    lacunarity = 2.0,
    gain = 0.5,
    scale = 128,
    seed = 0,
  }: { octaves?: number; lacunarity?: number; gain?: number; scale?: number; seed?: number }
) {
  let amp = 1, freqScale = scale, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise2(x, z, freqScale, seed + i * 1013);
    norm += amp;
    amp *= gain;
    freqScale /= lacunarity;
  }
  return sum / norm; // [0,1]
}

// ----------------------- Height & Biomes -----------------------
const WORLD_BASE = 12;
const WORLD_VAR  = 36; // much taller world

// Keep sea near a fixed height even as WORLD_VAR changes
const SEA_LEVEL_TARGET = 20;
const SEA_BAND = clamp((SEA_LEVEL_TARGET - WORLD_BASE) / WORLD_VAR, 0, 1);
const MOUNTAIN_BAND = 0.70; // stone shows a bit earlier for mountain look

// Water configuration (using Glass (7) as water for now)
const WATER_BLOCK_ID = 7 as BlockId;
export const SEA_LEVEL_Y = Math.floor(WORLD_BASE + SEA_BAND * WORLD_VAR);

// Rivers
const RIVER_SCALE = 420;      // bigger = longer, fewer rivers
const RIVER_WIDTH = 0.035;    // ~half-width in noise space (lower => narrower)
const RIVER_MAX_DEPTH = 5;    // a hair deeper to match bigger relief

// Terrain roughness controls
const RELIEF_GAIN      = 0.85; // hillier regions get much hillier
const WARP_STRENGTH    = 38;   // stronger domain warp
const WARP_SCALE       = 160;  // slightly tighter warps
const MICRO_BUMP_AMPL  = 1.5;  // tiny texture
const MICRO_BUMP_SCALE = 14;

// Extra water depth settings
const WATER_MAX_STACK   = 8;  // stack a short column for visual depth (perf cap)
const OCEAN_BASIN_DEPTH = 6;  // extra carve below terrain for oceans
const SHELF_WIDTH       = 0.08; // coastal shelf band kept shallow

export function heightAt(x: number, z: number): number {
  // Domain warp to break up long, straight flats
  const wx = (valueNoise2(x + 9102, z - 771, WARP_SCALE, 321) - 0.5) * 2 * WARP_STRENGTH;
  const wz = (valueNoise2(x - 551, z + 4431, WARP_SCALE, 654) - 0.5) * 2 * WARP_STRENGTH;
  const xw = x + wx;
  const zw = z + wz;

  // Base: continents (unwarped) + warped ridges/detail
  const continent = fbm2(x, z, { scale: 220, octaves: 4, gain: 0.55, seed: 42 });
  const ridges0   = 1 - Math.abs(2 * valueNoise2(xw, zw, 80, 7) - 1);
  const detail    = fbm2(xw + 1000, zw - 1000, { scale: 26, octaves: 4, gain: 0.55, seed: 99 });

  let elev01 = clamp(0.52 * continent + 0.30 * ridges0 + 0.18 * detail, 0, 1);

  // ---------- Big-mountain pass ----------
  // Regional mask: where mountains are allowed to get extremely tall
  const massifMask = fbm2(x - 12000, z + 12000, { scale: 520, octaves: 3, gain: 0.6, seed: 313 });
  const massif = smoothStep01(0.55, 0.9, massifMask); // 0..1

  // Emphasize only the high band
  const highBand = smoothStep01(0.60, 0.98, elev01);

  // Ridged spines (sharper)
  const ridgeRaw = 1.0 - Math.abs(2.0 * valueNoise2(xw - 4000, zw + 4000, 72, 707) - 1.0);
  const ridge = Math.pow(ridgeRaw, 1.6);

  // Add a normalized lift to peaks; gated by massif & highBand
  const PEAK_LIFT = 0.38; // how much of the normalized range we can add
  elev01 = clamp(elev01 + PEAK_LIFT * massif * highBand * ridge, 0, 1);

  // Regional relief variation — some areas much steeper
  const reliefMask = fbm2(x + 5000, z - 5000, { scale: 280, octaves: 3, gain: 0.6, seed: 222 });
  const relief = 1 + RELIEF_GAIN * (reliefMask * 2 - 1); // 1±RELIEF_GAIN
  elev01 = clamp(0.5 + (elev01 - 0.5) * relief, 0, 1);

  // Micro bumps (± ~1–2 blocks)
  const micro = (fbm2(x - 1234, z + 4321, { scale: MICRO_BUMP_SCALE, octaves: 2, gain: 0.55, seed: 777 }) - 0.5) * 2 * MICRO_BUMP_AMPL;

  const y = Math.floor(WORLD_BASE + elev01 * WORLD_VAR + micro);
  return y;
}

// — Temperature & Moisture (both [0,1]) —
function temperatureAt(x: number, z: number, elevY: number) {
  const t = fbm2(x + 3000, z - 5000, { scale: 650, octaves: 4, gain: 0.55, seed: 1337 });
  const altitudePenalty = clamp((elevY - 18) / 28, 0, 1) * 0.55; // higher = colder
  return clamp(t - altitudePenalty);
}
function moistureAt(x: number, z: number, elev01: number) {
  const m = fbm2(x - 8000, z + 2500, { scale: 520, octaves: 4, gain: 0.6, seed: 2025 });
  const seaBoost = clamp((SEA_BAND - elev01) * 1.6, 0, 0.25);
  return clamp(m + seaBoost);
}

// Push temperature & moisture away from the middle to reduce plains dominance
const CLIMATE_CONTRAST = 0.18; // 0..0.6 — higher = more extremes (fewer plains)
function contrast01(v: number, k = CLIMATE_CONTRAST) {
  return clamp(0.5 + (v - 0.5) * (1 + 2 * k));
}

// Global weight for plains vs. other biomes
const PLAINS_WEIGHT = 0.55; // lower => fewer plains

export type Biome = "desert" | "plains" | "taiga" | "mountains" | "alpine" | "beach";

export function biomeAt(x: number, z: number): Biome {
  const y = heightAt(x, z);
  const elev01 = clamp((y - WORLD_BASE) / WORLD_VAR, 0, 1);

  // Hard elevation gates first
  if (elev01 > 0.90) return temperatureAt(x, z, y) < 0.50 ? "alpine" : "mountains";
  if (elev01 < SEA_BAND + 0.02) return "beach";

  // Climate fields with contrast to reduce middling values (plains)
  const T0 = temperatureAt(x, z, y);
  const M0 = moistureAt(x, z, elev01);
  const T = contrast01(T0);
  const M = contrast01(M0);

  // Soft scores; pick the max — fewer plains via PLAINS_WEIGHT
  const desertScore = T * (1 - M);                  // hot & dry
  const taigaScore = (1 - T) * (0.4 + 0.6 * M);     // cold, prefers some moisture
  const plainsScore = Math.max(0, (1 - 2 * Math.abs(T - 0.5)) * (1 - 2 * Math.abs(M - 0.5))) * PLAINS_WEIGHT;

  if (desertScore >= taigaScore && desertScore >= plainsScore) return "desert";
  if (taigaScore >= desertScore && taigaScore >= plainsScore) return "taiga";
  return "plains";
}

// ----------------------- Rivers & Water -----------------------
function riverProximity01(x: number, z: number) {
  const n = valueNoise2(x + 1111, z - 1111, RIVER_SCALE, 12345);
  return Math.abs(0.5 - n) * 2; // [0,1]
}
function riverStrengthAt(x: number, z: number) {
  const d = riverProximity01(x, z);
  return clamp((RIVER_WIDTH - d) / RIVER_WIDTH, 0, 1);
}

// Choose the visible top block at a given surface height (no water logic)
function topBlockForAtHeight(x: number, z: number, y: number): BlockId {
  // Cheap slope probe (4-neighbors) → stone on steep slopes for mountain look
  const s = Math.max(
    Math.abs(heightAt(x + 1, z) - y),
    Math.abs(heightAt(x - 1, z) - y),
    Math.abs(heightAt(x, z + 1) - y),
    Math.abs(heightAt(x, z - 1) - y)
  );
  if (s >= 2) return 3; // Stone

  const elev01 = clamp((y - WORLD_BASE) / WORLD_VAR, 0, 1);
  const b = biomeAt(x, z);

  // 1: Grass, 2: Dirt, 3: Stone, 4: Sand, 5: Wood, 6: Brick, 7: Glass (used as Water), 8: Lava, 9: Snow
  switch (b) {
    case "beach":
      return 4; // Sand
    case "desert": {
      const hotDry = temperatureAt(x, z, y) > 0.8 && moistureAt(x, z, elev01) < 0.25;
      const chance = hash2(Math.floor(x), Math.floor(z), 555) < 0.015;
      if (hotDry && chance) return 8; // Lava vents
      return 4; // Sand otherwise
    }
    case "taiga":
      return 9; // Snow
    case "mountains":
      return 3; // Stone
    case "alpine":
      return 9; // High, cold → Snow
    case "plains":
    default:
      if (elev01 > MOUNTAIN_BAND) return 3; // rocky at very high plains
      return 1; // Grass
  }
}

// Public helper retained for compatibility
export function topBlockFor(x: number, z: number): BlockId {
  const y = heightAt(x, z);
  return topBlockForAtHeight(x, z, y);
}

// ----- Ocean bathymetry helpers -----
function oceanExtraDepth(x: number, z: number, bedY: number) {
  // Extra ocean depth depends on local basin noise and how far below sea we are.
  const below = SEA_LEVEL_Y - bedY;
  if (below <= 0) return 0;
  const depth01 = clamp(below / (WORLD_VAR * 0.6), 0, 1);
  const basin = fbm2(x + 15000, z - 15000, { scale: 340, octaves: 3, gain: 0.55, seed: 818 });
  // Keep continental shelf (near shore) shallower:
  const shelf01 = clamp((SEA_LEVEL_Y - bedY) / WORLD_VAR, 0, 1);
  const shelfMask = 1.0 - smoothStep01(0.0, SHELF_WIDTH, shelf01); // 1 offshore, 0 on shelf
  const extra = Math.floor((0.25 + 0.75 * basin) * depth01 * OCEAN_BASIN_DEPTH * shelfMask);
  return Math.max(0, extra);
}

function waterBedAt(x: number, z: number) {
  // Recreate the carve logic to know where the bed ends up (ocean or river).
  const yTerrain = heightAt(x, z);
  const elev01 = clamp((yTerrain - WORLD_BASE) / WORLD_VAR, 0, 1);
  const d = Math.abs(0.5 - valueNoise2(x + 1111, z - 1111, RIVER_SCALE, 12345)) * 2;
  const r = clamp((RIVER_WIDTH - d) / RIVER_WIDTH, 0, 1);
  let bed = yTerrain;
  if (r > 0 && elev01 > SEA_BAND + 0.02 && elev01 < 0.95) {
    bed = yTerrain - Math.floor(r * RIVER_MAX_DEPTH);
  }
  if (bed < SEA_LEVEL_Y) {
    bed -= oceanExtraDepth(x, z, bed);
  }
  return bed;
}

// Compute the visible surface (y,id) after rivers & sea are applied
export function surfaceAt(x: number, z: number): { y: number; id: BlockId } {
  const yTerrain = heightAt(x, z);
  const elev01 = clamp((yTerrain - WORLD_BASE) / WORLD_VAR, 0, 1);

  // Carve river channels (only inland)
  const r = riverStrengthAt(x, z);
  let yCarved = yTerrain;
  if (r > 0 && elev01 > SEA_BAND + 0.02 && elev01 < 0.95) {
    yCarved = yTerrain - Math.floor(r * RIVER_MAX_DEPTH);
  }

  // Oceans / seas (flat surface at SEA_LEVEL_Y)
  if (yCarved < SEA_LEVEL_Y) {
    // deepen ocean basins under the surface before returning
    yCarved -= oceanExtraDepth(x, z, yCarved);
    return { y: SEA_LEVEL_Y, id: WATER_BLOCK_ID };
  }

  // Inland rivers: fill the carved channel with water
  if (r > 0 && elev01 > SEA_BAND + 0.02) {
    const riverSurface = Math.min(yTerrain, yCarved + 1);
    return { y: riverSurface, id: WATER_BLOCK_ID };
  }

  // Land: return biome top block at carved height
  const id = topBlockForAtHeight(x, z, yCarved);
  return { y: yCarved, id };
}

// Legacy helper kept for compatibility with other imports
export function blockFor(y: number, h: number): BlockId {
  if (y === h) return 1;              // Grass (unused; top is handled in surfaceAt)
  if (y < h && y >= h - 3) return 2;  // Dirt
  if (y < h - 3) return 3;            // Stone
  return 1 as BlockId;                // default
}

// Generate a whole chunk (surface-only): one block per column at (x, z)
// + stacks water downward a bit for visible depth; + sparse trees on land.
export function generateChunk(cx: number, cz: number) {
  const { x0, z0, x1, z1 } = chunkBounds(cx, cz);
  const blocks: Array<{ x: number; y: number; z: number; id: BlockId }> = [];
  for (let x = x0; x <= x1; x++) {
    for (let z = z0; z <= z1; z++) {
      const { y, id } = surfaceAt(x, z);
      blocks.push({ x, y, z, id });

      if (id === WATER_BLOCK_ID) {
        // Fill a short column of water down toward the bed for visual depth
        const bed = waterBedAt(x, z);
        let added = 0;
        for (let wy = y - 1; wy > bed && added < WATER_MAX_STACK; wy--, added++) {
          blocks.push({ x, y: wy, z, id: WATER_BLOCK_ID });
        }
      } else {
        // Sparse trees (separate module). Only on land.
        const b = biomeAt(x, z);
        Trees.maybeAddTree?.(
          blocks,
          x, z, y,
          b,
          {
            heightAt,
            seaLevelY: SEA_LEVEL_Y,
            temperatureAt: (xx, zz, yy) => temperatureAt(xx, zz, yy), // ensures sapins in cold zones
          },
          { x0, x1, z0, z1 }
        );
      }
    }
  }
  return blocks;
}
