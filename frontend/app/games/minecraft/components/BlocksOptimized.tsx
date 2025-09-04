"use client";

import React, { useLayoutEffect, useMemo, useRef } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { BLOCKS } from "../lib/constants";
import type { BlockId, WorldBlock } from "../lib/types";
import { CHUNK_SIZE, chunkKey } from "../lib/chunks";
import { blockOverlapsPlayer } from "../lib/physics";

// Small helper to group blocks by chunk and by block id
function groupByChunkAndId(blocks: Map<string, WorldBlock>) {
  const groups = new Map<string, Map<BlockId, Float32Array>>(); // chunkKey -> (id -> positions float32[x,y,z]*)
  const counts = new Map<string, Map<BlockId, number>>();

  for (const b of blocks.values()) {
    const cx = Math.floor(b.pos[0] / CHUNK_SIZE);
    const cz = Math.floor(b.pos[2] / CHUNK_SIZE);
    const ck = chunkKey(cx, cz);

    if (!groups.has(ck)) groups.set(ck, new Map());
    if (!counts.has(ck)) counts.set(ck, new Map());
    const byId = groups.get(ck)!;
    const cntId = counts.get(ck)!;

    const count = (cntId.get(b.id) ?? 0) + 1;
    cntId.set(b.id, count);
  }

  // allocate typed arrays
  for (const [ck, cntId] of counts) {
    const byId = groups.get(ck)!;
    for (const [id, count] of cntId) {
      byId.set(id, new Float32Array(count * 3));
    }
  }

  // fill arrays
  const filled = new Map<string, Map<BlockId, number>>(); // idx cursor per id
  for (const b of blocks.values()) {
    const cx = Math.floor(b.pos[0] / CHUNK_SIZE);
    const cz = Math.floor(b.pos[2] / CHUNK_SIZE);
    const ck = chunkKey(cx, cz);
    const byId = groups.get(ck)!;
    if (!filled.has(ck)) filled.set(ck, new Map());
    const cursors = filled.get(ck)!;

    const arr = byId.get(b.id)!;
    const i = (cursors.get(b.id) ?? 0);
    arr[i * 3 + 0] = b.pos[0];
    arr[i * 3 + 1] = b.pos[1];
    arr[i * 3 + 2] = b.pos[2];
    cursors.set(b.id, i + 1);
  }

  return groups; // Map<chunkKey, Map<id, Float32Array positions>>
}

export default function BlocksOptimized({
  blocks,
  place,
  remove,
  selected,
}: {
  blocks: Map<string, WorldBlock>;
  place: (x: number, y: number, z: number, id: BlockId) => void;
  remove: (x: number, y: number, z: number) => void;
  selected: BlockId;
}) {
  const { camera } = useThree();

  // positions grouped per-chunk & block-id
  const groups = useMemo(() => groupByChunkAndId(blocks), [blocks]);

  // Refs to look up instanceId -> world position for events
  const positionsByChunkId = useRef(
    new Map<string, Map<BlockId, { positions: Float32Array; matrices: THREE.InstancedMesh }>>()
  );
  positionsByChunkId.current.clear();

  // shared geometry per instance
  const box = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const mat = useMemo(() => new THREE.Matrix4(), []);

  return (
    <group>
      {Array.from(groups.entries()).map(([ck, byId]) => (
        <group key={ck}>
          {Array.from(byId.entries()).map(([id, posArray]) => {
            const count = posArray.length / 3;
            if (count === 0) return null;

            // ---- Guard against unknown block IDs ----
            const key = Number(id) as BlockId;
            const spec = (BLOCKS as Record<number, { color: any; opacity?: number; transparent?: boolean } | undefined>)[key];
            if (!spec) {
              if (process.env.NODE_ENV !== "production") {
                console.warn("[BlocksOptimized] Unknown block id:", id, "— skipping these instances");
              }
              return null; // or use a fallback material if you prefer
            }

// inside your map(...)
return (
  <instancedMesh
    key={`${ck}-${id}`}
    args={[box, undefined as any, count]}
    onUpdate={(mesh) => {
      // runs when the mesh mounts and on subsequent renders
      const obj3d = new THREE.Object3D();
      for (let i = 0; i < count; i++) {
        obj3d.position.set(
          posArray[i * 3],
          posArray[i * 3 + 1],
          posArray[i * 3 + 2]
        );
        obj3d.updateMatrix();
        mesh.setMatrixAt(i, obj3d.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }}
    // your pointer handlers stay as-is
    onPointerDown={(e) => { /* ... */ }}
    onContextMenu={(e) => e.preventDefault()}
  >
    <meshStandardMaterial
      color={spec.color}
      opacity={spec.opacity ?? 1}
      transparent={!!spec.transparent}
    />
  </instancedMesh>
);

          })}
        </group>
      ))}
    </group>
  );
}
