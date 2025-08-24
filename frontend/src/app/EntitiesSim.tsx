'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useDayNight } from './DayNight';
import * as THREE from 'three';
import { VVillager, VSheep, VCow, VPig } from './VoxelModels';
import { GLTFSwitch } from './GltfModels';

export type Entity = {
  id?: string;
  type: 'villager' | 'sheep' | 'cow' | 'pig';
  x: number; y: number; z: number;
  home?: [number, number, number];
  square?: [number, number, number];
  role?: string;               // farmer | guard | merchant
  skin?: 'voxel' | 'gltf';     // per-entity override (optional)
};

type State = {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  target: THREE.Vector3 | null;
  mood: 'sleep' | 'work' | 'wander' | 'go_home' | 'go_square';
  rotY: number;
  tSinceRetarget: number;
};

type SkinMode = 'voxel' | 'gltf' | 'mixed';

export default function EntitiesSim({
  data, solids
}: { data: Map<string, Entity[]>; solids: Set<string>; }) {
  const ents = useMemo(() => Array.from(data.values()).flat(), [data]);
  const states = useRef<Map<string, State>>(new Map());
  const groupRefs = useRef<Map<string, THREE.Group>>(new Map());
  const { hours } = useDayNight();

  // Default to voxel so you need no assets; toggle V/G/M if you add glb later
  const [skinMode, setSkinMode] = useState<SkinMode>('voxel');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyV') setSkinMode('voxel');
      if (e.code === 'KeyG') setSkinMode('gltf');
      if (e.code === 'KeyM') setSkinMode('mixed');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Ensure states exist for all entities
  useEffect(() => {
    for (const e of ents) {
      const id = e.id ?? `${e.type}:${e.x}:${e.y}:${e.z}`;
      if (!states.current.has(id)) {
        states.current.set(id, {
          pos: new THREE.Vector3(e.x, e.y, e.z),
          vel: new THREE.Vector3(),
          target: null,
          mood: 'wander',
          rotY: 0,
          tSinceRetarget: 999
        });
      }
    }
  }, [ents]);

  const topYAt = (x: number, yGuess: number, z: number) => {
    let best = -Infinity;
    const xi = Math.floor(x), zi = Math.floor(z);
    for (let y = Math.max(0, Math.floor(yGuess) - 40); y <= Math.floor(yGuess) + 40; y++) {
      if (solids.has(`${xi}|${y}|${zi}`)) best = Math.max(best, y);
    }
    return best === -Infinity ? 0 : best;
  };

  // Main sim loop: update AI + write transforms to group refs
  useFrame((_, dt) => {
    const H = (hours + 24) % 24;

    for (const e of ents) {
      const id = e.id ?? `${e.type}:${e.x}:${e.y}:${e.z}`;
      let s = states.current.get(id);
      if (!s) {
        s = { pos: new THREE.Vector3(e.x, e.y, e.z), vel: new THREE.Vector3(), target: null, mood: 'wander', rotY: 0, tSinceRetarget: 999 };
        states.current.set(id, s);
      }

      // Day schedule
      if (e.type === 'villager') {
        if (H >= 22 || H < 6) s.mood = 'sleep';
        else if (H < 8) s.mood = 'go_square';
        else if (H < 18) s.mood = 'work';
        else if (H < 22) s.mood = 'go_home';
      } else {
        s.mood = 'wander';
      }

      s.tSinceRetarget += dt;

      // Pick/refresh target
      if (s.mood === 'go_home' && e.home) {
        s.target = new THREE.Vector3(...e.home);
        s.tSinceRetarget = 0;
      } else if (s.mood === 'go_square' && e.square) {
        s.target = new THREE.Vector3(...e.square);
        s.tSinceRetarget = 0;
      } else if (s.mood === 'work') {
        if (!s.target || s.tSinceRetarget > 6) {
          const base = e.square ?? e.home ?? [e.x, e.y, e.z] as [number, number, number];
          const jitter = new THREE.Vector3((Math.random()-0.5)*6, 0, (Math.random()-0.5)*6);
          s.target = new THREE.Vector3(base[0], base[1], base[2]).add(jitter);
          s.tSinceRetarget = 0;
        }
      } else if (s.mood === 'wander') {
        // Go 6..14m away; if stuck, refresh 5..10s
        if (!s.target || s.pos.distanceTo(s.target) < 0.5 || s.tSinceRetarget > THREE.MathUtils.randFloat(5, 10)) {
          const angle = Math.random() * Math.PI * 2;
          const dist = THREE.MathUtils.randFloat(6, 14);
          const dx = Math.cos(angle) * dist;
          const dz = Math.sin(angle) * dist;
          s.target = s.pos.clone().add(new THREE.Vector3(dx, 0, dz));
          s.tSinceRetarget = 0;
        }
      } else if (s.mood === 'sleep' && e.home) {
        s.target = new THREE.Vector3(...e.home);
        s.tSinceRetarget = 0;
      }

      // Speeds: animals faster, nights slightly slower
      const baseSpeed = e.type === 'villager' ? 2.6 : 3.8;
      const nightFactor = (H >= 22 || H < 6) ? 0.7 : 1.0;
      const maxSpeed = baseSpeed * nightFactor;

      // Steer toward target
      if (s.target) {
        const dir = s.target.clone().sub(s.pos);
        dir.y = 0;
        const d = dir.length();
        if (d > 0.01) {
          dir.normalize().multiplyScalar(maxSpeed);
          s.vel.x = THREE.MathUtils.damp(s.vel.x, dir.x, 10, dt);
          s.vel.z = THREE.MathUtils.damp(s.vel.z, dir.z, 10, dt);
          if (Math.hypot(s.vel.x, s.vel.z) > 0.02) {
            s.rotY = Math.atan2(s.vel.x, s.vel.z);
          }
        }
      } else {
        s.vel.x = THREE.MathUtils.damp(s.vel.x, 0, 6, dt);
        s.vel.z = THREE.MathUtils.damp(s.vel.z, 0, 6, dt);
      }

      // Integrate
      s.pos.x += s.vel.x * dt;
      s.pos.z += s.vel.z * dt;

      // Ground & idle bob
      const bob = 0.03 * Math.sin(perfNow() * 2 + s.pos.x + s.pos.z);
      const yTop = topYAt(s.pos.x, s.pos.y, s.pos.z);
      s.pos.y = yTop + 1.02 + bob;

      // Arrive
      if (s.target && s.pos.distanceTo(s.target) < 0.6) {
        s.target = null;
        s.vel.setScalar(0);
      }

      // --- APPLY TRANSFORM TO THE THREE OBJECT ---
      const g = groupRefs.current.get(id);
      if (g) {
        g.position.set(s.pos.x, s.pos.y, s.pos.z);
        g.rotation.y = s.rotY;
      }
    }
  });

  return (
    <group>
      {ents.map((e) => {
        const id = e.id ?? `${e.type}:${e.x}:${e.y}:${e.z}`;
        // Ref callback to store THREE.Group
        const setRef = (el: THREE.Group | null) => {
          if (el) groupRefs.current.set(id, el);
          else groupRefs.current.delete(id);
        };
        // Initial static placement; runtime movement happens in useFrame via ref
        const s = states.current.get(id);
        const initPos = s?.pos ?? new THREE.Vector3(e.x, e.y, e.z);
        const initRotY = s?.rotY ?? 0;

        return (
          <group key={id} ref={setRef} position={[initPos.x, initPos.y, initPos.z]} rotation-y={initRotY}>
            {renderSkinned(e, e.skin ?? skinMode)}
          </group>
        );
      })}
    </group>
  );
}

