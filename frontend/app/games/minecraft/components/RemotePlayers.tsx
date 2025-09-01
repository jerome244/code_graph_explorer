import * as React from "react";

/** Simple low-poly remote avatar (capsule + head).
 *  Matches the inline version from Game.tsx: no `id` inside each player object.
 */
export default function RemotePlayers({
  players,
}: {
  players: Record<string, { p: [number, number, number]; ry: number; name?: string }>;
}) {
  return (
    <group>
      {Object.entries(players).map(([id, pl]) => (
        <group key={id} position={[pl.p[0], pl.p[1], pl.p[2]]} rotation={[0, pl.ry || 0, 0]}>
          <mesh position={[0, 0.9, 0]} castShadow>
            {/* @ts-ignore */}
            <capsuleGeometry args={[0.3, 0.9, 2, 8]} />
            <meshStandardMaterial roughness={1} metalness={0} />
          </mesh>
          <mesh position={[0, 1.7, 0]} castShadow>
            <sphereGeometry args={[0.28, 12, 12]} />
            <meshStandardMaterial roughness={1} metalness={0} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
