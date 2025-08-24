'use client';
import { useThree, useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { useDayNight } from './DayNight';
import * as THREE from 'three';

export default function SkySunClouds() {
  const { t } = useDayNight(); // 0..1 (0=noon-12am depending how you like it)
  const sun = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const ambient = useRef<THREE.AmbientLight>(null);
  const clouds = useRef<THREE.Group>(null);
  const { scene } = useThree();

  // Day factor (0 at deepest night, 1 at brightest day). Keep nights not too dark.
  const day = useMemo(() => {
    const w = (Math.cos((t - 0.5) * Math.PI * 2) + 1) * 0.5; // 0..1
    return Math.max(0.12, w); // clamp darkness
  }, [t]);

  const skyColor = useMemo(() => {
    const dayCol = new THREE.Color(0x9bd2ff);
    const nightCol = new THREE.Color(0x08121f);
    return nightCol.clone().lerp(dayCol, day);
  }, [day]);

  const fogColor = useMemo(() => {
    const dawn = new THREE.Color(0xaec8ff);
    return dawn.clone().lerp(skyColor, 0.6);
  }, [skyColor]);

  useFrame(() => {
    const elev = Math.sin(t * Math.PI * 2) * 0.6 + 0.7;
    const azim = Math.cos(t * Math.PI * 2) * Math.PI;
    const r = 120;

    if (sun.current) {
      sun.current.position.set(Math.cos(azim) * r, Math.max(10, elev * r), Math.sin(azim) * r);
      sun.current.intensity = THREE.MathUtils.lerp(0.2, 1.6, day);
    }
    if (hemi.current) hemi.current.intensity = THREE.MathUtils.lerp(0.25, 0.8, day);
    if (ambient.current) ambient.current.intensity = THREE.MathUtils.lerp(0.15, 0.7, day);

    // background + fog
    scene.background = scene.background ?? new THREE.Color(0x000000);
    (scene.background as THREE.Color).copy(skyColor);
    scene.fog = scene.fog ?? new THREE.Fog(fogColor, 120, 420);
    scene.fog.color.copy(fogColor);

    // drift clouds
    if (clouds.current) clouds.current.position.x = (clouds.current.position.x + 0.03) % 400;
  });

  return (
    <>
      <ambientLight ref={ambient} intensity={0.6} />
      <hemisphereLight ref={hemi} intensity={0.7} />
      <directionalLight
        ref={sun}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        position={[60, 80, 20]}
      />
      <group ref={clouds} position={[0, 35, 0]}>
        {Array.from({ length: 12 }).map((_, i) => (
          <mesh key={i} position={[i * 30 - 160, (i % 3) * 2, (i % 5) * 20 - 40]} rotation={[0, i, 0]}>
            <planeGeometry args={[28, 14]} />
            <meshStandardMaterial transparent opacity={0.35} />
          </mesh>
        ))}
      </group>
    </>
  );
}
