// lib/physics.ts
import * as THREE from "three";

export const PLAYER_HEIGHT = 1.6;   // eye is the top of the player
export const PLAYER_RADIUS = 0.3;   // ~0.6m wide

// Tunables
const STEP_HEIGHT = 0.7;
const EPS = 1e-4;
const SUBSTEP = 0.03;

export type HasBlockFn = (x: number, y: number, z: number) => boolean;

// ---------- placement helpers ----------
export function playerAABBMinMax(eye: THREE.Vector3) {
  const min = new THREE.Vector3(eye.x - PLAYER_RADIUS, eye.y - PLAYER_HEIGHT, eye.z - PLAYER_RADIUS);
  const max = new THREE.Vector3(eye.x + PLAYER_RADIUS, eye.y,                    eye.z + PLAYER_RADIUS);
  return { min, max };
}

export function blockOverlapsPlayer(eye: THREE.Vector3, bx: number, by: number, bz: number, pad = 0.02) {
  const { min, max } = playerAABBMinMax(eye);
  const bmin = new THREE.Vector3(bx - pad, by - pad, bz - pad);
  const bmax = new THREE.Vector3(bx + 1 + pad, by + 1 + pad, bz + 1 + pad);
  const sep =
    max.x <= bmin.x || min.x >= bmax.x ||
    max.y <= bmin.y || min.y >= bmax.y ||
    max.z <= bmin.z || min.z >= bmax.z;
  return !sep;
}

// ---------- collision core ----------
function aabbOverlapsBlock(min: THREE.Vector3, max: THREE.Vector3, bx: number, by: number, bz: number) {
  return !(
    max.x <= bx || min.x >= bx + 1 ||
    max.y <= by || min.y >= by + 1 ||
    max.z <= bz || min.z >= bz + 1
  );
}

function playerAABBAt(pos: THREE.Vector3) {
  const min = new THREE.Vector3(pos.x - PLAYER_RADIUS, pos.y - PLAYER_HEIGHT, pos.z - PLAYER_RADIUS);
  const max = new THREE.Vector3(pos.x + PLAYER_RADIUS, pos.y, pos.z + PLAYER_RADIUS);
  return { min, max };
}

function collides(pos: THREE.Vector3, hasBlock: HasBlockFn) {
  const { min, max } = playerAABBAt(pos);
  const ix0 = Math.floor(min.x), ix1 = Math.floor(max.x);
  const iy0 = Math.floor(min.y), iy1 = Math.floor(max.y);
  const iz0 = Math.floor(min.z), iz1 = Math.floor(max.z);

  for (let x = ix0; x <= ix1; x++) {
    for (let y = iy0; y <= iy1; y++) {
      for (let z = iz0; z <= iz1; z++) {
        if (hasBlock(x, y, z) && aabbOverlapsBlock(min, max, x, y, z)) return true;
      }
    }
  }
  return false;
}

function sweepAxis(pos: THREE.Vector3, axis: "x" | "y" | "z", delta: number, hasBlock: HasBlockFn) {
  if (delta === 0) return { moved: 0, hit: false };
  const sign = Math.sign(delta);
  const steps = Math.ceil(Math.abs(delta) / SUBSTEP);
  const step = (Math.abs(delta) / steps) * sign;

  let moved = 0;
  for (let i = 0; i < steps; i++) {
    (pos as any)[axis] += step;
    if (collides(pos, hasBlock)) {
      (pos as any)[axis] -= step;
      (pos as any)[axis] += (sign > 0 ? 1 : -1) * EPS;
      return { moved, hit: true };
    }
    moved += step;
  }
  return { moved, hit: false };
}

