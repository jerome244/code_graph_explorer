"use client";

import React, { useCallback, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { PointerLockControls } from "@react-three/drei";
import * as THREE from "three";

import BlocksOptimized from "./components/BlocksOptimized";
import Crosshair from "./components/Crosshair";
import Ground from "./components/Ground";
import Hotbar from "./components/Hotbar";
import Player from "./components/Player";

import { useInfiniteWorld } from "./hooks/useInfiniteWorld";
import { blockOverlapsPlayer } from "./lib/physics";
import type { BlockId } from "./lib/types";

// Drive chunk streaming from inside the Canvas
function Streamer({ updateAround }: { updateAround: (p: THREE.Vector3) => void }) {
  const { camera } = useThree();
  useFrame(() => updateAround(camera.position));
  return null;
}

export default function GamePage() {
  const [selected, setSelected] = useState<BlockId>(1);

  const { blocks, place, remove, hasBlock, updateAround, getTopY } = useInfiniteWorld({
    viewDistance: 3, // tune for perf; 3 is a good default
  });

  const [locked, setLocked] = useState(false);
  const lockRef = useRef<{ lock: () => void; unlock: () => void } | null>(null);

  // RMB places on ground (place on current column surface, not y=0)
  const handleGroundPointerDown = useCallback(
    (e: any) => {
      e.stopPropagation();
      if (e.button === 2) {
        const p = e.point as THREE.Vector3;
        const x = Math.round(p.x);
        const z = Math.round(p.z);
        const y = getTopY(x, z) + 1; // place on visible surface + 1
        const eye = (e?.ray?.camera?.position as THREE.Vector3) ?? new THREE.Vector3(0, 2.6, 0);
        if (blockOverlapsPlayer(eye, x, y, z)) return;
        place(x, y, z, selected);
      }
    },
    [getTopY, place, selected]
  );

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "70vh",
        borderRadius: 12,
        overflow: "hidden",
        background: "#0b1020",
      }}
    >
      <Canvas
        id="minecraft-canvas"
        shadows
        camera={{ fov: 75, near: 0.1, far: 2000, position: [0, 1.8, 6] }}
        onPointerDown={() => {
          if (!locked) lockRef.current?.lock?.();
        }}
        onContextMenu={(e) => e.preventDefault()}
        gl={{ powerPreference: "high-performance" }}
      >
        {/* Lights */}
        <hemisphereLight args={[0xffffff, 0x223344, 0.6]} />
        <directionalLight position={[10, 50, 10]} intensity={1} castShadow />

        {/* Sky */}
        <color attach="background" args={["#87CEEB"]} />

        {/* Stream chunks around the camera */}
        <Streamer updateAround={updateAround} />

        {/* World (instanced for perf; handles its own block click events) */}
        <BlocksOptimized blocks={blocks} place={place} remove={remove} selected={selected} />

        {/* Optional: large click plane for easy placement; uses surface height */}
        <Ground onPointerDown={handleGroundPointerDown} />

        {/* Player & mouse-look */}
        <Player hasBlock={hasBlock} />
        <PointerLockControls
          ref={lockRef as any}
          makeDefault
          onLock={() => setLocked(true)}
          onUnlock={() => setLocked(false)}
        />
      </Canvas>

      {/* HUD */}
      <Crosshair />
      <Hotbar selected={selected} setSelected={setSelected} />
    </div>
  );
}
