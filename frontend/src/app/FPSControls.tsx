'use client';
import { useEffect, useMemo, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { PointerLockControls } from '@react-three/drei';
import * as THREE from 'three';

type Axis = 'x' | 'y' | 'z';

export default function FPSControls({ solid, water }: { solid: Set<string>; water: Set<string> }) {
  const { camera } = useThree();

  // --- constants ---
  const RADIUS = 0.35;
  const HEIGHT = 1.8;
  const EYE = 1.6;
  const G = 20;
  const JUMP = 7.5;
  const SPEED = 6;
  const SPRINT = 11;
  const SUB_DT = 1 / 120;
  const EPS = 1e-4;

  // water params
  const WATER_SPEED = 3.5;
  const WATER_GRAV = G * 0.35;
  const BUOYANCY = 12;
  const WATER_DRAG = 3.5;
  const SWIM_UP = 4.5;
  const SWIM_DOWN = -2.0;

  // --- state ---
  const keys = useRef<Record<string, boolean>>({});
  const pos = useRef(new THREE.Vector3(8, 12, 8));  // slightly higher spawn
  const vel = useRef(new THREE.Vector3());
  const fwd = useRef(new THREE.Vector3());
  const right = useRef(new THREE.Vector3());
  const up = useRef(new THREE.Vector3(0, 1, 0));
  const onGround = useRef(false);

  const isSolid = useMemo(() => (x:number,y:number,z:number)=>solid.has(`${x}|${y}|${z}`), [solid]);
  const isWater = useMemo(() => (x:number,y:number,z:number)=>water.has(`${x}|${y}|${z}`), [water]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => { keys.current[e.code] = true; };
    const upH  = (e: KeyboardEvent) => { keys.current[e.code] = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', upH);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', upH); };
  }, []);

  useFrame((_, dt) => {
    const maxDt = 0.05; let t = Math.min(dt, maxDt);

    // movement intent
    const forwardKey = keys.current['KeyW'] || keys.current['KeyZ'] || keys.current['ArrowUp'];
    const backKey    = keys.current['KeyS'] || keys.current['ArrowDown'];
    const leftKey  = keys.current['KeyD'] || keys.current['ArrowLeft'];
    const rightKey = keys.current['KeyA'] || keys.current['KeyQ'] || keys.current['ArrowRight'];    const sprinting  = keys.current['ShiftLeft'] || keys.current['ShiftRight'];
    const swimDown   = keys.current['ControlLeft'] || keys.current['ControlRight'];

    camera.getWorldDirection(fwd.current);
    fwd.current.y = 0; fwd.current.normalize();
    // Right-handed basis: right = up × forward
    right.current.crossVectors(up.current, fwd.current).normalize();

    // detect if player capsule intersects any water voxel between feet..head
    const feet = Math.floor(pos.current.y);
    const head = Math.floor(pos.current.y + HEIGHT);
    let inWater = false;
    outer: for (let y = feet; y <= head; y++) {
      if (isWater(Math.floor(pos.current.x), y, Math.floor(pos.current.z))) { inWater = true; break outer; }
    }

    const moveDir = new THREE.Vector3();
    if (forwardKey) moveDir.add(fwd.current);
    if (backKey)    moveDir.addScaledVector(fwd.current, -1);
    if (rightKey)   moveDir.add(right.current);
    if (leftKey)    moveDir.addScaledVector(right.current, -1);
    if (moveDir.lengthSq() > 0) moveDir.normalize();

    const targetSpeed = inWater ? WATER_SPEED : (sprinting ? SPRINT : SPEED);
    vel.current.x = moveDir.x * targetSpeed;
    vel.current.z = moveDir.z * targetSpeed;

    // jump / swim
    if (inWater) {
      if (keys.current['Space']) vel.current.y = SWIM_UP;
      else if (swimDown) vel.current.y = SWIM_DOWN;
    } else if (keys.current['Space'] && onGround.current) {
      vel.current.y = JUMP; onGround.current = false;
    }

    while (t > 0) {
      const step = Math.min(SUB_DT, t);

      // gravity + buoyancy + drag
      const g = inWater ? WATER_GRAV : G;
      vel.current.y -= g * step;
      if (inWater) {
        // buoyancy pushes up a bit when submerged
        vel.current.y += BUOYANCY * step * 0.5;
        // simple drag across all axes
        vel.current.x = THREE.MathUtils.damp(vel.current.x, 0, WATER_DRAG, step);
        vel.current.z = THREE.MathUtils.damp(vel.current.z, 0, WATER_DRAG, step);
      }

      onGround.current = false;

      // axis sweeps (ignore water since it's not in 'solid')
      sweepAxis('y', vel.current.y * step);
      sweepAxis('x', vel.current.x * step);
      sweepAxis('z', vel.current.z * step);

      t -= step;
    }

    camera.position.set(pos.current.x, pos.current.y + EYE, pos.current.z);
  });

  return <PointerLockControls />;

  function sweepAxis(axis: Axis, delta: number) {
    if (delta === 0) return;
    const p = pos.current;
    const next = p.clone(); next[axis] += delta;

    const minX = next.x - RADIUS, maxX = next.x + RADIUS;
    const minY = next.y,          maxY = next.y + HEIGHT;
    const minZ = next.z - RADIUS, maxZ = next.z + RADIUS;

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
        if (axis === 'y') vel.current.y = Math.min(0, vel.current.y);
        else vel.current[axis] = 0;
        return;
      }
    } else {
      bound = -Infinity;
      for (let xi = x0; xi <= x1; xi++) for (let yi = y0; yi <= y1; yi++) for (let zi = z0; zi <= z1; zi++) {
        if (!isSolid(xi, yi, zi)) continue;
        const candidate = contactPosition(axis, -1, { xi, yi, zi });
        if (candidate > bound) { bound = candidate; blocked = true; }
      }
      if (blocked) {
        p[axis] = bound;
        if (axis === 'y') { vel.current.y = Math.max(0, vel.current.y); onGround.current = true; }
        else { vel.current[axis] = 0; }
        return;
      }
    }
    p[axis] += delta;
  }

  function contactPosition(axis: Axis, dir: 1 | -1, cell: { xi: number; yi: number; zi: number }) {
    if (axis === 'x') return dir > 0 ? cell.xi - RADIUS - EPS : cell.xi + 1 + RADIUS + EPS;
    if (axis === 'z') return dir > 0 ? cell.zi - RADIUS - EPS : cell.zi + 1 + RADIUS + EPS;
    return dir > 0 ? cell.yi - HEIGHT - EPS : cell.yi + 1 + EPS;
  }
}
