"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { PointerLockControls } from "@react-three/drei";
import * as THREE from "three";

import BlocksOptimized from "./components/BlocksOptimized";
import Crosshair from "./components/Crosshair";
import Ground from "./components/Ground";
import Hotbar from "./components/Hotbar";
import Player from "./components/Player";
import OtherPlayers from "./components/OtherPlayers";
import ConnectionStatus from "./components/ConnectionStatus";
import { cellKey } from "./lib/chunks";
import InventoryOverlay from "./components/InventoryOverlay";

import { useInfiniteWorld } from "./hooks/useInfiniteWorld";
import { blockOverlapsPlayer } from "./lib/physics";
import type { BlockId } from "./lib/types";
import { GameSocket } from "./lib/ws";

// Drive chunk streaming from inside the Canvas
function Streamer({ updateAround }: { updateAround: (p: THREE.Vector3) => void }) {
  const { camera } = useThree();
  useFrame(() => updateAround(camera.position));
  return null;
}

function SendInitialMove({ sendMove }: { sendMove: (x: number, y: number, z: number) => void }) {
  const { camera } = useThree();
  useEffect(() => {
    sendMove(
      Math.round(camera.position.x),
      Math.round(camera.position.y),
      Math.round(camera.position.z)
    );
  }, [camera, sendMove]);
  return null;
}

function MovementEmitter({ sendMove }: { sendMove: (x: number, y: number, z: number) => void }) {
  const { camera } = useThree();
  const sentFirst = useRef(false);
  const last = useRef(0);
  useFrame(({ clock }) => {
    if (!sentFirst.current) {
      sentFirst.current = true;
      sendMove(
        Math.round(camera.position.x),
        Math.round(camera.position.y),
        Math.round(camera.position.z)
      );
      return;
    }
    const t = clock.getElapsedTime();
    if (t - last.current > 0.1) {
      last.current = t;
      sendMove(
        Math.round(camera.position.x),
        Math.round(camera.position.y),
        Math.round(camera.position.z)
      );
    }
  });
  return null;
}

