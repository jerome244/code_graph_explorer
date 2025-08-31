import * as React from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

type P = { id: string; p: [number,number,number]; ry: number; name?: string };
export default function RemotePlayers({ players }: { players: Record<string, P> }) {
  // simple low-poly avatar: a capsule-like stack (box+head)
  return (
    <group>
      {Object.entries(players).map(([id, pl]) => (
        <group key={id} position={[pl.p[0], pl.p[1], pl.p[2]]} rotation={[0, pl.ry || 0, 0]}>
          <mesh position={[0, 0.9, 0]} castShadow>
            <capsuleGeometry args={[0.3, 0.9, 2, 8]} />
            <meshStandardMaterial metalness={0} roughness={1} />
          </mesh>
          <mesh position={[0, 1.7, 0]} castShadow>
            <sphereGeometry args={[0.28, 12, 12]} />
            <meshStandardMaterial metalness={0} roughness={1} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