function renderSkinned(e: Entity, mode: 'voxel'|'gltf'|'mixed') {
  if (mode === 'mixed') {
    if (e.type === 'villager') {
      if (e.role === 'guard') {
        return <GLTFSwitch url="/models/villager_guard.glb" scale={0.9} moving={true} voxel={<VVillager role={e.role} />} />;
      }
      return <VVillager role={e.role} />;
    }
    if (e.type === 'sheep') return <GLTFSwitch url="/models/sheep.glb" scale={0.7} moving={true} voxel={<VSheep />} />;
    if (e.type === 'cow')   return <GLTFSwitch url="/models/cow.glb"   scale={0.9} moving={true} voxel={<VCow />} />;
    if (e.type === 'pig')   return <GLTFSwitch url="/models/pig.glb"   scale={0.8} moving={true} voxel={<VPig />} />;
  }

  if (mode === 'gltf') {
    if (e.type === 'villager') {
      const url = e.role === 'guard' ? '/models/villager_guard.glb' : '/models/villager.glb';
      return <GLTFSwitch url={url} scale={0.95} moving={true} voxel={<VVillager role={e.role} />} />;
    }
    if (e.type === 'sheep') return <GLTFSwitch url="/models/sheep.glb" scale={0.7} moving={true} voxel={<VSheep />} />;
    if (e.type === 'cow')   return <GLTFSwitch url="/models/cow.glb"   scale={0.9} moving={true} voxel={<VCow />} />;
    if (e.type === 'pig')   return <GLTFSwitch url="/models/pig.glb"   scale={0.8} moving={true} voxel={<VPig />} />;
  }

  // voxel-only
  if (e.type === 'villager') return <VVillager role={e.role} />;
  if (e.type === 'sheep') return <VSheep />;
  if (e.type === 'cow')   return <VCow />;
  if (e.type === 'pig')   return <VPig />;
  return <VVillager role="common" />;
}

// lightweight time
function perfNow() {
  if (typeof performance !== 'undefined' && performance.now) return performance.now() / 1000;
  return Date.now() / 1000;
}
