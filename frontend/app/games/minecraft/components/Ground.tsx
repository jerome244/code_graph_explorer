"use client";

export default function Ground({ onPointerDown }: { onPointerDown: (e: any) => void }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]} onPointerDown={onPointerDown} receiveShadow>
      <planeGeometry args={[500, 500]} />
      <meshStandardMaterial color="#9ec8a0" />
    </mesh>
  );
}
