"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { PointerLockControls } from "@react-three/drei";
import * as THREE from "three";

type Vec3 = [number, number, number];
type BlockId = 1 | 2 | 3 | 4 | 5 | 6 | 7;

const BLOCKS: Record<BlockId, { name: string; color: string; opacity?: number; transparent?: boolean }> = {
  1: { name: "Grass", color: "#3fbf3f" },
  2: { name: "Dirt", color: "#7a5230" },
  3: { name: "Stone", color: "#8a8f98" },
  4: { name: "Sand", color: "#e3d7a3" },
  5: { name: "Wood", color: "#a26a2a" },
  6: { name: "Brick", color: "#b04949" },
  7: { name: "Glass", color: "#7dd3fc", opacity: 0.4, transparent: true },
};

const key = (x: number, y: number, z: number) => `${x},${y},${z}`;

function roundToGrid(n: number) {
  return Math.round(n);
}

const FORWARD_KEYS = new Set(["w", "z", "ArrowUp"]);
const BACKWARD_KEYS = new Set(["s", "ArrowDown"]);
const LEFT_KEYS = new Set(["a", "q", "ArrowLeft"]);
const RIGHT_KEYS = new Set(["d", "ArrowRight"]);

type WorldBlock = { pos: Vec3; id: BlockId };

function useWorld(initialRange = 12) {
  const [blocks, setBlocks] = useState<Map<string, WorldBlock>>(() => {
    const m = new Map<string, WorldBlock>();
    for (let x = -initialRange; x <= initialRange; x++) {
      for (let z = -initialRange; z <= initialRange; z++) {
        const y = 0;
        m.set(key(x, y, z), { pos: [x, y, z], id: 1 });
      }
    }
    return m;
  });

  const hasBlock = useCallback((x: number, y: number, z: number) => blocks.has(key(x, y, z)), [blocks]);

  const place = useCallback((x: number, y: number, z: number, id: BlockId) => {
    setBlocks((prev) => {
      const k = key(x, y, z);
      if (prev.has(k)) return prev;
      const next = new Map(prev);
      next.set(k, { pos: [x, y, z], id });
      return next;
    });
  }, []);

  const remove = useCallback((x: number, y: number, z: number) => {
    setBlocks((prev) => {
      const k = key(x, y, z);
      if (!prev.has(k)) return prev;
      const next = new Map(prev);
      next.delete(k);
      return next;
    });
  }, []);

  return { blocks, place, remove, hasBlock };
}

function Player() {
  const { camera } = useThree();
  const vel = useRef(new THREE.Vector3());
  const dir = useRef(new THREE.Vector3());
  const onGround = useRef(true);
  const pressed = useRef<Set<string>>(new Set());

  useEffect(() => {
    const down = (e: KeyboardEvent) => pressed.current.add(e.key.toLowerCase());
    const up = (e: KeyboardEvent) => pressed.current.delete(e.key.toLowerCase());
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useEffect(() => {
    camera.position.set(0, 1.8, 6);
  }, [camera]);

  useFrame((_, dt) => {
    const SPEED = 6;
    const GRAVITY = 24;
    const JUMP_V = 8;

    const forward = Array.from(pressed.current).some((k) => FORWARD_KEYS.has(k));
    const backward = Array.from(pressed.current).some((k) => BACKWARD_KEYS.has(k));
    const left = Array.from(pressed.current).some((k) => LEFT_KEYS.has(k));
    const right = Array.from(pressed.current).some((k) => RIGHT_KEYS.has(k));

    // +1 forward, -1 backward; +1 right, -1 left
    const fAxis = (forward ? 1 : 0) + (backward ? -1 : 0);
    const rAxis = (right ? 1 : 0) + (left ? -1 : 0);

    dir.current.set(rAxis, 0, fAxis);
    if (dir.current.lengthSq() > 0) dir.current.normalize();

    const forwardVec = new THREE.Vector3();
    camera.getWorldDirection(forwardVec);
    forwardVec.y = 0;
    if (forwardVec.lengthSq() > 0) forwardVec.normalize();

    // Right vector (forward × up gives +X when looking down -Z)
    const rightVec = new THREE.Vector3().crossVectors(forwardVec, new THREE.Vector3(0, 1, 0)).normalize();

    const move = new THREE.Vector3();
    move.addScaledVector(forwardVec, dir.current.z);
    move.addScaledVector(rightVec, dir.current.x);
    if (move.lengthSq() > 0) move.normalize();

    const sprint = pressed.current.has("shift") && !pressed.current.has(" ");
    const speed = SPEED * (sprint ? 1.5 : 1);

    camera.position.addScaledVector(move, speed * dt);

    if (pressed.current.has(" ") && onGround.current) {
      vel.current.y = JUMP_V;
      onGround.current = false;
    }
    vel.current.y -= GRAVITY * dt;
    camera.position.y += vel.current.y * dt;

    const groundEyeY = 1.6;
    if (camera.position.y < groundEyeY) {
      camera.position.y = groundEyeY;
      vel.current.y = 0;
      onGround.current = true;
    }
  });

  return null;
}

function Blocks({
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

function Ground({ onPointerDown }: { onPointerDown: (e: any) => void }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]} onPointerDown={onPointerDown} receiveShadow>
      <planeGeometry args={[500, 500]} />
      <meshStandardMaterial color="#9ec8a0" />
    </mesh>
  );
}

function Hotbar({ selected, setSelected }: { selected: BlockId; setSelected: (n: BlockId) => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= 7) setSelected(n as BlockId);
    };
    const onWheel = (e: WheelEvent) => {
      setSelected((prev) => {
        let next = prev + (e.deltaY > 0 ? 1 : -1);
        if (next < 1) next = 7;
        if (next > 7) next = 1;
        return next as BlockId;
      });
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("wheel", onWheel);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("wheel", onWheel);
    };
  }, [setSelected]);

  return (
    <div
      style={{
        position: "absolute",
        bottom: 16,
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        gap: 8,
      }}
    >
      {(Array.from({ length: 7 }) as unknown as BlockId[])
        .map((_, i) => (i + 1) as BlockId)
        .map((id) => (
          <button
            key={id}
            onClick={() => setSelected(id)}
            style={{
              width: 44,
              height: 44,
              borderRadius: 8,
              border: id === selected ? "3px solid #2563eb" : "2px solid #1f2937",
              background: BLOCKS[id].color,
              opacity: BLOCKS[id].transparent ? 0.7 : 1,
              boxShadow: id === selected ? "0 0 0 4px rgba(37,99,235,.2)" : undefined,
              cursor: "pointer",
            }}
            title={`${id} – ${BLOCKS[id].name}`}
          />
        ))}
    </div>
  );
}

