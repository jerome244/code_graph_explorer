'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useDayNight } from './DayNight';
import * as THREE from 'three';
import { VVillager, VSheep, VCow, VPig } from './VoxelModels';
import { GLTFSwitch } from './GltfModels';

export type Entity = {
  id?: string;
  type: string;                // villager | sheep | cow | pig
  x: number; y: number; z: number;
  home?: [number, number, number];
  square?: [number, number, number];
  role?: string;               // farmer | guard | merchant
  skin?: 'voxel' | 'gltf';     // optional per-entity override
};

type State = {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  target: THREE.Vector3 | null;
  mood: 'sleep' | 'work' | 'wander' | 'go_home' | 'go_square';
};

type SkinMode = 'voxel' | 'gltf' | 'mixed';

export default function EntitiesSim({ data, solids }: { data: Map<string, Entity[]>; solids: Set<string>; }) {
  const entsMap = useMemo(() => Array.from(data.values()).flat(), [data]);
  const states = useRef<Map<string, State>>(new Map());
  const { hours } = useDayNight();

  // Default to voxel so no assets are required
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

  // ensure states exist
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
        s = { pos: new THREE.Vector3(e.x, e.y, e.z), vel: new THREE.Vector3(), target: null, mood: 'wander' };
        states.current.set(id, s);
      }

      // schedule
      if (e.type === 'villager') {
        if (H >= 22 || H < 6) s.mood = 'sleep';
        else if (H < 8) s.mood = 'go_square';
        else if (H < 18) s.mood = 'work';
        else if (H < 22) s.mood = 'go_home';
      } else {
        s.mood = 'wander';
      }

      // choose target
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

      // move
      const baseSpeed = e.type === 'villager' ? 2.5 : 1.8;
      const nightFactor = (H >= 22 || H < 6) ? 0.6 : 1.0;
      const maxSpeed = baseSpeed * nightFactor;

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
      s.pos.x += s.vel.x * dt;
      s.pos.z += s.vel.z * dt;

      // ground snap
      const yTop = topYAt(s.pos.x, s.pos.y, s.pos.z);
      s.pos.y = yTop + 1.02;

      if (s.target && s.pos.distanceTo(s.target) < 0.6) {
        s.target = null;
        s.vel.setScalar(0);
      }
    }
  });

  // render
  return (
    <group>
      {entsMap.map((e) => {
        const id = e.id ?? `${e.type}:${e.x}:${e.y}:${e.z}`;
        let s = states.current.get(id);
        if (!s) {
          s = { pos: new THREE.Vector3(e.x, e.y, e.z), vel: new THREE.Vector3(), target: null, mood: 'wander' };
          states.current.set(id, s);
        }
        const speed = Math.hypot(s.vel.x, s.vel.z);
        const moving = speed > 0.05;
        const mode = e.skin ?? skinMode;

        return (
          <group key={id} position={s.pos}>
            {renderSkinned(e, mode, moving)}
          </group>
        );
      })}
    </group>
  );
}

function renderSkinned(e: Entity, mode: 'voxel'|'gltf'|'mixed', moving: boolean) {
  // 'mixed': villagers voxel (guards try GLTF), animals GLTF when present (fallback voxel)
  if (mode === 'mixed') {
    if (e.type === 'villager') {
      if (e.role === 'guard') {
        return <GLTFSwitch url="/models/villager_guard.glb" scale={0.9} moving={moving} voxel={<VVillager role={e.role} />} />;
      }
      return <VVillager role={e.role} />;
    }
    if (e.type === 'sheep') return <GLTFSwitch url="/models/sheep.glb" scale={0.7} moving={moving} voxel={<VSheep />} />;
    if (e.type === 'cow')   return <GLTFSwitch url="/models/cow.glb"   scale={0.9} moving={moving} voxel={<VCow />} />;
    if (e.type === 'pig')   return <GLTFSwitch url="/models/pig.glb"   scale={0.8} moving={moving} voxel={<VPig />} />;
  }

  if (mode === 'gltf') {
    if (e.type === 'villager') {
      const url = e.role === 'guard' ? '/models/villager_guard.glb' : '/models/villager.glb';
      return <GLTFSwitch url={url} scale={0.95} moving={moving} voxel={<VVillager role={e.role} />} />;
    }
    if (e.type === 'sheep') return <GLTFSwitch url="/models/sheep.glb" scale={0.7} moving={moving} voxel={<VSheep />} />;
    if (e.type === 'cow')   return <GLTFSwitch url="/models/cow.glb"   scale={0.9} moving={moving} voxel={<VCow />} />;
    if (e.type === 'pig')   return <GLTFSwitch url="/models/pig.glb"   scale={0.8} moving={moving} voxel={<VPig />} />;
  }

  // voxel
  if (e.type === 'villager') return <VVillager role={e.role} />;
  if (e.type === 'sheep') return <VSheep />;
  if (e.type === 'cow')   return <VCow />;
  if (e.type === 'pig')   return <VPig />;
  return <VVillager role="common" />;
}
