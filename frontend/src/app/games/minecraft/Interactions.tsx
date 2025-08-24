'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

type SetStr = React.Dispatch<React.SetStateAction<Set<string>>>;
type Overrides = Map<string, string|null>;

export default function Interactions({
  solids, water, overrides, setOverrides, setSolids
}: {
  solids: Set<string>;
  water: Set<string>;
  overrides: Overrides;
  setOverrides: React.Dispatch<React.SetStateAction<Overrides>>;
  setSolids: SetStr;
}) {
  const { camera } = useThree();
  const ray = useRef(new THREE.Ray());
  const [hit, setHit] = useState<THREE.Vector3 | null>(null);
  const [place, setPlace] = useState<THREE.Vector3 | null>(null);
  const [slot, setSlot] = useState<'planks'|'stone'|'wood'|'leaves'|'sand'>('planks');

  const isOcc = useMemo(() => (x:number,y:number,z:number) => {
    const k = `${x}|${y}|${z}`;
    if (overrides.has(k)) return overrides.get(k) !== null; // null => mined (hidden)
    return solids.has(k) || water.has(k);
  }, [solids, water, overrides]);

  const isSolidAt = (x:number,y:number,z:number) => {
    const k = `${x}|${y}|${z}`;
    if (overrides.has(k)) return overrides.get(k) !== null; // placed blocks are solid
    return solids.has(k); // water is not treated as solid
  };

  // Simple ray march from camera center
  useFrame(() => {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    ray.current.origin.copy(camera.position);
    ray.current.direction.copy(dir);

    const step = 0.2, maxDist = 6;
    let lastEmpty: THREE.Vector3 | null = null;
    let found: THREE.Vector3 | null = null;

    for (let s = 0; s <= maxDist; s += step) {
      const p = ray.current.at(s, new THREE.Vector3());
      const cx = Math.floor(p.x), cy = Math.floor(p.y - 0.5), cz = Math.floor(p.z);
      const cell = new THREE.Vector3(cx, cy, cz);
      if (isOcc(cx, cy, cz)) { found = cell; break; }
      lastEmpty = cell;
    }
    setHit(found);
    setPlace(found ? lastEmpty : null);
  });

  // input: 1..5 to switch block type, mouse to mine/place
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Digit1') setSlot('planks');
      if (e.code === 'Digit2') setSlot('stone');
      if (e.code === 'Digit3') setSlot('wood');
      if (e.code === 'Digit4') setSlot('leaves');
      if (e.code === 'Digit5') setSlot('sand');
    };
    const onMouse = (e: MouseEvent) => {
      // Left: mine
      if (e.button === 0 && hit) {
        const k = `${hit.x}|${hit.y}|${hit.z}`;
        if (isSolidAt(hit.x, hit.y, hit.z)) {
          setOverrides(prev => { const m = new Map(prev); m.set(k, null); return m; });
          setSolids(prev => { const s = new Set(prev); s.delete(k); return s; });
        }
      }
      // Right: place
      if (e.button === 2 && place) {
        const k = `${place.x}|${place.y}|${place.z}`;
        setOverrides(prev => { const m = new Map(prev); m.set(k, slot); return m; });
        setSolids(prev => { const s = new Set(prev); s.add(k); return s; });
      }
    };
    const preventMenu = (e: MouseEvent) => { if (e.button === 2) e.preventDefault(); };
    window.addEventListener('contextmenu', preventMenu);
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onMouse);
    return () => {
      window.removeEventListener('contextmenu', preventMenu);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onMouse);
    };
  }, [hit, place, slot, setOverrides, setSolids]);

  return (
    <>
      {hit &&   <WireCube at={hit}   color={0xff5555} />}
      {place && <WireCube at={place} color={0x55ff55} />}
    </>
  );
}

function WireCube({ at, color }: { at: THREE.Vector3; color: number }) {
  return (
    <mesh position={[at.x + 0.5, at.y + 0.5, at.z + 0.5]}>
      <boxGeometry args={[1.001, 1.001, 1.001]} />
      <meshBasicMaterial wireframe color={color} />
    </mesh>
  );
}
