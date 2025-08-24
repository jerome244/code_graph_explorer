'use client';
import { useEffect, useMemo, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { PointerLockControls } from '@react-three/drei';
import * as THREE from 'three';

type Axis = 'x' | 'y' | 'z';

/**
 * Basic capsule-ish player represented by an AABB:
 *  - radius (x/z) = 0.35
 *  - height (y) = 1.8
 * Camera sits at pos.y + EYE above ground.
 */
export default function FPSControls({ solid }: { solid: Set<string> }) {
  const { camera } = useThree();

  // --- constants ---
  const RADIUS = 0.35;        // half-width in x/z
  const HEIGHT = 1.8;         // player's height
  const EYE = 1.6;            // camera eye height from feet
  const G = 20;               // gravity (m/s^2)
  const JUMP = 7.5;           // jump speed
  const SPEED = 6;            // walk speed
  const SPRINT = 11;          // sprint speed
  const SUB_DT = 1 / 120;     // physics substep
  const EPS = 1e-4;

  // --- state ---
  const keys = useRef<Record<string, boolean>>({});
  const pos = useRef(new THREE.Vector3(8, 6, 8));            // start on the grass
  const vel = useRef(new THREE.Vector3());                   // current velocity
  const fwd = useRef(new THREE.Vector3());
  const right = useRef(new THREE.Vector3());
  const up = useRef(new THREE.Vector3(0, 1, 0));
  const onGround = useRef(false);

  // --- helpers for voxel collision ---
  const isSolid = useMemo(() => {
    return (x: number, y: number, z: number) => solid.has(`${x}|${y}|${z}`);
  }, [solid]);

  // keyboard
  useEffect(() => {
    const down = (e: KeyboardEvent) => { keys.current[e.code] = true; };
    const upH  = (e: KeyboardEvent) => { keys.current[e.code] = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', upH);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', upH); };
  }, []);

  // physics + camera follow
  useFrame((_, dt) => {
    // clamp dt (tab switch, etc.)
    const maxDt = 0.05;
    let t = Math.min(dt, maxDt);

    // build desired horizontal direction from keys (AZERTY & WASD)
    const forwardKey = keys.current['KeyW'] || keys.current['KeyZ'] || keys.current['ArrowUp'];
    const backKey    = keys.current['KeyS'] || keys.current['ArrowDown'];
    const leftKey    = keys.current['KeyA'] || keys.current['KeyQ'] || keys.current['ArrowLeft'];
    const rightKey   = keys.current['KeyD'] || keys.current['ArrowRight'];
    const sprinting  = keys.current['ShiftLeft'] || keys.current['ShiftRight'];

    camera.getWorldDirection(fwd.current);
    fwd.current.y = 0; fwd.current.normalize();
    right.current.crossVectors(fwd.current, up.current).normalize().multiplyScalar(-1); // camera-right

    const moveDir = new THREE.Vector3();
    if (forwardKey) moveDir.add(fwd.current);
    if (backKey)    moveDir.addScaledVector(fwd.current, -1);
    if (rightKey)   moveDir.add(right.current);
    if (leftKey)    moveDir.addScaledVector(right.current, -1);
    if (moveDir.lengthSq() > 0) moveDir.normalize();

    const targetSpeed = (sprinting ? SPRINT : SPEED);
    const desiredVx = moveDir.x * targetSpeed;
    const desiredVz = moveDir.z * targetSpeed;

    // set horizontal velocity directly (arcade-style)
    vel.current.x = desiredVx;
    vel.current.z = desiredVz;

    // jump
    if (keys.current['Space'] && onGround.current) {
      vel.current.y = JUMP;
      onGround.current = false;
    }

    // substep integration with axis-wise collision
    while (t > 0) {
      const step = Math.min(SUB_DT, t);
      // gravity
      vel.current.y -= G * step;

      // reset ground each substep; set true if a downward collision happens
      onGround.current = false;

      // sweep Y then X then Z (helps with steps)
      sweepAxis('y', vel.current.y * step);
      sweepAxis('x', vel.current.x * step);
      sweepAxis('z', vel.current.z * step);

      t -= step;
    }

    // camera follows player head
    camera.position.set(pos.current.x, pos.current.y + EYE, pos.current.z);
  });

  // pointer lock rotates camera; we move the camera position ourselves above
  return <PointerLockControls />;

  // ------- collision routines --------
  function sweepAxis(axis: Axis, delta: number) {
    if (delta === 0) return;
    const p = pos.current;

    // try tentative move along the axis
    const next = p.clone();
    next[axis] += delta;

    // AABB after move
    const minX = next.x - RADIUS, maxX = next.x + RADIUS;
    const minY = next.y,          maxY = next.y + HEIGHT;
    const minZ = next.z - RADIUS, maxZ = next.z + RADIUS;

    // cells overlapped
    const x0 = Math.floor(minX), x1 = Math.floor(maxX);
    const y0 = Math.floor(minY), y1 = Math.floor(maxY);
    const z0 = Math.floor(minZ), z1 = Math.floor(maxZ);

    let blocked = false;
    let bound: number;

    if (delta > 0) {
      bound = Infinity;
      for (let xi = x0; xi <= x1; xi++) {
        for (let yi = y0; yi <= y1; yi++) {
          for (let zi = z0; zi <= z1; zi++) {
            if (!isSolid(xi, yi, zi)) continue;
            const candidate = contactPosition(axis, 1, { xi, yi, zi });
            if (candidate < bound) { bound = candidate; blocked = true; }
          }
        }
      }
      if (blocked) {
        p[axis] = bound;
        if (axis === 'y') vel.current.y = Math.min(0, vel.current.y); // hit ceiling
        else vel.current[axis] = 0;
        return;
      }
    } else { // delta < 0
      bound = -Infinity;
      for (let xi = x0; xi <= x1; xi++) {
        for (let yi = y0; yi <= y1; yi++) {
          for (let zi = z0; zi <= z1; zi++) {
            if (!isSolid(xi, yi, zi)) continue;
            const candidate = contactPosition(axis, -1, { xi, yi, zi });
            if (candidate > bound) { bound = candidate; blocked = true; }
          }
        }
      }
      if (blocked) {
        p[axis] = bound;
        if (axis === 'y') {
          vel.current.y = Math.max(0, vel.current.y);
          onGround.current = true; // landed
        } else {
          vel.current[axis] = 0;
        }
        return;
      }
    }

    // free: apply full move
    p[axis] += delta;
  }

  function contactPosition(axis: Axis, dir: 1 | -1, cell: { xi: number; yi: number; zi: number }) {
    // Where to place the player's position so the AABB just touches the block
    // Block AABB: [xi,xi+1]x[yi,yi+1]x[zi,zi+1]
    if (axis === 'x') {
      return dir > 0
        ? cell.xi - RADIUS - EPS                           // player maxX = block minX
        : cell.xi + 1 + RADIUS + EPS;                      // player minX = block maxX
    }
    if (axis === 'z') {
      return dir > 0
        ? cell.zi - RADIUS - EPS
        : cell.zi + 1 + RADIUS + EPS;
    }
    // axis === 'y'
    return dir > 0
      ? cell.yi - HEIGHT - EPS                             // player top = block bottom
      : cell.yi + 1 + EPS;                                 // player feet = block top
  }
}
