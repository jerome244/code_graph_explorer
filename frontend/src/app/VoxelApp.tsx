'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import FPSControls from './FPSControls';
import SkySunClouds from './SkySunClouds';
import { DayNightProvider } from './DayNight';
import EntitiesSim, { Entity } from './EntitiesSim';
import Interactions from './Interactions';

type Block = { x:number; y:number; z:number; material:string };
type ChunkResp = { size:number; origin:[number,number,number]; blocks: Block[] };

const MAT_COLOR: Record<string, number> = {
  grass:  0x5cae3e,
  dirt:   0x8b5a2b,
  stone:  0x9e9e9e,
  snow:   0xffffff,
  water:  0x3daee9,
  sand:   0xf4e19c,
  wood:   0xa96e3b,
  leaves: 0x2e7d32,
  planks: 0xcaa472,
  air:    0xcccccc,
};

const CHUNK_SIZE = 16;
const RADIUS = 2;

export default function VoxelApp() {
  const [solid, setSolid] = useState<Set<string>>(new Set());
  const [water, setWater] = useState<Set<string>>(new Set());
  const [chunks, setChunks] = useState<Map<string, ChunkResp>>(new Map());
  const [entities, setEntities] = useState<Map<string, Entity[]>>(new Map());
  const [overrides, setOverrides] = useState<Map<string, string|null>>(new Map()); // key -> material or null

  return (
    <div style={{ width: '100%', height: '80vh', border: '1px solid #eee', borderRadius: 8, position: 'relative' }}>
      <Canvas camera={{ position: [10, 12, 16], fov: 70 }}>
        <DayNightProvider dayLengthSec={180}>
          <SkySunClouds />

          <WorldLoader
            chunks={chunks} setChunks={setChunks}
            entities={entities} setEntities={setEntities}
            setSolid={setSolid} setWater={setWater}
          />

          {Array.from(chunks.values()).map((c) => (
            <Chunk key={`${c.origin[0]}|${c.origin[2]}`} data={c} overrides={overrides} />
          ))}

          {/* placed blocks layer */}
          <PlacedOverrides overrides={overrides} />

          {/* NPCs & animals */}
          <EntitiesSim data={entities} solids={solid} />

          {/* Player controller (swims in water; AZERTY Q⇄D inverted) */}
          <FPSControls solid={solid} water={water} />

          {/* Interactions (mine/place, etc.) */}
          <Interactions
            solids={solid} water={water}
            overrides={overrides} setOverrides={setOverrides}
            setSolids={setSolid}
          />
        </DayNightProvider>
      </Canvas>

      {/* Crosshair */}
      <div style={{
        position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
        width: 16, height: 16, pointerEvents: 'none'
      }}>
        <div style={{ position: 'absolute', left: 7, top: 0, width: 2, height: 16, background: '#0008' }} />
        <div style={{ position: 'absolute', top: 7, left: 0, width: 16, height: 2, background: '#0008' }} />
      </div>
    </div>
  );
}

