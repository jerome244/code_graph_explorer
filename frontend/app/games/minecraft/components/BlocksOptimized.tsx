"use client";

import React, { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { BLOCKS } from "../lib/constants";
import type { BlockId, WorldBlock } from "../lib/types";
import { CHUNK_SIZE, chunkKey } from "../lib/chunks";
import { blockOverlapsPlayer } from "../lib/physics";

type OnMiningProgress = (p: number | null) => void;

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
    const cntId = counts.get(ck)!;

    cntId.set(b.id, (cntId.get(b.id) ?? 0) + 1);
  }

  // allocate typed arrays
  for (const [ck, cntId] of counts) {
    const byId = groups.get(ck)!;
    for (const [id, count] of cntId) {
      byId.set(id, new Float32Array(count * 3));
    }
  }

  // fill arrays
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

  return groups; // Map<chunkKey, Map<id, Float32Array positions>>
}

export default function BlocksOptimized({
  blocks,
  place,
  remove,
  selected,
  miningSpeedMultiplier = 1,       // 👈 optional: boost/slow mining, default 1x
  onMiningProgress,                // 👈 report progress 0..1 (or null when idle)
}: {
  blocks: Map<string, WorldBlock>;
  place: (x: number, y: number, z: number, id: BlockId) => void;
  remove: (x: number, y: number, z: number) => void;
  selected: BlockId;
  miningSpeedMultiplier?: number;
  onMiningProgress?: OnMiningProgress;
}) {
  const { camera } = useThree();

  // positions grouped per-chunk & block-id
  const groups = useMemo(() => groupByChunkAndId(blocks), [blocks]);

  // shared geometry
  const box = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);

  // --- Mining state ---
  const miningRef = useRef<{
    x: number; y: number; z: number;
    needed: number;       // seconds to finish
    elapsed: number;      // seconds accumulated
    active: boolean;
  } | null>(null);

  // Drive the timed mining each frame
  useFrame((_, delta) => {
    const m = miningRef.current;
    if (!m || !m.active) return;

    m.elapsed += delta * Math.max(0.0001, miningSpeedMultiplier);

    const p = Math.min(1, m.elapsed / Math.max(0.001, m.needed));
    onMiningProgress?.(p);

    if (p >= 1) {
      // done: remove block and clear state
      remove(m.x, m.y, m.z);
      miningRef.current = null;
      onMiningProgress?.(null);
    }
  });

  // Cancel mining on global mouseup (if user releases off the block)
  useEffect(() => {
    const up = () => {
      if (miningRef.current) {
        miningRef.current.active = false;
        miningRef.current.elapsed = 0;
        miningRef.current = null;
        onMiningProgress?.(null);
      }
    };
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, [onMiningProgress]);

  return (
    <group>
      {Array.from(groups.entries()).map(([ck, byId]) => (
        <group key={ck}>
          {Array.from(byId.entries()).map(([id, posArray]) => {
            const count = posArray.length / 3;
            if (count === 0) return null;

            // Guard against unknown block IDs
            const key = Number(id) as BlockId;
            const spec =
              (BLOCKS as Record<
                number,
                { color: THREE.ColorRepresentation; opacity?: number; transparent?: boolean; hardness?: number } | undefined
              >)[key];
            if (!spec) {
              if (process.env.NODE_ENV !== "production") {
                console.warn("[BlocksOptimized] Unknown block id:", id, "— skipping these instances");
              }
              return null;
            }

            // Mining time (seconds) for this block type. Fallback to 0.25s.
            const hardness = Math.max(0.05, spec.hardness ?? 0.25);

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

                  const pe = e.nativeEvent as PointerEvent;
                  const button = pe.button;

                  const bx = Math.round(posArray[instanceId * 3 + 0]);
                  const by = Math.round(posArray[instanceId * 3 + 1]);
                  const bz = Math.round(posArray[instanceId * 3 + 2]);

                  if (button === 0) {
                    // LEFT = start timed mining (hold)
                    miningRef.current = {
                      x: bx, y: by, z: bz,
                      needed: hardness,   // seconds per block type
                      elapsed: 0,
                      active: true,
                    };
                    onMiningProgress?.(0);
                    return;
                  }

                  if (button === 2) {
                    // RIGHT = place adjacent on the face we clicked
                    pe.preventDefault?.();

                    const n = (e.face?.normal ?? new THREE.Vector3(0, 1, 0)).clone();
                    const nx = Math.sign(n.x) * (Math.abs(n.x) > 0.5 ? 1 : 0);
                    const ny = Math.sign(n.y) * (Math.abs(n.y) > 0.5 ? 1 : 0);
                    const nz = Math.sign(n.z) * (Math.abs(n.z) > 0.5 ? 1 : 0);

                    const x = bx + nx;
                    const y = by + ny;
                    const z = bz + nz;

                    const eye = (camera.position as THREE.Vector3) ?? new THREE.Vector3(0, 2.6, 0);
                    if (blockOverlapsPlayer(eye, x, y, z)) return;

                    // stop any mining in progress
                    if (miningRef.current) {
                      miningRef.current = null;
                      onMiningProgress?.(null);
                    }

                    place(x, y, z, selected);
                  }
                }}
                onPointerUp={() => {
                  // releasing on the block cancels mining
                  if (miningRef.current) {
                    miningRef.current = null;
                    onMiningProgress?.(null);
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
