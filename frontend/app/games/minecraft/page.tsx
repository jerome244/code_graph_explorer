// page.tsx (only the changed bits)
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

// ⬇️ new hook
import { useInfiniteWorld } from "./hooks/useInfiniteWorld";
import { roundToGrid } from "./lib/utils";
import { blockOverlapsPlayer } from "./lib/physics";
import type { BlockId, WorldBlock } from "./lib/types";

// Small helper to drive streaming from inside the Canvas
function Streamer({ updateAround }: { updateAround: (p: THREE.Vector3) => void }) {
  const { camera } = useThree();
  useFrame(() => updateAround(camera.position));
  return null;
}

export default function GamePage() {
  const [selected, setSelected] = useState<BlockId>(1);
  const { blocks, place, remove, hasBlock, updateAround } = useInfiniteWorld({
    viewDistance: 6, // radius in chunks; try 4–8 depending on perf
  });

  const [locked, setLocked] = useState(false);
  const lockRef = useRef<{ lock: () => void; unlock: () => void } | null>(null);

  // LMB mines; RMB places adjacent (with player-overlap guard)
  const handleBlockPointerDown = useCallback(
    (e: any, b: WorldBlock) => {
      e.stopPropagation();
      const eye = (e?.ray?.camera?.position as THREE.Vector3) ?? new THREE.Vector3(0, 2.6, 0);

      if (e.button === 0) {
        remove(b.pos[0], b.pos[1], b.pos[2]);
      } else if (e.button === 2) {
        const normalMatrix = new THREE.Matrix3().getNormalMatrix(e.object.matrixWorld);
        const worldNormal = e.face?.normal.clone().applyMatrix3(normalMatrix).normalize();
        const target = new THREE.Vector3().fromArray(b.pos).add(worldNormal ?? new THREE.Vector3(0, 1, 0));
        const tx = Math.round(target.x), ty = Math.round(target.y), tz = Math.round(target.z);
        if (blockOverlapsPlayer(eye, tx, ty, tz)) return;
        place(tx, ty, tz, selected);
      }
    },
    [place, remove, selected]
  );

  // RMB places on ground (with guard)
  const handleGroundPointerDown = useCallback(
    (e: any) => {
      e.stopPropagation();
      if (e.button === 2) {
        const p = e.point as THREE.Vector3;
        const x = roundToGrid(p.x), z = roundToGrid(p.z), y = 0;
        const eye = (e?.ray?.camera?.position as THREE.Vector3) ?? new THREE.Vector3(0, 2.6, 0);
        if (blockOverlapsPlayer(eye, x, y, z)) return;
        place(x, y, z, selected);
      }
    },
    [place, selected]
  );

  return (
    <div style={{ position: "relative", width: "100%", height: "70vh", borderRadius: 12, overflow: "hidden", background: "#0b1020" }}>
      <Canvas
        id="minecraft-canvas"
        shadows
        camera={{ fov: 75, near: 0.1, far: 2000, position: [0, 1.8, 6] }}
        onPointerDown={() => { if (!locked) lockRef.current?.lock?.(); }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* Lights */}
        <hemisphereLight args={[0xffffff, 0x223344, 0.6]} />
        <directionalLight position={[10, 50, 10]} intensity={1} castShadow />

        {/* Sky */}
        <color attach="background" args={["#87CEEB"]} />

        {/* Stream chunks around the camera */}
        <Streamer updateAround={updateAround} />

        {/* World */}
        <BlocksOptimized
          blocks={blocks}
          place={place}
          remove={remove}
          selected={selected}
        />
        {/* Optional: keep a massive ground plane for clicks; terrain already provides blocks */}
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
