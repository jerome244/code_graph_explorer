"use client";
import React from "react";

// Remote avatar with a tall glowing beacon and a floating label
export default function OtherPlayers({
  entries,
}: {
  entries: [string, { x: number; y: number; z: number }][];
}) {
  return (
    <group>
      {entries.map(([id, p]) => (
        <group key={id} position={[p.x, p.y, p.z]}>
          {/* Body box */}
          <mesh position={[0, -0.9, 0]}>
            <boxGeometry args={[0.6, 1.8, 0.6]} />
            <meshStandardMaterial color="#ff0077" />
          </mesh>

          {/* Beacon (tall unlit cylinder so it pops) */}
          <mesh position={[0, 3, 0]}>
            <cylinderGeometry args={[0.15, 0.15, 8, 12]} />
            <meshBasicMaterial color="#ffff00" />
          </mesh>

          {/* Nameplate */}
          <group position={[0, 2.2, 0]}>
            <mesh>
              <planeGeometry args={[2.4, 0.5]} />
              <meshBasicMaterial color="black" transparent opacity={0.5} />
            </mesh>
            {/* simple text via sprites to avoid font loaders */}
            <sprite position={[0, 0, 0.01]} scale={[2.2, 0.4, 1]}>
              <spriteMaterial />
            </sprite>
          </group>
        </group>
      ))}
    </group>
  );
}
