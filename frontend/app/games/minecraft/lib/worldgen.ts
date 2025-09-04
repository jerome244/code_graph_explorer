// lib/worldgen.ts
import type { BlockId } from "./types";
import { CHUNK_SIZE, chunkBounds } from "./chunks";

// -------- seeded RNG & noise (deterministic, dependency-free) --------
function xorshift32(seed: number) {
  let x = seed | 0;
  return () => {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}
function hash2(x: number, y: number, seed = 1337) {
  // integer hash -> [0,1)
  const h = ((x * 374761393) ^ (y * 668265263) ^ seed) >>> 0;
  return ((h ^ (h >>> 13)) * 1274126177 >>> 0) / 4294967296;
}
// smooth value-noise with bilinear interp
function valueNoise2D(x: number, y: number, freq = 0.05, seed = 1337) {
  const xf = x * freq, yf = y * freq;
  const x0 = Math.floor(xf), y0 = Math.floor(yf);
  const tx = xf - x0, ty = yf - y0;
  const h00 = hash2(x0,     y0,     seed);
  const h10 = hash2(x0 + 1, y0,     seed);
  const h01 = hash2(x0,     y0 + 1, seed);
  const h11 = hash2(x0 + 1, y0 + 1, seed);
  const u = tx * tx * (3 - 2 * tx);
  const v = ty * ty * (3 - 2 * ty);
  const a = h00 * (1 - u) + h10 * u;
  const b = h01 * (1 - u) + h11 * u;
  return a * (1 - v) + b * v; // [0,1]
}

export function heightAt(x: number, z: number): number {
  // multi-octave value noise, tweak to taste
  const h =
    16 * valueNoise2D(x, z, 0.008, 11) +
    8  * valueNoise2D(x, z, 0.02,  29) +
    2  * valueNoise2D(x, z, 0.08,  71);
  const base = 2; // sea level-ish baseline
  return Math.floor(base + h); // integer terrain height
}

export function blockFor(y: number, h: number): BlockId {
  if (y === h) return 1;           // Grass
  if (y < h && y >= h - 3) return 2; // Dirt
  if (y < h - 3) return 3;         // Stone
  return 0 as unknown as BlockId;  // air (never used)
}

export function generateChunk(cx: number, cz: number) {
  // 🚀 surface-only: 1 block per column
  const { x0, z0, x1, z1 } = chunkBounds(cx, cz);
  const blocks: Array<{ x: number; y: number; z: number; id: BlockId }> = [];
  for (let x = x0; x <= x1; x++) {
    for (let z = z0; z <= z1; z++) {
      const h = heightAt(x, z);
      const id = blockFor(h, h); // top surface
      blocks.push({ x, y: h, z, id });
    }
  }
  return blocks;
}