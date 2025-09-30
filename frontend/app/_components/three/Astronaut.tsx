// app/_components/three/Astronaut.tsx
"use client";

import React, { useRef } from "react";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Group } from "three";

type Props = JSX.IntrinsicElements["group"] & { scale?: number };

export function Astronaut({ scale = 1.6, ...rest }: Props) {
  if (typeof window !== "undefined") console.log("[Astronaut] mounted v3, scale=", scale);

  const ref = useRef<Group>(null);
  const { scene } = useGLTF("/3d/astronaut.glb");

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (ref.current) {
      ref.current.rotation.y = t * 0.25;
      ref.current.position.y = Math.sin(t * 0.8) * 0.08;
    }
  });

  return (
    <group ref={ref} {...rest}>
      <primitive object={scene} scale={scale} />
    </group>
  );
}

useGLTF.preload("/3d/astronaut.glb");


