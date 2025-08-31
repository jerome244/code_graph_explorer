import * as React from "react";
import { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";

export default function GroundPlane({
  size,
  onPlace,
  disabled = false,
}: {
  size: number;
  onPlace: (x: number, z: number) => void;
  disabled?: boolean;
}) {
  const handlePointerDown = (e: ThreeEvent<MouseEvent>) => {
    if (disabled) return;
    const rightClick = e.nativeEvent.button === 2;
    const shift = (e.nativeEvent as MouseEvent).shiftKey;
    if (rightClick || shift) return;
    const p = e.point;
    const x = Math.floor(THREE.MathUtils.clamp(p.x, 0, size - 1));
    const z = Math.floor(THREE.MathUtils.clamp(p.z, 0, size - 1));
    onPlace(x, z);
  };

  return (
    <group>
      <mesh position={[size / 2, 0, size / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[size, size, size, size]} />
        <meshStandardMaterial color="#6faa4a" />
      </mesh>
      <gridHelper args={[size, size]} position={[size / 2, 0.01, size / 2]} />
      <mesh position={[size / 2, 0.001, size / 2]} rotation={[-Math.PI / 2, 0, 0]} onPointerDown={handlePointerDown}>
        <planeGeometry args={[size, size]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
    </group>
  );
}
