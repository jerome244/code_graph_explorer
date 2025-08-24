'use client';
import { useMemo } from 'react';
import * as THREE from 'three';

export default function PlayerGhosts({ others }: { others: Map<string, {id:string;name:string;color:string;x:number;y:number;z:number;ry:number}> }) {
  const arr = useMemo(() => Array.from(others.values()), [others]);
  return (
    <group>
      {arr.map(p => (
        <group key={p.id} position={[p.x, p.y, p.z]} rotation-y={p.ry}>
          {/* simple capsule-ish ghost */}
          <mesh position={[0, 0.9, 0]}>
            <capsuleGeometry args={[0.35, 1.1, 6, 12]} />
            <meshStandardMaterial color={p.color} metalness={0.1} roughness={0.7} />
          </mesh>
          {/* name tag */}
          <group position={[0, 2.1, 0]}>
            <mesh rotation={[0, 0, 0]}>
              <planeGeometry args={[1.6, 0.35]} />
              <meshBasicMaterial color="black" transparent opacity={0.4} />
            </mesh>
            <mesh position={[0, 0, 0.01]}>
              <textGeometry args={[p.name, { size: 0.18, height: 0 }]} />
              <meshBasicMaterial color="white" />
            </mesh>
          </group>
        </group>
      ))}
    </group>
  );
}
