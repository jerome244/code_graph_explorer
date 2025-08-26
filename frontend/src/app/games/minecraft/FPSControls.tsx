'use client';
import { useEffect, useMemo, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { PointerLockControls } from '@react-three/drei';
import * as THREE from 'three';

type Axis = 'x' | 'y' | 'z';

export default function FPSControls({
  solid,
  water,
  onPose,
}: {
  solid: Set<string>;
  water: Set<string>;
  onPose?: (x: number, y: number, z: number, ry: number) => void;
}) {
  const { camera } = useThree();

  // --- constants ---
  const RADIUS = 0.35;     // capsule half-width in x/z
  const HEIGHT = 1.8;      // body height
  const EYE = 1.6;         // eye height above feet
  const G = 20;            // gravity (m/s^2)
  const JUMP = 7.5;        // jump speed
  const SPEED = 6;         // walk speed
  const SPRINT = 11;       // sprint speed
  const SUB_DT = 1 / 120;  // physics substep
  const EPS = 1e-4;
  const VOID_Y = -32;      // safety floor; respawn if we fall below this

  // --- state ---
  const keys = useRef<Record<string, boolean>>({});
  const pos = useRef(new THREE.Vector3(8, 6, 8));
  const vel = useRef(new THREE.Vector3());
  const fwd = useRef(new THREE.Vector3());
  const right = useRef(new THREE.Vector3());
  const up = useRef(new THREE.Vector3(0, 1, 0));
  const onGround = useRef(false);

  // world readiness + spawn management
  const spawned = useRef(false);

  const isSolid = useMemo(() => {
    return (x: number, y: number, z: number) => solid.has(`${x}|${y}|${z}`);
  }, [solid]);

  const isWaterAt = useMemo(() => {
    return (x: number, y: number, z: number) => water.has(`${x}|${y}|${z}`);
  }, [water]);

  // Snap to the highest solid block at current x,z (called once chunks exist)
  function snapToGround() {
    if (solid.size === 0) return; // nothing loaded yet
    const xi = Math.floor(pos.current.x);
    const zi = Math.floor(pos.current.z);

    let topY = Number.NEGATIVE_INFINITY;
    solid.forEach(k => {
      const [sx, sy, sz] = k.split('|').map(Number);
      if (sx === xi && sz === zi && sy > topY) topY = sy;
    });

    if (topY !== Number.NEGATIVE_INFINITY) {
      pos.current.set(xi + 0.5, topY + 1 + EPS, zi + 0.5);
      vel.current.set(0, 0, 0);
      onGround.current = true;
      camera.position.set(pos.current.x, pos.current.y + EYE, pos.current.z);
      spawned.current = true;
    }
  }

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
    // If we haven't spawned yet, wait until some terrain exists then snap to it.
    if (!spawned.current) {
      if (solid.size > 0) snapToGround();
      // Keep camera synced while waiting
      camera.position.set(pos.current.x, pos.current.y + EYE, pos.current.z);
      if (onPose) onPose(pos.current.x, pos.current.y + EYE, pos.current.z, camera.rotation.y);
      return;
    }

    // clamp dt (tab switch, spikes)
    const maxDt = 0.05;
    let t = Math.min(dt, maxDt);

    // build desired horizontal direction (AZERTY & WASD) with Q⇄D inverted
    // D = left, A/Q = right
    const forwardKey = keys.current['KeyW'] || keys.current['KeyZ'] || keys.current['ArrowUp'];
    const backKey    = keys.current['KeyS'] || keys.current['ArrowDown'];
    const leftKey    = keys.current['KeyD'] || keys.current['ArrowLeft'];           // inverted
    const rightKey   = keys.current['KeyA'] || keys.current['KeyQ'] || keys.current['ArrowRight']; // inverted
    const sprinting  = keys.current['ShiftLeft'] || keys.current['ShiftRight'];
    const swimDown   = keys.current['ControlLeft'] || keys.current['ControlRight'];

    camera.getWorldDirection(fwd.current);
    fwd.current.y = 0; fwd.current.normalize();
    right.current.crossVectors(fwd.current, up.current).normalize().multiplyScalar(-1);

    const moveDir = new THREE.Vector3();
    if (forwardKey) moveDir.add(fwd.current);
    if (backKey)    moveDir.addScaledVector(fwd.current, -1);
    if (rightKey)   moveDir.add(right.current);
    if (leftKey)    moveDir.addScaledVector(right.current, -1);
    if (moveDir.lengthSq() > 0) moveDir.normalize();

    const targetSpeed = (sprinting ? SPRINT : SPEED);
    vel.current.x = moveDir.x * targetSpeed;
    vel.current.z = moveDir.z * targetSpeed;

    // swimming?
    const feetInWater = isWaterAt(Math.floor(pos.current.x), Math.floor(pos.current.y + 0.1), Math.floor(pos.current.z));
    const headInWater = isWaterAt(Math.floor(pos.current.x), Math.floor(pos.current.y + EYE), Math.floor(pos.current.z));
    const inWater = feetInWater || headInWater;

    // jump or swim up/down
    if (inWater) {
      const swimUp = keys.current['Space'];
      if (swimUp)        vel.current.y = THREE.MathUtils.damp(vel.current.y,  3.5, 8, dt);
      else if (swimDown) vel.current.y = THREE.MathUtils.damp(vel.current.y, -3.5, 8, dt);
      else               vel.current.y = THREE.MathUtils.damp(vel.current.y,  0.0, 5, dt);
    } else if (keys.current['Space'] && onGround.current) {
      vel.current.y = JUMP;
      onGround.current = false;
    }

    // integrate with substeps
    while (t > 0) {
      const step = Math.min(SUB_DT, t);

      // gravity (reduced in water)
      const gNow = inWater ? G * 0.2 : G;
      vel.current.y -= gNow * step;

      onGround.current = false;

      // sweep Y then X then Z
      sweepAxis('y', vel.current.y * step);
      sweepAxis('x', vel.current.x * step);
      sweepAxis('z', vel.current.z * step);

      t -= step;
    }

    // Safety: if we fell out of the loaded world, snap back to ground
    if (pos.current.y < VOID_Y) {
      spawned.current = false;   // force re-snap next frame (if solids exist)
      snapToGround();
      if (!spawned.current) {
        // If still not spawned (no ground at current x/z), keep camera synced and bail
        camera.position.set(pos.current.x, pos.current.y + EYE, pos.current.z);
        if (onPose) onPose(pos.current.x, pos.current.y + EYE, pos.current.z, camera.rotation.y);
        return;
      }
    }

    // camera follows player head
    camera.position.set(pos.current.x, pos.current.y + EYE, pos.current.z);

    // optional: send pose to multiplayer
    if (onPose) onPose(pos.current.x, pos.current.y + EYE, pos.current.z, camera.rotation.y);
  });

  // pointer lock rotates camera; we move the camera position ourselves above
  return <PointerLockControls />;

  // ------- collision routines --------
  function sweepAxis(axis: Axis, delta: number) {
    if (delta === 0) return;
    const p = pos.current;

    // tentative move along the axis
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
      for (let xi = x0; xi <= x1; xi++) for (let yi = y0; yi <= y1; yi++) for (let zi = z0; zi <= z1; zi++) {
        if (!isSolid(xi, yi, zi)) continue;
        const candidate = contactPosition(axis, 1, { xi, yi, zi });
        if (candidate < bound) { bound = candidate; blocked = true; }
      }
      if (blocked) {
        p[axis] = bound;
        if (axis === 'y') vel.current.y = Math.min(0, vel.current.y); else vel.current[axis] = 0;
        return;
      }
    } else { // delta < 0
      bound = -Infinity;
      for (let xi = x0; xi <= x1; xi++) for (let yi = y0; yi <= y1; yi++) for (let zi = z0; zi <= z1; zi++) {
        if (!isSolid(xi, yi, zi)) continue;
        const candidate = contactPosition(axis, -1, { xi, yi, zi });
        if (candidate > bound) { bound = candidate; blocked = true; }
      }
      if (blocked) {
        p[axis] = bound;
        if (axis === 'y') { vel.current.y = Math.max(0, vel.current.y); onGround.current = true; }
        else vel.current[axis] = 0;
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
        ? cell.xi - RADIUS - EPS         // player maxX = block minX
        : cell.xi + 1 + RADIUS + EPS;    // player minX = block maxX
    }
    if (axis === 'z') {
      return dir > 0
        ? cell.zi - RADIUS - EPS
        : cell.zi + 1 + RADIUS + EPS;
    }
    // axis === 'y'
    return dir > 0
      ? cell.yi - HEIGHT - EPS          // player top = block bottom
      : cell.yi + 1 + EPS;              // player feet = block top
  }
}