function Crosshair() {
  return (
    <div
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        pointerEvents: "none",
      }}
    >
      <div style={{ width: 2, height: 16, background: "#fff", margin: "-8px auto 0" }} />
      <div style={{ width: 16, height: 2, background: "#fff", margin: "-1px auto" }} />
    </div>
  );
}

export default function Game() {
  const [selected, setSelected] = useState<BlockId>(1);
  const { blocks, place, remove } = useWorld(10);

  // Pointer lock (for mouse look). Click canvas to enter; Esc to unlock.
  const [locked, setLocked] = useState(false);
  const lockRef = useRef<{ lock: () => void; unlock: () => void } | null>(null);

  // LMB mines; RMB places adjacent
  const handleBlockPointerDown = useCallback(
    (e: any, b: WorldBlock) => {
      e.stopPropagation();
      if (e.button === 0) {
        // mine
        remove(b.pos[0], b.pos[1], b.pos[2]);
      } else if (e.button === 2) {
        // place adjacent to clicked face
        const normalMatrix = new THREE.Matrix3().getNormalMatrix(e.object.matrixWorld);
        const worldNormal = e.face?.normal.clone().applyMatrix3(normalMatrix).normalize();
        const target = new THREE.Vector3().fromArray(b.pos).add(worldNormal ?? new THREE.Vector3(0, 1, 0));
        place(Math.round(target.x), Math.round(target.y), Math.round(target.z), selected);
      }
    },
    [place, remove, selected]
  );

  // RMB places on ground
  const handleGroundPointerDown = useCallback(
    (e: any) => {
      e.stopPropagation();
      if (e.button === 2) {
        const p = e.point as THREE.Vector3;
        const x = roundToGrid(p.x);
        const z = roundToGrid(p.z);
        const y = 0;
        place(x, y, z, selected);
      }
    },
    [place, selected]
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
        camera={{ fov: 75, near: 0.1, far: 1000, position: [0, 1.8, 6] }}
        onPointerDown={() => {
          if (!locked) lockRef.current?.lock?.();
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* Lights */}
        <hemisphereLight args={[0xffffff, 0x223344, 0.6]} />
        <directionalLight position={[10, 20, 10]} intensity={1} castShadow />

        {/* Sky */}
        <color attach="background" args={["#87CEEB"]} />

        {/* World */}
        <Blocks blocks={blocks} onBlockPointerDown={handleBlockPointerDown} />
        <Ground onPointerDown={handleGroundPointerDown} />

        {/* Player & mouse-look */}
        <Player />
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
