"use client";

import React, { useMemo } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { BLOCKS } from "../lib/constants";
import type { BlockId, WorldBlock } from "../lib/types";
import { CHUNK_SIZE, chunkKey } from "../lib/chunks";
import { blockOverlapsPlayer } from "../lib/physics";

// group blocks by chunk + id
function groupByChunkAndId(blocks: Map<string, WorldBlock>) {
  const groups = new Map<string, Map<BlockId, Float32Array>>();
  const counts = new Map<string, Map<BlockId, number>>();

  for (const b of blocks.values()) {
    const cx = Math.floor(b.pos[0] / CHUNK_SIZE);
    const cz = Math.floor(b.pos[2] / CHUNK_SIZE);
    const ck = chunkKey(cx, cz);
    if (!groups.has(ck)) groups.set(ck, new Map());
    if (!counts.has(ck)) counts.set(ck, new Map());
    const cntId = counts.get(ck)!;
    cntId.set(b.id, (cntId.get(b.id) ?? 0) + 1);
  }

  for (const [ck, cntId] of counts) {
    const byId = groups.get(ck)!;
    for (const [id, count] of cntId) byId.set(id, new Float32Array(count * 3));
  }

  const filled = new Map<string, Map<BlockId, number>>();
  for (const b of blocks.values()) {
    const cx = Math.floor(b.pos[0] / CHUNK_SIZE);
    const cz = Math.floor(b.pos[2] / CHUNK_SIZE);
    const ck = chunkKey(cx, cz);
    const byId = groups.get(ck)!;
    if (!filled.has(ck)) filled.set(ck, new Map());
    const cursors = filled.get(ck)!;
    const arr = byId.get(b.id)!;
    const i = cursors.get(b.id) ?? 0;
    arr[i * 3 + 0] = b.pos[0];
    arr[i * 3 + 1] = b.pos[1];
    arr[i * 3 + 2] = b.pos[2];
    cursors.set(b.id, i + 1);
  }
  return groups;
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
  const groups = useMemo(() => groupByChunkAndId(blocks), [blocks]);
  const box = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);

  return (
    <group>
      {Array.from(groups.entries()).map(([ck, byId]) => (
        <group key={ck}>
          {Array.from(byId.entries()).map(([id, posArray]) => {
            const count = posArray.length / 3;
            if (count === 0) return null;

            const spec =
              (BLOCKS as Record<
                number,
                { color: THREE.ColorRepresentation; opacity?: number; transparent?: boolean } | undefined
              >)[Number(id)];
            if (!spec) {
              if (process.env.NODE_ENV !== "production") {
                console.warn("[BlocksOptimized] Unknown block id:", id, "— skipping");
              }
              return null;
            }

            return (
              <instancedMesh
                key={`${ck}-${id}-${count}`}
                args={[box, undefined as any, count]}
                frustumCulled={false}
                onUpdate={(mesh) => {
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
                onPointerDown={(e) => {
                  e.stopPropagation();

                  const instanceId = e.instanceId;
                  if (instanceId == null) return;

                  const pe = e.nativeEvent as PointerEvent; // ← use native event
                  const button = pe.button;

                  const bx = Math.round(posArray[instanceId * 3 + 0]);
                  const by = Math.round(posArray[instanceId * 3 + 1]);
                  const bz = Math.round(posArray[instanceId * 3 + 2]);

                  if (button === 0) {
                    // left = mine
                    remove(bx, by, bz);
                    return;
                  }

                  if (button === 2) {
                    // right = place adjacent
                    pe.preventDefault?.(); // ✅ call preventDefault on native event

                    const n = (e.face?.normal ?? new THREE.Vector3(0, 1, 0)).clone();
                    const nx = Math.sign(n.x) * (Math.abs(n.x) > 0.5 ? 1 : 0);
                    const ny = Math.sign(n.y) * (Math.abs(n.y) > 0.5 ? 1 : 0);
                    const nz = Math.sign(n.z) * (Math.abs(n.z) > 0.5 ? 1 : 0);

                    const x = bx + nx;
                    const y = by + ny;
                    const z = bz + nz;

                    const eye = (camera.position as THREE.Vector3) ?? new THREE.Vector3(0, 2.6, 0);
                    if (blockOverlapsPlayer(eye, x, y, z)) return;

                    place(x, y, z, selected);
                  }
                }}
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
