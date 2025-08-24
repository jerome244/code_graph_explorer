'use client';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useDayNight } from './DayNight';
import * as THREE from 'three';

export type Entity = {
  id?: string;
  type: string;
  x: number; y: number; z: number;
  home?: [number, number, number];
  square?: [number, number, number];
  role?: string;
};

type State = {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  target: THREE.Vector3 | null;
  mood: 'sleep' | 'work' | 'wander' | 'go_home' | 'go_square';
};

export default function EntitiesSim({ data, solids }: { data: Map<string, Entity[]>; solids: Set<string>; }) {
  const entsMap = useMemo(() => Array.from(data.values()).flat(), [data]);

  // persistent state per id
  const states = useRef<Map<string, State>>(new Map());
  const { hours } = useDayNight();

  // ensure states exist when entities arrive/update
  useEffect(() => {
    for (const e of entsMap) {
      const id = e.id ?? `${e.type}:${e.x}:${e.y}:${e.z}`;
      if (!states.current.has(id)) {
        states.current.set(id, {
          pos: new THREE.Vector3(e.x, e.y, e.z),
          vel: new THREE.Vector3(),
          target: null,
          mood: 'wander',
        });
      }
    }
  }, [entsMap]);

  // ground helper: find highest solid at (x,z) near y
  const topYAt = (x: number, yGuess: number, z: number) => {
    let best = -Infinity;
    const xi = Math.floor(x), zi = Math.floor(z);
    for (let y = Math.max(0, Math.floor(yGuess) - 40); y <= Math.floor(yGuess) + 40; y++) {
      if (solids.has(`${xi}|${y}|${zi}`)) best = Math.max(best, y);
    }
    return best === -Infinity ? 0 : best;
  };

  useFrame((_, dt) => {
    const H = (hours + 24) % 24;

    for (const e of entsMap) {
      const id = e.id ?? `${e.type}:${e.x}:${e.y}:${e.z}`;
      let s = states.current.get(id);
      if (!s) {
        // Safety: initialize immediately if effect hasn't run yet
        s = {
          pos: new THREE.Vector3(e.x, e.y, e.z),
          vel: new THREE.Vector3(),
          target: null,
          mood: 'wander',
        };
        states.current.set(id, s);
      }

      // Schedule / mood
      if (e.type === 'villager') {
        if (H >= 22 || H < 6) s.mood = 'sleep';
        else if (H < 8) s.mood = 'go_square';
        else if (H < 18) s.mood = 'work';
        else if (H < 22) s.mood = 'go_home';
      } else {
        s.mood = 'wander'; // animals
      }

      // Target selection
      if (s.mood === 'go_home' && e.home) s.target = new THREE.Vector3(...e.home);
      else if (s.mood === 'go_square' && e.square) s.target = new THREE.Vector3(...e.square);
      else if (s.mood === 'work') {
        const base = e.square ?? e.home ?? [e.x, e.y, e.z] as [number, number, number];
        const jitter = new THREE.Vector3((Math.random()-0.5)*6, 0, (Math.random()-0.5)*6);
        s.target = new THREE.Vector3(base[0], base[1], base[2]).add(jitter);
      } else if (s.mood === 'wander') {
        if (!s.target || s.pos.distanceTo(s.target) < 0.5) {
          const jitter = new THREE.Vector3((Math.random()-0.5)*12, 0, (Math.random()-0.5)*12);
          s.target = s.pos.clone().add(jitter);
        }
      } else if (s.mood === 'sleep' && e.home) {
        s.target = new THREE.Vector3(...e.home);
      }

      // Movement
      const speed = (e.type === 'villager') ? 2.5 : 1.8;
      const nightFactor = (H >= 22 || H < 6) ? 0.6 : 1.0;
      const maxSpeed = speed * nightFactor;

      if (s.target) {
        const dir = s.target.clone().sub(s.pos);
        dir.y = 0;
        const d = dir.length();
        if (d > 0.01) {
          dir.normalize().multiplyScalar(maxSpeed);
          s.vel.x = THREE.MathUtils.damp(s.vel.x, dir.x, 6, dt);
          s.vel.z = THREE.MathUtils.damp(s.vel.z, dir.z, 6, dt);
        }
      }

      // apply move
      s.pos.x += s.vel.x * dt;
      s.pos.z += s.vel.z * dt;

      // snap to terrain
      const yTop = topYAt(s.pos.x, s.pos.y, s.pos.z);
      s.pos.y = yTop + 1.02;

      // Arrive
      if (s.target && s.pos.distanceTo(s.target) < 0.6) {
        s.target = null;
        s.vel.setScalar(0);
      }
    }
  });

  // render models (safe-init during render)
  return (
    <group>
      {entsMap.map((e) => {
        const id = e.id ?? `${e.type}:${e.x}:${e.y}:${e.z}`;
        let s = states.current.get(id);
        if (!s) {
          s = {
            pos: new THREE.Vector3(e.x, e.y, e.z),
            vel: new THREE.Vector3(),
            target: null,
            mood: 'wander',
          };
          states.current.set(id, s);
        }
        return (
          <group key={id} position={s.pos}>
            {renderEntityModel(e)}
          </group>
        );
      })}
    </group>
  );
}

