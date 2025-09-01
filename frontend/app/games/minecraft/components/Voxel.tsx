import * as React from "react";
import { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { colorFor } from "../lib/blocks";
import type { BlockId, Vec3 } from "../lib/types";

export default function Voxel({
  id, pos, onPlaceAdjacent, onRemove, disabled = false,
}: {
  id: BlockId; pos: Vec3; onPlaceAdjacent: (p: Vec3) => void; onRemove: () => void; disabled?: boolean;
}) {
  const [x, y, z] = pos;

  const handlePointerDown = (e: ThreeEvent<MouseEvent>) => {
    if (disabled) return;
    e.stopPropagation();

    // NEW MAPPING: Left = remove, Right = place adjacent
    const button = e.nativeEvent.button;

    // LEFT = remove
    if (button === 0) {
      return onRemove();
    }

    // RIGHT = place adjacent
    if (button === 2) {
      const n = e.face?.normal?.clone();
      if (!n) return;
      const normal = n
        .applyMatrix3(new THREE.Matrix3().getNormalMatrix((e.object as THREE.Mesh).matrixWorld))
        .round();
      const adj: Vec3 = [
        x + Math.round(normal.x),
        y + Math.round(normal.y),
        z + Math.round(normal.z),
      ];
      return onPlaceAdjacent(adj);
    }
  };

  return (
    <mesh position={[x + 0.5, y + 0.5, z + 0.5]} castShadow receiveShadow onPointerDown={handlePointerDown}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={colorFor(id)} roughness={0.9} metalness={0} />
    </mesh>
  );
}
