'use client';
import * as THREE from 'three';

export function VVillager({ role }: { role?: string }) {
  const coat =
    role === 'guard' ? 0x455a64 :
    role === 'merchant' ? 0xffb74d :
    0x7cb342;

  const hatColor = role === 'guard' ? 0x263238 : role === 'merchant' ? 0x6d4c41 : 0x33691e;

  return (
    <group>
      {/* body */}
      <mesh position={[0, 0.35, 0]}><boxGeometry args={[0.6, 0.7, 0.4]} /><meshStandardMaterial color={coat} /></mesh>
      {/* head */}
      <mesh position={[0, 0.9, 0]}><boxGeometry args={[0.35, 0.35, 0.35]} /><meshStandardMaterial color={0xffe0b2} /></mesh>
      {/* hat */}
      <mesh position={[0, 1.07, 0]}>
        <boxGeometry args={[0.45, 0.1, 0.45]} />
        <meshStandardMaterial color={hatColor} />
      </mesh>
      {/* legs */}
      <mesh position={[-0.15, 0.05, 0]}><boxGeometry args={[0.18, 0.2, 0.18]} /><meshStandardMaterial color={0x2e2e2e} /></mesh>
      <mesh position={[ 0.15, 0.05, 0]}><boxGeometry args={[0.18, 0.2, 0.18]} /><meshStandardMaterial color={0x2e2e2e} /></mesh>
      {/* arms */}
      <mesh position={[-0.35, 0.42, 0]}><boxGeometry args={[0.2, 0.2, 0.2]} /><meshStandardMaterial color={coat} /></mesh>
      <mesh position={[ 0.35, 0.42, 0]}><boxGeometry args={[0.2, 0.2, 0.2]} /><meshStandardMaterial color={coat} /></mesh>
    </group>
  );
}

export function VSheep() {
  return (
    <group>
      <mesh position={[0, 0.25, 0]}><boxGeometry args={[0.7, 0.5, 0.4]} /><meshStandardMaterial color={0xffffff} /></mesh>
      <mesh position={[0.2, 0.55, 0.2]}><boxGeometry args={[0.25, 0.25, 0.25]} /><meshStandardMaterial color={0xffffff} /></mesh>
    </group>
  );
}
export function VCow() {
  return (
    <group>
      <mesh position={[0, 0.3, 0]}><boxGeometry args={[0.9, 0.6, 0.5]} /><meshStandardMaterial color={0x5d4037} /></mesh>
      <mesh position={[0.2, 0.6, 0.25]}><boxGeometry args={[0.3, 0.3, 0.3]} /><meshStandardMaterial color={0x5d4037} /></mesh>
    </group>
  );
}
export function VPig() {
  return (
    <group>
      <mesh position={[0, 0.25, 0]}><boxGeometry args={[0.7, 0.5, 0.45]} /><meshStandardMaterial color={0xff8a80} /></mesh>
      <mesh position={[0.2, 0.55, 0.2]}><boxGeometry args={[0.25, 0.25, 0.25]} /><meshStandardMaterial color={0xff8a80} /></mesh>
    </group>
  );
}
