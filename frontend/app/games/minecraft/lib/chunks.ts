// lib/chunks.ts
export const CHUNK_SIZE = 16;

export type ChunkCoord = { cx: number; cz: number };

export function worldToChunk(x: number, z: number): ChunkCoord {
  const cx = Math.floor(Math.floor(x) / CHUNK_SIZE);
  const cz = Math.floor(Math.floor(z) / CHUNK_SIZE);
  return { cx, cz };
}

export function chunkKey(cx: number, cz: number) {
  return `${cx},${cz}`;
}

export function cellKey(x: number, y: number, z: number) {
  return `${x},${y},${z}`;
}

export function chunkBounds(cx: number, cz: number) {
  const x0 = cx * CHUNK_SIZE;
  const z0 = cz * CHUNK_SIZE;
  return { x0, z0, x1: x0 + CHUNK_SIZE - 1, z1: z0 + CHUNK_SIZE - 1 };
}