// Simple voxel-ish models
function renderEntityModel(e: Entity) {
  switch (e.type) {
    case 'villager':   return <Villager role={e.role} />;
    case 'sheep':      return <Sheep />;
    case 'cow':        return <Cow />;
    case 'pig':        return <Pig />;
    default:           return <Villager role="common" />;
  }
}

function Villager({ role }: { role?: string }) {
  const coat = role === 'guard' ? 0x455a64 : role === 'merchant' ? 0xffb74d : 0x7cb342;
  return (
    <group>
      <mesh position={[0, 0.35, 0]}><boxGeometry args={[0.6, 0.7, 0.4]} /><meshStandardMaterial color={coat} /></mesh>
      <mesh position={[0, 0.9, 0]}><boxGeometry args={[0.35, 0.35, 0.35]} /><meshStandardMaterial color={0xffe0b2} /></mesh>
      <mesh position={[-0.15, 0.05, 0]}><boxGeometry args={[0.18, 0.2, 0.18]} /><meshStandardMaterial color={0x333333} /></mesh>
      <mesh position={[ 0.15, 0.05, 0]}><boxGeometry args={[0.18, 0.2, 0.18]} /><meshStandardMaterial color={0x333333} /></mesh>
      <mesh position={[-0.35, 0.42, 0]}><boxGeometry args={[0.2, 0.2, 0.2]} /><meshStandardMaterial color={coat} /></mesh>
      <mesh position={[ 0.35, 0.42, 0]}><boxGeometry args={[0.2, 0.2, 0.2]} /><meshStandardMaterial color={coat} /></mesh>
    </group>
  );
}
function Sheep() {
  return (
    <group>
      <mesh position={[0, 0.25, 0]}><boxGeometry args={[0.7, 0.5, 0.4]} /><meshStandardMaterial color={0xffffff} /></mesh>
      <mesh position={[0, 0.55, 0.2]}><boxGeometry args={[0.25, 0.25, 0.25]} /><meshStandardMaterial color={0xffffff} /></mesh>
    </group>
  );
}
function Cow() {
  return (
    <group>
      <mesh position={[0, 0.3, 0]}><boxGeometry args={[0.9, 0.6, 0.5]} /><meshStandardMaterial color={0x5d4037} /></mesh>
      <mesh position={[0.2, 0.6, 0.25]}><boxGeometry args={[0.3, 0.3, 0.3]} /><meshStandardMaterial color={0x5d4037} /></mesh>
    </group>
  );
}
function Pig() {
  return (
    <group>
      <mesh position={[0, 0.25, 0]}><boxGeometry args={[0.7, 0.5, 0.45]} /><meshStandardMaterial color={0xff8a80} /></mesh>
      <mesh position={[0.2, 0.55, 0.2]}><boxGeometry args={[0.25, 0.25, 0.25]} /><meshStandardMaterial color={0xff8a80} /></mesh>
    </group>
  );
}
