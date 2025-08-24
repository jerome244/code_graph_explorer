'use client';
import * as THREE from 'three';
import { Text } from '@react-three/drei';

type Other = {
  id: string;
  name?: string;
  color?: string;
  x: number; y: number; z: number; ry: number;
};

export default function PlayerGhosts({ others }: { others: Map<string, Other> }) {
  const items = Array.from(others.values());
  return (
    <group>
      {items.map(p => (
        <group key={p.id} position={[p.x, p.y, p.z]} rotation={[0, p.ry, 0]}>
          {/* simple capsule-ish body */}
          <mesh castShadow>
            <capsuleGeometry args={[0.35, 1.0, 4, 10]} />
            <meshStandardMaterial color={p.color || '#44c'} />
          </mesh>
          {/* name label using drei Text (no TextGeometry needed) */}
          {p.name && (
            <Text
              position={[0, 1.6 + 0.35, 0]}
              fontSize={0.28}
              anchorX="center"
              anchorY="bottom"
              color="#ffffff"
              outlineWidth={0.03}
              outlineColor="black"
            >
              {p.name}
            </Text>
          )}
        </group>
      ))}
    </group>
  );
}
