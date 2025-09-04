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

            return (
              <instancedMesh
                key={`${ck}-${id}`}
                args={[box, undefined as any, count]}
                // Pointer events: mine/place using instanceId + face normal
                onPointerDown={(e) => {
                  e.stopPropagation();
                  const mesh = e.object as THREE.InstancedMesh;
                  const instanceId = (e as any).instanceId as number;
                  if (instanceId == null) return;

                  // reconstruct this instance world position
                  const posArr = posArray;
                  const bx = posArr[instanceId * 3 + 0];
                  const by = posArr[instanceId * 3 + 1];
                  const bz = posArr[instanceId * 3 + 2];

                  // world face normal
                  const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
                  const worldNormal = e.face?.normal.clone().applyMatrix3(normalMatrix).normalize() ?? new THREE.Vector3(0,1,0);

                  if (e.button === 0) {
                    // MINE: target block is the one we clicked (the instance)
                    remove(bx, by, bz);
                  } else if (e.button === 2) {
                    // PLACE adjacent along face normal
                    const target = new THREE.Vector3(bx, by, bz).add(worldNormal);
                    const tx = Math.round(target.x);
                    const ty = Math.round(target.y);
                    const tz = Math.round(target.z);

                    const eye = camera.position as THREE.Vector3;
                    if (!blockOverlapsPlayer(eye, tx, ty, tz)) {
                      place(tx, ty, tz, selected);
                    }
                  }
                }}
                onContextMenu={(e) => e.preventDefault()}
              >
                {/* material per block-id */}
                <meshStandardMaterial
                  color={BLOCKS[id].color}
                  opacity={BLOCKS[id].opacity ?? 1}
                  transparent={!!BLOCKS[id].transparent}
                />
                {/* set instance matrices */}
                <primitive
                  object={new THREE.Object3D()}
                  attach={null as any}
                  ref={(obj3d) => {
                    if (!obj3d) return;
                    const mesh = obj3d.parent as unknown as THREE.InstancedMesh;
                    for (let i = 0; i < count; i++) {
                      obj3d.position.set(posArray[i * 3], posArray[i * 3 + 1], posArray[i * 3 + 2]);
                      obj3d.updateMatrix();
                      mesh.setMatrixAt(i, obj3d.matrix);
                    }
                    mesh.instanceMatrix.needsUpdate = true;
                  }}
                />
              </instancedMesh>
            );
          })}
        </group>
      ))}
    </group>
  );
}
