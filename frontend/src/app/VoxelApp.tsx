'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import FPSControls from './FPSControls';

type Block = { x: number; y: number; z: number; material: string };
type ChunkResponse = { size: number; origin: [number, number, number]; blocks: Block[] };

const MAT_COLOR: Record<string, number> = {
  grass:  0x5cae3e,
  dirt:   0x8b5a2b,
  stone:  0x9e9e9e,
  water:  0x3daee9,
  sand:   0xf4e19c,
  wood:   0xa96e3b,
  leaves: 0x2e7d32,
  air:    0xcccccc,
};

export default function VoxelApp() {
  const [chunk, setChunk] = useState<ChunkResponse | null>(null);

  useEffect(() => {
    // Direct to Django (avoids your proxy redirect)
    fetch('http://127.0.0.1:8000/api/chunk?world=1&cx=0&cy=0&cz=0&size=16')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setChunk)
      .catch(err => console.warn('Chunk load failed:', err));
  }, []);

  // Build a set of solid voxel cells for collisions
  const solid = useMemo(() => {
    const s = new Set<string>();
    if (!chunk) return s;
    const solidMaterials = new Set(['grass','dirt','stone','wood','leaves','sand','water']);
    for (const b of chunk.blocks) {
      if (solidMaterials.has(b.material)) s.add(`${b.x}|${b.y}|${b.z}`);
    }
    return s;
  }, [chunk]);

  return (
    <div style={{ width: '100%', height: '80vh', border: '1px solid #eee', borderRadius: 8, position: 'relative' }}>
      <Canvas camera={{ position: [10, 8, 16], fov: 60 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[20, 30, 10]} intensity={0.9} castShadow />
        {chunk && <ChunkMesh blocks={chunk.blocks} />}
        {/* Physics-aware FPS controller */}
        <FPSControls solid={solid} />
      </Canvas>

      {/* Crosshair */}
      <div style={{
        position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
        width: 16, height: 16, pointerEvents: 'none'
      }}>
        <div style={{ position: 'absolute', left: 7, top: 0, width: 2, height: 16, background: '#0008' }} />
        <div style={{ position: 'absolute', top: 7, left: 0, width: 16, height: 2, background: '#0008' }} />
      </div>

      <div style={{ marginTop: 8, opacity: 0.7 }}>
        click inside → mouse locks • ZQSD/WASD to move • Space to jump • Shift to sprint • Esc to unlock
      </div>
    </div>
  );
}

function ChunkMesh({ blocks }: { blocks: Block[] }) {
  const byMat = useMemo(() => {
    const m = new Map<string, Block[]>();
    for (const b of blocks) {
      if (!m.has(b.material)) m.set(b.material, []);
      m.get(b.material)!.push(b);
    }
    return m;
  }, [blocks]);

  return (
    <>
      {Array.from(byMat.entries()).map(([mat, list]) => (
        <CubeInstances key={mat} color={MAT_COLOR[mat] ?? 0xcccccc} blocks={list} />
      ))}
    </>
  );
}

function CubeInstances({ color, blocks }: { color: number; blocks: {x:number;y:number;z:number}[] }) {
  const ref = useRef<THREE.InstancedMesh>(null!);
  const dummy = useRef(new THREE.Object3D());
  const box = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const material = useMemo(() => new THREE.MeshStandardMaterial({ color }), [color]);

  useEffect(() => {
    if (!ref.current) return;
    blocks.forEach((b, i) => {
      dummy.current.position.set(b.x + 0.5, b.y + 0.5, b.z + 0.5);
      dummy.current.updateMatrix();
      ref.current.setMatrixAt(i, dummy.current.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  }, [blocks]);

  // tiny sway just for depth perception
  useFrame(({ clock }) => { if (ref.current) ref.current.rotation.y = Math.sin(clock.elapsedTime * 0.1) * 0.02; });

  return <instancedMesh ref={ref} args={[box, material, blocks.length]} castShadow receiveShadow />;
}