function WorldLoader({
  chunks, setChunks, entities, setEntities, setSolid, setWater
}: {
  chunks: Map<string, ChunkResp>;
  setChunks: React.Dispatch<React.SetStateAction<Map<string, ChunkResp>>>;
  entities: Map<string, Entity[]>;
  setEntities: React.Dispatch<React.SetStateAction<Map<string, Entity[]>>>;
  setSolid: React.Dispatch<React.SetStateAction<Set<string>>>;
  setWater: React.Dispatch<React.SetStateAction<Set<string>>>;
}) {
  const { camera } = useThree();
  const lastCenter = useRef<string>("");

  const loadChunk = async (cx: number, cz: number) => {
    const key = `${cx}|${cz}`;
    if (chunks.has(key)) return;
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/chunk?cx=${cx}&cy=0&cz=${cz}&size=${CHUNK_SIZE}`);
      if (!res.ok) return;
      const data: ChunkResp = await res.json();

      setChunks(prev => { const m = new Map(prev); m.set(key, data); return m; });

      // extend solids/water sets
      const solidMaterials = new Set(['grass','dirt','stone','wood','leaves','sand','planks','snow']);
      const waterLocal: string[] = [];
      const solidLocal: string[] = [];
      for (const b of data.blocks) {
        const k = `${b.x}|${b.y}|${b.z}`;
        if (b.material === 'water') waterLocal.push(k);
        else if (solidMaterials.has(b.material)) solidLocal.push(k);
      }
      setWater(prev => { const s = new Set(prev); waterLocal.forEach(k => s.add(k)); return s; });
      setSolid(prev => { const s = new Set(prev); solidLocal.forEach(k => s.add(k)); return s; });

      const er = await fetch(`http://127.0.0.1:8000/api/entities?cx=${cx}&cz=${cz}&size=${CHUNK_SIZE}`);
      if (er.ok) {
        const ed = await er.json();
        setEntities(prev => { const m = new Map(prev); m.set(key, (ed.entities ?? []) as Entity[]); return m; });
      }
    } catch {}
  };

  useFrame(() => {
    const cx = Math.floor(camera.position.x / CHUNK_SIZE);
    const cz = Math.floor(camera.position.z / CHUNK_SIZE);
    const centerKey = `${cx}|${cz}`;
    if (centerKey === lastCenter.current) return;
    lastCenter.current = centerKey;

    for (let dz = -RADIUS; dz <= RADIUS; dz++)
      for (let dx = -RADIUS; dx <= RADIUS; dx++)
        loadChunk(cx + dx, cz + dz);

    setChunks(prev => {
      const m = new Map(prev);
      for (const k of prev.keys()) {
        const [kx, kz] = k.split('|').map(Number);
        if (Math.abs(kx - cx) > RADIUS + 1 || Math.abs(kz - cz) > RADIUS + 1) m.delete(k);
      }
      // rebuild solids/water from remaining
      const solidMaterials = new Set(['grass','dirt','stone','wood','leaves','sand','planks','snow']);
      const newSolid = new Set<string>(), newWater = new Set<string>();
      for (const c of m.values()) {
        for (const b of c.blocks) {
          const k = `${b.x}|${b.y}|${b.z}`;
          if (b.material === 'water') newWater.add(k);
          else if (solidMaterials.has(b.material)) newSolid.add(k);
        }
      }
      setSolid(newSolid); setWater(newWater);

      setEntities(prevE => {
        const ne = new Map<string, Entity[]>();
        for (const k of m.keys()) if (prevE.has(k)) ne.set(k, prevE.get(k)!);
        return ne;
      });
      return m;
    });
  });

  return null;
}

function Chunk({ data, overrides }: { data: ChunkResp; overrides: Map<string, string|null> }) {
  const groups = useMemo(() => {
    const m = new Map<string, {x:number;y:number;z:number}[]>();
    for (const b of data.blocks) {
      const k = `${b.x}|${b.y}|${b.z}`;
      if (overrides.has(k)) continue; // mined or replaced -> skip base block
      if (!m.has(b.material)) m.set(b.material, []);
      m.get(b.material)!.push(b);
    }
    return m;
  }, [data, overrides]);

  return (
    <>
      {Array.from(groups.entries()).map(([mat, list]) => (
        <Cubes key={`${data.origin.join('|')}-${mat}`} color={MAT_COLOR[mat] ?? 0xcccccc} blocks={list} />
      ))}
    </>
  );
}

function PlacedOverrides({ overrides }: { overrides: Map<string, string|null> }) {
  const placed = useMemo(() => {
    const out: {x:number;y:number;z:number;mat:string}[] = [];
    overrides.forEach((mat, k) => {
      if (!mat) return; // ignore removals (not shown yet)
      const [x,y,z] = k.split('|').map(Number);
      out.push({ x, y, z, mat });
    });
    return out;
  }, [overrides]);

  const byMat = useMemo(() => {
    const m = new Map<string, {x:number;y:number;z:number}[]>();
    for (const b of placed) {
      if (!m.has(b.mat)) m.set(b.mat, []);
      m.get(b.mat)!.push(b);
    }
    return m;
  }, [placed]);

  return (
    <>
      {Array.from(byMat.entries()).map(([mat, list]) => (
        <Cubes key={`ovr-${mat}`} color={MAT_COLOR[mat] ?? 0xcccccc} blocks={list} />
      ))}
    </>
  );
}

function Cubes({ color, blocks }: { color:number; blocks:{x:number;y:number;z:number}[] }) {
  const ref = useRef<THREE.InstancedMesh>(null!);
  const dummy = useRef(new THREE.Object3D());
  const box = useMemo(() => new THREE.BoxGeometry(1,1,1), []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color }), [color]);

  useEffect(() => {
    if (!ref.current) return;
    blocks.forEach((b, i) => {
      dummy.current.position.set(b.x + 0.5, b.y + 0.5, b.z + 0.5);
      dummy.current.updateMatrix();
      ref.current.setMatrixAt(i, dummy.current.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  }, [blocks]);

  return <instancedMesh ref={ref} args={[box, mat, blocks.length]} castShadow receiveShadow />;
}
