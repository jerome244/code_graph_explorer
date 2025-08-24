'use client';
import { useThree, useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { useDayNight } from './DayNight';
import * as THREE from 'three';

export default function SkySunClouds() {
  const { t } = useDayNight(); // 0..1 day cycle
  const sunLight = useRef<THREE.DirectionalLight>(null);
  const moonLight = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const ambient = useRef<THREE.AmbientLight>(null);
  const sunMesh = useRef<THREE.Mesh>(null);
  const moonMesh = useRef<THREE.Mesh>(null);
  const clouds = useRef<THREE.Group>(null);
  const { scene } = useThree();

  // day factor (0 night..1 day), clamp so nights aren’t pitch black
  const day = useMemo(() => Math.max(0.12, (Math.cos((t - 0.5) * Math.PI * 2) + 1) * 0.5), [t]);

  const skyColor = useMemo(() => {
    const dayCol = new THREE.Color(0x9bd2ff);
    const nightCol = new THREE.Color(0x08121f);
    return nightCol.clone().lerp(dayCol, day);
  }, [day]);

  const fogColor = useMemo(() => skyColor.clone().lerp(new THREE.Color(0xaec8ff), 0.3), [skyColor]);

  useFrame(() => {
    // position sun and moon opposite each other on a big circle
    const elev = Math.sin(t * Math.PI * 2);
    const azim = Math.cos(t * Math.PI * 2);
    const r = 180;

    const sunPos = new THREE.Vector3(azim * r, Math.max(10, elev * r), Math.sin(t * Math.PI * 2 + Math.PI/2) * r);
    const moonPos = sunPos.clone().multiplyScalar(-1);

    sunLight.current?.position.copy(sunPos);
    moonLight.current?.position.copy(moonPos);

    if (sunMesh.current) { sunMesh.current.position.copy(sunPos.clone().setLength(140)); }
    if (moonMesh.current) { moonMesh.current.position.copy(moonPos.clone().setLength(140)); }

    if (sunLight.current) sunLight.current.intensity = THREE.MathUtils.lerp(0.15, 1.7, day);
    if (moonLight.current) moonLight.current.intensity = THREE.MathUtils.lerp(0.7, 0.05, day); // brighter at night
    if (hemi.current) hemi.current.intensity = THREE.MathUtils.lerp(0.25, 0.8, day);
    if (ambient.current) ambient.current.intensity = THREE.MathUtils.lerp(0.2, 0.7, day);

    // background + fog
    scene.background = scene.background ?? new THREE.Color();
    (scene.background as THREE.Color).copy(skyColor);
    scene.fog = scene.fog ?? new THREE.Fog(fogColor, 120, 420);
    scene.fog.color.copy(fogColor);

    // clouds drift
    if (clouds.current) clouds.current.position.x = (clouds.current.position.x + 0.03) % 400;
  });

  return (
    <>
      <ambientLight ref={ambient} intensity={0.6} />
      <hemisphereLight ref={hemi} intensity={0.7} />

      {/* Sun + Moon lights */}
      <directionalLight ref={sunLight} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
      <directionalLight ref={moonLight} color={0x99bbff} intensity={0.2} />

      {/* Visible sun disc */}
      <mesh ref={sunMesh}>
        <sphereGeometry args={[6, 24, 24]} />
        <meshBasicMaterial color={0xfff1a8} />
      </mesh>
      {/* Visible moon disc */}
      <mesh ref={moonMesh}>
        <sphereGeometry args={[5, 24, 24]} />
        <meshBasicMaterial color={0xcfd9ff} />
      </mesh>

      {/* super simple billboard clouds */}
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
