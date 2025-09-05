"use client";

import React, { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

import { BLOCKS } from "../lib/constants";
import type { BlockId, WorldBlock } from "../lib/types";
import { CHUNK_SIZE, chunkKey } from "../lib/chunks";
import { blockOverlapsPlayer } from "../lib/physics";
import { getMiningEffectFor, type ToolItemId } from "../lib/items";

// ---- Group blocks by chunk and by block id into float arrays ----
function groupByChunkAndId(blocks: Map<string, WorldBlock>) {
  const groups = new Map<string, Map<BlockId, Float32Array>>(); // chunkKey -> (id -> positions xyz...)
  const counts = new Map<string, Map<BlockId, number>>();

  for (const b of blocks.values()) {
    const cx = Math.floor(b.pos[0] / CHUNK_SIZE);
    const cz = Math.floor(b.pos[2] / CHUNK_SIZE);
    const ck = chunkKey(cx, cz);

    if (!groups.has(ck)) groups.set(ck, new Map());
    if (!counts.has(ck)) counts.set(ck, new Map());
    const byIdCount = counts.get(ck)!;
    byIdCount.set(b.id, (byIdCount.get(b.id) ?? 0) + 1);
  }

  for (const [ck, byIdCount] of counts) {
    const byId = groups.get(ck)!;
    for (const [id, count] of byIdCount) {
      byId.set(id, new Float32Array(count * 3));
    }
  }

  const cursors = new Map<string, Map<BlockId, number>>();
  for (const b of blocks.values()) {
    const cx = Math.floor(b.pos[0] / CHUNK_SIZE);
    const cz = Math.floor(b.pos[2] / CHUNK_SIZE);
    const ck = chunkKey(cx, cz);
    const byId = groups.get(ck)!;
    if (!cursors.has(ck)) cursors.set(ck, new Map());
    const cur = cursors.get(ck)!;

    const arr = byId.get(b.id)!;
    const i = cur.get(b.id) ?? 0;
    arr[i * 3 + 0] = b.pos[0];
    arr[i * 3 + 1] = b.pos[1];
    arr[i * 3 + 2] = b.pos[2];
    cur.set(b.id, i + 1);
  }

  return groups; // Map<chunkKey, Map<BlockId, Float32Array>>
}

export default function BlocksOptimized({
  blocks,
  place,
  remove, // legacy fallback
  removeWithDrop, // preferred for controlling drops
  selected,
  currentTool = null,
  miningSpeedMultiplier = 1,
  onMiningProgress,
}: {
  blocks: Map<string, WorldBlock>;
  place: (x: number, y: number, z: number, id: BlockId) => void;
  remove: (x: number, y: number, z: number) => void;
  removeWithDrop?: (x: number, y: number, z: number, allowDrop: boolean) => void;
  selected: BlockId;
  currentTool?: ToolItemId | null;
  miningSpeedMultiplier?: number;
  onMiningProgress?: (p: number | null) => void;
}) {
  const { camera } = useThree();

  const groups = useMemo(() => groupByChunkAndId(blocks), [blocks]);
  const box = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);

  // --- Timed mining state ---
  const miningRef = useRef<{
    x: number;
    y: number;
    z: number;
    needed: number;      // seconds to finish
    elapsed: number;     // accumulated seconds
    allowDrop: boolean;  // drop rule captured at start
    active: boolean;
  } | null>(null);

  useFrame((_, delta) => {
    const m = miningRef.current;
    if (!m || !m.active) return;

    m.elapsed += delta * Math.max(0.0001, miningSpeedMultiplier);
    const p = Math.min(1, m.elapsed / Math.max(0.001, m.needed));
    onMiningProgress?.(p);

    if (p >= 1) {
      if (removeWithDrop) removeWithDrop(m.x, m.y, m.z, m.allowDrop);
      else remove(m.x, m.y, m.z);
      miningRef.current = null;
      onMiningProgress?.(null);
    }
  });

  // Cancel mining if mouse released anywhere
  useEffect(() => {
    const onUp = () => {
      if (miningRef.current) {
        miningRef.current = null;
        onMiningProgress?.(null);
      }
    };
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, [onMiningProgress]);

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
                { name: string; color: any; opacity?: number; transparent?: boolean; hardness?: number } | undefined
              >)[Number(id)];
            if (!spec) return null;

<<<<<<< HEAD
            const hardness = Math.max(0.05, spec.hardness ?? 0.25);
=======
            const hardness = Math.max(0.05, spec.hardness ?? 0.25); // seconds baseline
>>>>>>> origin/try_implement_recipes

            return (
              <instancedMesh
                key={`${ck}-${id}-${count}`}
                args={[box, undefined as any, count]}
                frustumCulled={false}
                onUpdate={(mesh) => {
                  const obj = new THREE.Object3D();
                  for (let i = 0; i < count; i++) {
                    obj.position.set(
                      posArray[i * 3 + 0],
                      posArray[i * 3 + 1],
                      posArray[i * 3 + 2]
                    );
                    obj.updateMatrix();
                    mesh.setMatrixAt(i, obj.matrix);
                  }
                  mesh.instanceMatrix.needsUpdate = true;
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  const instanceId = e.instanceId;
                  if (instanceId == null) return;

                  const pe = e.nativeEvent as PointerEvent;
                  const button = pe?.button ?? (e as any)?.button;

                  const bx = Math.round(posArray[instanceId * 3 + 0]);
                  const by = Math.round(posArray[instanceId * 3 + 1]);
                  const bz = Math.round(posArray[instanceId * 3 + 2]);

                  if (button === 0) {
                    // LMB: start timed mining with tool effects
                    const effect = getMiningEffectFor(currentTool ?? null, Number(id) as BlockId);
<<<<<<< HEAD
                    const needed = hardness / Math.max(0.1, effect.speedMultiplier);
=======
                    const speed  = Math.max(0.05, effect.speedMultiplier);
                    const needed = Math.max(0.18, hardness / speed); // never faster than ~180ms baseline
>>>>>>> origin/try_implement_recipes
                    miningRef.current = {
                      x: bx,
                      y: by,
                      z: bz,
                      needed,
                      elapsed: 0,
                      allowDrop: effect.allowDrop,
                      active: true,
                    };
                    onMiningProgress?.(0);
                    return;
                  }

                  if (button === 2) {
                    // RMB: place adjacent on the face we clicked
                    pe?.preventDefault?.();

                    const n = (e.face?.normal ?? new THREE.Vector3(0, 1, 0)).clone();
                    const nx = Math.sign(n.x) * (Math.abs(n.x) > 0.5 ? 1 : 0);
                    const ny = Math.sign(n.y) * (Math.abs(n.y) > 0.5 ? 1 : 0);
                    const nz = Math.sign(n.z) * (Math.abs(n.z) > 0.5 ? 1 : 0);

                    const x = bx + nx;
                    const y = by + ny;
                    const z = bz + nz;

                    const eye =
                      (camera.position as THREE.Vector3) ?? new THREE.Vector3(0, 2.6, 0);
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