function tryAutoStep(basePos: THREE.Vector3, horiz: THREE.Vector3, hasBlock: HasBlockFn) {
  const attempt = (order: "xz" | "zx") => {
    const pos = basePos.clone();

    // raise by STEP_HEIGHT (swept)
    const up = sweepAxis(pos, "y", STEP_HEIGHT, hasBlock);
    if (up.hit) return null;

    // horizontal at raised height; try both orders
    if (order === "xz") {
      const mx = sweepAxis(pos, "x", horiz.x, hasBlock);
      const mz = sweepAxis(pos, "z", horiz.z, hasBlock);
      if (mx.hit || mz.hit) return null;
    } else {
      const mz = sweepAxis(pos, "z", horiz.z, hasBlock);
      const mx = sweepAxis(pos, "x", horiz.x, hasBlock);
      if (mx.hit || mz.hit) return null;
    }

    // settle down generously
    sweepAxis(pos, "y", -STEP_HEIGHT - 1, hasBlock);
    return pos;
  };

  return attempt("xz") ?? attempt("zx");
}

/**
 * Push the player out of any overlapping blocks (if something spawned on them).
 * Returns a possibly adjusted position and whether we moved.
 */
export function depenetrate(position: THREE.Vector3, hasBlock: HasBlockFn, maxIters = 8) {
  const pos = position.clone();
  let moved = false;

  for (let iter = 0; iter < maxIters; iter++) {
    const { min, max } = playerAABBAt(pos);
    const ix0 = Math.floor(min.x), ix1 = Math.floor(max.x);
    const iy0 = Math.floor(min.y), iy1 = Math.floor(max.y);
    const iz0 = Math.floor(min.z), iz1 = Math.floor(max.z);

    let bestAxis: "x" | "y" | "z" | null = null;
    let bestDelta = 0;

    for (let x = ix0; x <= ix1; x++) {
      for (let y = iy0; y <= iy1; y++) {
        for (let z = iz0; z <= iz1; z++) {
          if (!hasBlock(x, y, z)) continue;
          if (!aabbOverlapsBlock(min, max, x, y, z)) continue;

          // penetration distances to each face of the block
          const pushPosX = (x + 1) - min.x;
          const pushNegX = max.x - x;
          const pushPosY = (y + 1) - min.y;
          const pushNegY = max.y - y;
          const pushPosZ = (z + 1) - min.z;
          const pushNegZ = max.z - z;

          // choose smallest of the six displacements (axis-aligned MTV)
          const candidates: Array<{ axis: "x" | "y" | "z"; delta: number }> = [
            { axis: "x", delta:  pushPosX + EPS },
            { axis: "x", delta: -pushNegX - EPS },
            { axis: "y", delta:  pushPosY + EPS },
            { axis: "y", delta: -pushNegY - EPS },
            { axis: "z", delta:  pushPosZ + EPS },
            { axis: "z", delta: -pushNegZ - EPS },
          ];

          for (const c of candidates) {
            const abs = Math.abs(c.delta);
            if (bestAxis === null || abs < Math.abs(bestDelta)) {
              bestAxis = c.axis;
              bestDelta = c.delta;
            }
          }
        }
      }
    }

    if (bestAxis === null) break; // no overlaps
    (pos as any)[bestAxis] += bestDelta;
    moved = true;

    // continue looping in case of multiple overlapping blocks
  }

  return { position: pos, moved };
}

export function moveWithCollisions(
  position: THREE.Vector3,
  velocity: THREE.Vector3,
  dt: number,
  hasBlock: HasBlockFn
) {
  const desired = velocity.clone().multiplyScalar(dt);
  const pos = position.clone();

  // Horizontal first (with step-up fallback)
  const horiz = new THREE.Vector3(desired.x, 0, desired.z);
  const xHit = sweepAxis(pos, "x", horiz.x, hasBlock).hit;
  const zHit = sweepAxis(pos, "z", horiz.z, hasBlock).hit;

  if ((xHit || zHit) && (Math.abs(horiz.x) + Math.abs(horiz.z) > 0)) {
    const stepped = tryAutoStep(position, horiz, hasBlock);
    if (stepped) pos.copy(stepped);
  }

  // Then vertical (gravity/jump)
  let onGround = false;
  const ySweep = sweepAxis(pos, "y", desired.y, hasBlock);
  if (ySweep.hit && desired.y < 0) onGround = true;

  const newVelocity = velocity.clone();
  if (ySweep.hit) newVelocity.y = 0;

  return { position: pos, velocity: newVelocity, onGround };
}
