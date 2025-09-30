// app/_components/three/HeroAstronaut.tsx
"use client";

import React, { Suspense, useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment, Html } from "@react-three/drei";
import { Astronaut } from "./Astronaut";

function Loader() {
  return (
    <Html center>
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/30 border-t-white/90" />
    </Html>
  );
}

export default function HeroAstronaut() {
  if (typeof window !== "undefined") console.log("[HeroAstronaut] mounted v3");

  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = document.getElementById("hero-astro-slot");
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        setInView(true);
        io.disconnect();
      }
    }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      id="hero-astro-slot"
      className="pointer-events-none absolute inset-y-0 right-0 w-[40vw] md:w-[28vw] -z-10"
      aria-hidden
    >
      {inView && (
        <Canvas camera={{ position: [0, 0, 10], fov: 42 }} dpr={[1, 1.5]} gl={{ antialias: true }}>
          <ambientLight intensity={0.45} />
          <directionalLight position={[6, 8, 6]} intensity={0.9} />

          <Suspense fallback={<Loader />}>
            {/* 右端＆少し下にオフセット。控えめサイズだが“見える” */}
            <group position={[1.2, -0.25, 0]}>
              <Astronaut scale={1.8} />
            </group>

            <Environment preset="city" />
            <OrbitControls enableZoom={false} enablePan={false} enableRotate={false} />
          </Suspense>
        </Canvas>
      )}
    </div>
  );
}


