"use client";

import React from "react";
import * as THREE from "three";
import { BLOCKS } from "../lib/constants";
import { key } from "../lib/utils";
import type { WorldBlock } from "../lib/types";

export default function Blocks({
  blocks,
  onBlockPointerDown,
}: {
  blocks: Map<string, WorldBlock>;
  onBlockPointerDown: (e: any, b: WorldBlock) => void;
}) {
  return (
    <group>
      {Array.from(blocks.values()).map((b) => (
        <mesh
          key={key(b.pos[0], b.pos[1], b.pos[2])}
          position={b.pos}
          onPointerDown={(e) => onBlockPointerDown(e, b)}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial
            color={BLOCKS[b.id].color}
            opacity={BLOCKS[b.id].opacity}
            transparent={BLOCKS[b.id].transparent}
          />
        </mesh>
      ))}
    </group>
  );
}