export default function GamePage() {
  // --- Inventory UI state ---
  const [inventoryOpen, setInventoryOpen] = useState(false);

  // Track cursor for overlay
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      (window as any).lastMouseX = e.clientX;
      (window as any).lastMouseY = e.clientY;
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  // Toggle inventory with I/E; close with Esc
  const lockRef = useRef<{ lock: () => void; unlock: () => void } | null>(null);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const isTyping =
        (e.target as HTMLElement | null)?.matches?.("input, textarea, [contenteditable]") ?? false;
      if (isTyping) return;

      if (e.key.toLowerCase() === "i" || e.key.toLowerCase() === "e") {
        e.preventDefault();
        setInventoryOpen((open) => {
          const next = !open;
          if (next) {
            try { lockRef.current?.unlock?.(); } catch {}
          }
          return next;
        });
      } else if (e.key === "Escape" && inventoryOpen) {
        e.preventDefault();
        setInventoryOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [inventoryOpen]);

  // Inventory slots (blocks for now; fine to extend later)
  type ItemStack = { id: BlockId; count: number } | null;
  const [inv, setInv] = useState<ItemStack[]>(() => {
    const a = Array.from({ length: 27 }, () => null) as ItemStack[];
    a[0] = { id: 1, count: 32 };
    a[1] = { id: 5, count: 18 };
    a[2] = { id: 7, count: 12 };
    return a;
  });
  const [craft, setCraft] = useState<ItemStack[]>(() => Array.from({ length: 9 }, () => null) as ItemStack[]);
  const [hotbarInv, setHotbarInv] = useState<ItemStack[]>(() => Array.from({ length: 9 }, () => null) as ItemStack[]);

  // Add mined items into inventory
  const addItemToInventory = useCallback((id: BlockId, amount: number = 1) => {
    setInv((curr) => {
      let remain = amount;
      const next = curr.slice();

      for (let i = 0; i < next.length && remain > 0; i++) {
        const it = next[i];
        if (it && it.id === id && it.count < 64) {
          const room = 64 - it.count;
          const put = Math.min(room, remain);
          next[i] = { id, count: it.count + put };
          remain -= put;
        }
      }
      for (let i = 0; i < next.length && remain > 0; i++) {
        if (!next[i]) {
          const put = Math.min(64, remain);
          next[i] = { id, count: put };
          remain -= put;
        }
      }
      return next;
    });
  }, []);

  const [selected, setSelected] = useState<BlockId>(1);

  const { blocks, place, remove, hasBlock, updateAround, getTopY } = useInfiniteWorld({
    viewDistance: 3,
  });

  // Multiplayer
  const [sessionId] = useState<string>(() => {
    if (typeof window === "undefined") return "alpha-world";
    const u = new URL(window.location.href);
    return u.searchParams.get("session") || "alpha-world";
  });
  const socketRef = useRef<GameSocket | null>(null);
  const youRef = useRef<{ id: string } | null>(null);
  const othersRef = useRef<Map<string, { x: number; y: number; z: number }>>(new Map());
  const peersRef = useRef<Set<string>>(new Set());
  const [connected, setConnected] = useState(false);
  const [, forceTick] = useState(0);
  const bump = () => forceTick((n) => (n + 1) % 1_000_000);

  useEffect(() => {
    const wsBase = "ws://localhost:8000";
    const url = `${wsBase}/ws/game/${encodeURIComponent(sessionId)}/`;

    const onMsg = (raw: any) => {
      const msg = { ...raw, type: typeof raw?.type === "string" ? raw.type.replaceAll(".", "_") : raw?.type };
      console.log("[WS] msg", msg);

      switch (msg.type) {
        case "welcome": {
          youRef.current = { id: msg.you.id };
          othersRef.current.clear();
          peersRef.current.clear();
          for (const pid of Object.keys(msg.players || {})) {
            if (pid !== msg.you.id) peersRef.current.add(pid);
          }
          bump();
          break;
        }
        case "player_join": {
          if (msg.player.id !== youRef.current?.id) {
            peersRef.current.add(msg.player.id);
            bump();
          }
          break;
        }
        case "player_leave": {
          peersRef.current.delete(msg.player.id);
          othersRef.current.delete(msg.player.id);
          bump();
          break;
        }
        case "player_move": {
          const isMine = youRef.current?.id === msg.player.id;
          if (!isMine) {
            peersRef.current.add(msg.player.id);
            othersRef.current.set(msg.player.id, msg.pos);
            bump();
          }
          break;
        }
        case "block_place": {
          wrappedPlace(msg.block.x, msg.block.y, msg.block.z, msg.block.kind as BlockId, false);
          break;
        }
        case "block_remove": {
          wrappedRemove(msg.x, msg.y, msg.z, false);
          break;
        }
      }
    };

    const gs = new GameSocket(url, onMsg, () => setConnected(true), () => setConnected(false));
    (gs as any)._debug = true;
    socketRef.current = gs;
    gs.connect("guest");
    return () => gs.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const wrappedPlace = useCallback(
    (x: number, y: number, z: number, id: BlockId, emit = true) => {
      place(x, y, z, id);
      if (emit) socketRef.current?.send({ type: "place_block", x, y, z, block: id });
    },
    [place]
  );

  const wrappedRemove = useCallback(
    (x: number, y: number, z: number, emit = true) => {
      const ck = cellKey(x, y, z);
      const b = blocks.get(ck);
      remove(x, y, z);
      if (emit) {
        if (b) addItemToInventory(b.id, 1);
        socketRef.current?.send({ type: "remove_block", x, y, z });
      }
    },
    [remove, blocks, addItemToInventory]
  );

  // RMB places on ground (when not clicking a block)
  const handleGroundPointerDown = useCallback(
    (e: any) => {
      e.stopPropagation();
      const button = (e.nativeEvent as PointerEvent)?.button ?? e.button;
      if (button === 2) {
        const p = e.point as THREE.Vector3;
        const x = Math.round(p.x);
        const z = Math.round(p.z);
        const y = getTopY(x, z) + 1;
        const eye = (e?.ray?.camera?.position as THREE.Vector3) ?? new THREE.Vector3(0, 2.6, 0);
        if (blockOverlapsPlayer(eye, x, y, z)) return;
        wrappedPlace(x, y, z, selected);
      }
    },
    [getTopY, selected, wrappedPlace]
  );

  const sendMove = useCallback((x: number, y: number, z: number) => {
    socketRef.current?.send({ type: "move", x, y, z });
  }, []);

  // --- Mining progress UI (simple center bar) ---
  const [miningProgress, setMiningProgress] = useState<number | null>(null);

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
      onContextMenu={(e) => e.preventDefault()}
    >
      <Canvas
        id="minecraft-canvas"
        shadows
        camera={{ fov: 75, near: 0.1, far: 2000, position: [0, 1.8, 6] }}
        onPointerDown={() => {
          if (!inventoryOpen && !locked) lockRef.current?.lock?.();
        }}
        gl={{ powerPreference: "high-performance" }}
      >
        {/* Lights */}
        <hemisphereLight args={[0xffffff, 0x223344, 0.6]} />
        <directionalLight position={[10, 50, 10]} intensity={1} castShadow />

        {/* Sky */}
        <color attach="background" args={["#87CEEB"]} />

        {/* Stream chunks around the camera */}
        <Streamer updateAround={updateAround} />

        {/* Ensure peers see us immediately + keep emitting at 10 Hz */}
        <SendInitialMove sendMove={sendMove} />
        <MovementEmitter sendMove={sendMove} />

        {/* World (instanced for perf; now with timed mining) */}
        <BlocksOptimized
          blocks={blocks}
          place={(x, y, z, id) => wrappedPlace(x, y, z, id)}
          remove={(x, y, z) => wrappedRemove(x, y, z)}
          selected={selected}
          miningSpeedMultiplier={1}                 // tweak later for tools
          onMiningProgress={setMiningProgress}      // show HUD bar
        />

        {/* Large ground plane for easy placement when not clicking a block */}
        <Ground onPointerDown={handleGroundPointerDown} />

        {/* Player & mouse-look */}
        <Player hasBlock={hasBlock} paused={inventoryOpen} />
        {!inventoryOpen && (
          <PointerLockControls
            ref={lockRef as any}
            makeDefault
            onLock={() => setLocked(true)}
            onUnlock={() => setLocked(false)}
          />
        )}

        {/* Remote players */}
        <OtherPlayers entries={[...othersRef.current.entries()]} />
      </Canvas>

      {/* HUD */}
      {!inventoryOpen && <Crosshair />}

      {/* Mining progress bar (center, below crosshair) */}
      {!inventoryOpen && miningProgress != null && (
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, calc(-50% + 28px))",
            width: 140,
            height: 8,
            borderRadius: 6,
            background: "rgba(255,255,255,0.2)",
            boxShadow: "0 2px 8px rgba(0,0,0,0.25) inset",
            overflow: "hidden",
            zIndex: 20,
          }}
        >
          <div
            style={{
              width: `${Math.round(miningProgress * 100)}%`,
              height: "100%",
              background: "rgba(255,255,255,0.95)",
              borderRadius: 6,
              transition: "width 60ms linear",
            }}
          />
        </div>
      )}

      <Hotbar selected={selected} setSelected={setSelected} disabled={inventoryOpen} />
      <ConnectionStatus connected={connected} peers={[...peersRef.current.keys()]} />

      {/* Inventory Overlay */}
      <InventoryOverlay
        open={inventoryOpen}
        onClose={() => setInventoryOpen(false)}
        inventory={inv}
        setInventory={(u) => setInv((curr) => u(curr))}
        craft={craft}
        setCraft={(u) => setCraft((curr) => u(curr))}
        hotbar={hotbarInv}
        setHotbar={(u) => setHotbarInv((curr) => u(curr))}
        addToInventory={addItemToInventory}
      />
    </div>
  );
}
