"use client";

import * as React from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Sky, Environment, PointerLockControls } from "@react-three/drei";
import * as THREE from "three";

import type { BlockId, Vec3 } from "./lib/types";
import { BLOCKS, hardnessFor } from "./lib/blocks";
import { WORLD_SIZE, keyOf, parseKey, seedWorld, loadWorld, saveWorld } from "./lib/world";
import Player, { PlayerAPI } from "./components/Player";
import Voxel from "./components/Voxel";
import GroundPlane from "./components/GroundPlane";
import RemotePlayers from "./components/RemotePlayers"; // <-- now imported
import { PLAYER_RADIUS } from "./lib/collision";
import { wsBase } from "./lib/ws"; // <-- extracted

const Y_MIN = 0;
const Y_MAX = 64;
const INTERACT_DIST = 6.5;

type MiningState = {
  key: string;
  pos: Vec3;
  id: BlockId;
  progress: number; // 0..1
  total: number; // seconds to break
};

export default function Game() {
  /* ---------- Local world state ---------- */
  const [selected, setSelected] = React.useState<BlockId>("GRASS");
  const [blocks, setBlocks] = React.useState<Record<string, BlockId>>(
    () => (typeof window === "undefined" ? seedWorld() : loadWorld() ?? seedWorld())
  );

  const solid = React.useMemo(() => {
    const s = new Set<string>();
    for (const [k, id] of Object.entries(blocks)) if (id !== "EMPTY" && id !== "WATER") s.add(k);
    return s;
  }, [blocks]);

  const blocksRef = React.useRef(blocks);
  React.useEffect(() => { blocksRef.current = blocks; }, [blocks]);

  /* ---------- Multiplayer (WS) ---------- */
  const room =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("room") || "lobby"
      : "lobby";

  const [clientId, setClientId] = React.useState<string | null>(null);
  const selfIdRef = React.useRef<string | null>(null);
  const [gotSnapshot, setGotSnapshot] = React.useState(false);

  // NOTE: matches the inline shape you had (no `id` in each player object)
  const [others, setOthers] = React.useState<
    Record<string, { p: [number, number, number]; ry: number; name?: string }>
  >({});
  const wsRef = React.useRef<WebSocket | null>(null);
  const [wsReady, setWsReady] = React.useState(false);

  function getJwtToken() {
    return (
      (typeof window !== "undefined" &&
        (localStorage.getItem("access") || localStorage.getItem("access_token"))) ||
      ""
    );
  }

  React.useEffect(() => {
    let closed = false;
    let retry = 0;

    const connect = () => {
      const token = getJwtToken();
      const base = wsBase();
      const qs = token ? `?token=${encodeURIComponent(token)}` : "";
      const url = `${base}/ws/mc/${encodeURIComponent(room)}/${qs}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsReady(true);
        setGotSnapshot(false);
        setClientId(null);
        selfIdRef.current = null;
        retry = 0;
      };
      ws.onclose = () => {
        setWsReady(false);
        if (closed) return;
        const delay = Math.min(2000 * (retry++ + 1), 8000);
        setTimeout(connect, delay);
      };
      ws.onerror = () => {
        try { ws.close(); } catch {}
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type !== "snapshot" && !selfIdRef.current) return;

          switch (msg.type) {
            case "snapshot": {
              const yourId = msg.your_id || null;
              setClientId(yourId);
              selfIdRef.current = yourId;
              setGotSnapshot(true);

              const world = (msg.world || {}) as Record<string, BlockId>;
              setBlocks(world);
              blocksRef.current = world;

              const pmap: Record<string, any> = {};
              for (const [id, pl] of Object.entries<any>(msg.players || {})) {
                if (id !== yourId)
                  pmap[id] = { p: pl.p as [number, number, number], ry: pl.ry || 0, name: pl.name };
              }
              setOthers(pmap);
              break;
            }
            case "place": {
              const [x, y, z] = String(msg.k).split(",").map(Number) as [number, number, number];
              placeAtNow([x, y, z], msg.id as BlockId);
              break;
            }
            case "remove": {
              const [x, y, z] = String(msg.k).split(",").map(Number) as [number, number, number];
              placeAtNow([x, y, z], "EMPTY");
              break;
            }
            case "state": {
              const id = msg.id as string;
              if (!id || id === selfIdRef.current) break;
              setOthers((prev) => ({
                ...prev,
                [id]: { p: msg.p as [number, number, number], ry: msg.ry || 0, name: msg.name },
              }));
              break;
            }
            case "join": {
              const id = msg.id as string;
              if (!id || id === selfIdRef.current) break;
              const pl = msg.player || {};
              setOthers((prev) => ({
                ...prev,
                [id]: { p: pl.p || [10, 3, 10], ry: pl.ry || 0, name: pl.name },
              }));
              break;
            }
            case "leave": {
              const id = msg.id as string;
              setOthers((prev) => {
                const n = { ...prev };
                delete n[id];
                return n;
              });
              break;
            }
          }
        } catch {}
      };
    };

    connect();
    return () => { closed = true; wsRef.current?.close(); };
  }, [room]);

  const wsSend = React.useCallback((o: any) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(o));
  }, []);
  const broadcastPlace = React.useCallback((k: string, id: BlockId) => wsSend({ type: "place", k, id }), [wsSend]);
  const broadcastRemove = React.useCallback((k: string) => wsSend({ type: "remove", k }), [wsSend]);

  /* ---------- Fullscreen ---------- */
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [isFs, setIsFs] = React.useState(false);
  const [mustFs, setMustFs] = React.useState(true);

  const requestFullscreen = React.useCallback(async () => {
    const el = containerRef.current as any;
    if (!el) return;
    const req =
      el.requestFullscreen ||
      el.webkitRequestFullscreen ||
      el.msRequestFullscreen ||
      el.mozRequestFullScreen;
    if (req) await req.call(el);
  }, []);
  const exitFullscreen = React.useCallback(async () => {
    const doc: any = document;
    const exit =
      doc.exitFullscreen ||
      doc.webkitExitFullscreen ||
      doc.msExitFullscreen ||
      doc.mozCancelFullScreen;
    if (exit) await exit.call(document);
  }, []);
  React.useEffect(() => {
    const onChange = () => {
      const fsEl =
        (document as any).fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement;
      setIsFs(!!fsEl);
    };
    document.addEventListener("fullscreenchange", onChange);
    (document as any).addEventListener?.("webkitfullscreenchange", onChange);
    (document as any).addEventListener?.("mozfullscreenchange", onChange);
    (document as any).addEventListener?.("MSFullscreenChange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      (document as any).removeEventListener?.("webkitfullscreenchange", onChange);
      (document as any).removeEventListener?.("mozfullscreenchange", onChange);
      (document as any).removeEventListener?.("MSFullscreenChange", onChange);
    };
  }, []);

  /* ---------- Pointer lock & menu ---------- */
  const plcRef = React.useRef<any>(null);
  const playerRef = React.useRef<PlayerAPI>(null);
  const camRef = React.useRef<THREE.PerspectiveCamera | null>(null);

  const [locked, setLocked] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const importInputRef = React.useRef<HTMLInputElement | null>(null);

  // Stream local player state ~10 Hz
  React.useEffect(() => {
    let raf = 0, last = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (!locked || !camRef.current || !gotSnapshot) return;
      if (t - last < 100) return;
      last = t;

      const cam = camRef.current!;
      const feet = playerRef.current?.getFeet();
      const pos: [number, number, number] = feet
        ? [feet.x, feet.y, feet.z]
        : [cam.position.x, cam.position.y, cam.position.z];
      const dir = new THREE.Vector3();
      cam.getWorldDirection(dir);
      const ry = Math.atan2(dir.x, dir.z);

      wsSend({ type: "state", p: pos, ry, sel: selected });
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [locked, selected, wsSend, gotSnapshot]);

  /* --- Jump gating to stop infinite pillar --- */
  const JUMP_GRACE_MS = 120; // allow quick jump->place timing
  const lastJumpPress = React.useRef(0);
  // Require a *new* Space keydown for each under-self placement
  const spaceSinceUnderSelfPlaceRef = React.useRef(false);
  // Also limit to one under-self place per airborne arc
  const underSelfPlacedThisAirborneRef = React.useRef(false);

  const recentlyJumped = React.useCallback(
    () => performance.now() - lastJumpPress.current < JUMP_GRACE_MS,
    []
  );

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        lastJumpPress.current = performance.now();
        spaceSinceUnderSelfPlaceRef.current = true; // arm one placement per press
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Block browser shortcuts (Ctrl/⌘ + movement keys) while actively playing,
  // but DO NOT stop propagation — let our movement handlers see the keys.
  React.useEffect(() => {
    const MOVEMENT_CODES = new Set([
      "KeyW","KeyA","KeyS","KeyD",   // WASD
      "KeyZ","KeyQ",                 // AZERTY (ZQSD)
      "ArrowUp","ArrowLeft","ArrowDown","ArrowRight",
      "Space",
    ]);

    const onKeyDownBlocker = (e: KeyboardEvent) => {
      if (!locked || menuOpen) return;

      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) &&
          (MOVEMENT_CODES.has(e.code) || k === "s" || k === "d" || k === "z" || k === "p" || k === "r")) {
        e.preventDefault(); // stop browser shortcut
        // DO NOT call stopPropagation(); we still want our movement listeners to get this
      }
    };

    window.addEventListener("keydown", onKeyDownBlocker); // bubble phase
    return () => window.removeEventListener("keydown", onKeyDownBlocker);
  }, [locked, menuOpen]);


  // Digits + Save + ESC menu (with Ctrl+S gated to not fire during active play)
  React.useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      if (e.code.startsWith("Digit")) {
        const n = Number(e.code.replace("Digit", ""));
        if (n >= 1 && n <= BLOCKS.length) { e.preventDefault(); setSelected(BLOCKS[n - 1].id); }
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!locked || menuOpen) {
          saveWorld(blocks);
          alert("World saved locally.");
        }
        return;
      }
      if (e.key === "Escape" || e.code === "KeyP") {
        e.preventDefault();
        if (menuOpen) {
          if (mustFs && !isFs) { try { await requestFullscreen(); } catch {} }
          setMenuOpen(false); plcRef.current?.lock?.();
        } else {
          setMenuOpen(true); plcRef.current?.unlock?.();
        }
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true } as any);
  }, [blocks, menuOpen, isFs, mustFs, requestFullscreen, locked]);

  // Wheel cycles selected block
  React.useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (!containerRef.current || !containerRef.current.contains(e.target as Node)) return;
      e.preventDefault();
      const dir = e.deltaY > 0 ? 1 : -1;
      setSelected((cur) => {
        const idx = BLOCKS.findIndex((b) => b.id === cur);
        return BLOCKS[(idx + dir + BLOCKS.length) % BLOCKS.length].id;
      });
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel as any);
  }, []);

  /* ---------- World helpers ---------- */
  const blockEntries = React.useMemo(
    () => Object.entries(blocks).map(([k, id]) => ({ id, pos: parseKey(k) as Vec3 })),
    [blocks]
  );

  function placeAtNow(pos: Vec3, id: BlockId) {
    const [x, y, z] = pos;
    if (x < 0 || x >= WORLD_SIZE || z < 0 || z >= WORLD_SIZE || y < Y_MIN || y > Y_MAX) return;
    const k = keyOf(pos);
    setBlocks((prev) => {
      const next = { ...prev };
      if (id === "EMPTY") delete next[k]; else next[k] = id;
      return next;
    });
    if (id === "EMPTY") delete (blocksRef.current as any)[k];
    else (blocksRef.current as any)[k] = id;
  }
  const placeAtNowAndBroadcast = React.useCallback(
    (pos: Vec3, id: BlockId) => {
      placeAtNow(pos, id);
      const k = keyOf(pos);
      if (id === "EMPTY") broadcastRemove(k); else broadcastPlace(k, id);
    },
    [broadcastPlace, broadcastRemove]
  );

  const onSave = () => { saveWorld(blocks); alert("World saved in your browser."); };
  const onLoad = () => { const m = loadWorld(); if (!m) return alert("No saved world found."); setBlocks(m); blocksRef.current = m; };
  const onClear = () => { if (!confirm("Clear the world? This won't remove your saved copy.")) return; setBlocks({}); blocksRef.current = {}; };
  const onExport = () => {
    const blob = new Blob([JSON.stringify(blocks)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = "minecraft-world-3d.json"; a.click(); URL.revokeObjectURL(url);
  };
  const onImport = async (f: File) => {
    try { const text = await f.text(); const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== "object") throw new Error(); setBlocks(parsed); blocksRef.current = parsed;
    } catch { alert("Invalid world file."); }
  };

  const startPlay = React.useCallback(async () => {
    try { setMustFs(true); if (!isFs) await requestFullscreen(); } catch {}
    setMenuOpen(false); plcRef.current?.lock?.();
  }, [isFs, requestFullscreen]);

  /* ---------- Live world queries ---------- */
  const isFilled = React.useCallback((x: number, y: number, z: number) => {
    if (x < 0 || x >= WORLD_SIZE || z < 0 || z >= WORLD_SIZE || y < Y_MIN || y > Y_MAX) return true;
    const v = (blocksRef.current as any)[`${x},${y},${z}`];
    return !!(v && v !== "EMPTY" && v !== "WATER");
  }, []);

  // Grounded-aware airborne check: look directly BELOW feet cell (+small footprint)
  const isAirborneNow = React.useCallback(() => {
    const feet = playerRef.current?.getFeet();
    if (!feet) return false;
    const belowY = Math.floor(feet.y - 1.001);
    const offsets: Array<[number, number]> = [
      [0, 0],
      [PLAYER_RADIUS * 0.75, 0],
      [-PLAYER_RADIUS * 0.75, 0],
      [0, PLAYER_RADIUS * 0.75],
      [0, -PLAYER_RADIUS * 0.75],
    ];
    for (const [ox, oz] of offsets) {
      const bx = Math.floor(feet.x + ox);
      const bz = Math.floor(feet.z + oz);
      if (isFilled(bx, belowY, bz)) return false; // ground under us -> not airborne
    }
    return true;
  }, [isFilled]);

  /* --------- Corrected 3D DDA raycast --------- */
  function voxelRaycast(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number) {
    const pos = new THREE.Vector3(Math.floor(origin.x), Math.floor(origin.y), Math.floor(origin.z));
    const stepX = dir.x > 0 ? 1 : -1, stepY = dir.y > 0 ? 1 : -1, stepZ = dir.z > 0 ? 1 : -1;
    const invX = dir.x !== 0 ? 1 / Math.abs(dir.x) : Infinity;
    const invY = dir.y !== 0 ? 1 / Math.abs(dir.y) : Infinity;
    const invZ = dir.z !== 0 ? 1 / Math.abs(dir.z) : Infinity;
    const frac = (v: number) => v - Math.floor(v);

    let tMaxX = dir.x > 0 ? (1 - frac(origin.x)) * invX : frac(origin.x) * invX;
    let tMaxY = dir.y > 0 ? (1 - frac(origin.y)) * invY : frac(origin.y) * invY;
    let tMaxZ = dir.z > 0 ? (1 - frac(origin.z)) * invZ : frac(origin.z) * invZ;

    let t = 0;
    for (let i = 0; i < 256; i++) {
      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        pos.x += stepX; t = tMaxX; tMaxX += invX;
        if (t > maxDist) break;
        if (isFilled(pos.x, pos.y, pos.z)) return { hit: [pos.x, pos.y, pos.z] as Vec3, face: [-stepX, 0, 0] as Vec3 };
      } else if (tMaxY < tMaxZ) {
        pos.y += stepY; t = tMaxY; tMaxY += invY;
        if (t > maxDist) break;
        if (isFilled(pos.x, pos.y, pos.z)) return { hit: [pos.x, pos.y, pos.z] as Vec3, face: [0, -stepY, 0] as Vec3 };
      } else {
        pos.z += stepZ; t = tMaxZ; tMaxZ += invZ;
        if (t > maxDist) break;
        if (isFilled(pos.x, pos.y, pos.z)) return { hit: [pos.x, pos.y, pos.z] as Vec3, face: [0, 0, -stepZ] as Vec3 };
      }
    }
    return { hit: null as Vec3 | null, face: null as Vec3 | null };
  }

  /* ---------- Build (right-click place) ---------- */
  const handleRightClickPlace = React.useCallback(() => {
    if (!locked || menuOpen || !camRef.current) return;

    const cam = camRef.current!;
    const origin = new THREE.Vector3().copy(cam.position);
    const dir = new THREE.Vector3(); cam.getWorldDirection(dir).normalize();

    const { hit, face } = voxelRaycast(origin, dir, INTERACT_DIST);
    if (!hit || !face) return;

    // March outward along face normal until first empty cell
    let tx = hit[0] + face[0], ty = hit[1] + face[1], tz = hit[2] + face[2];
    for (let i = 0; i < 32 && isFilled(tx, ty, tz); i++) { tx += face[0]; ty += face[1]; tz += face[2]; }
    const target: Vec3 = [tx, ty, tz];

    // If target sits under player horizontally, gate it hard
    const feet = playerRef.current?.getFeet();
    if (feet) {
      const cx = target[0] + 0.5, cz = target[2] + 0.5;
      const dx = Math.abs(feet.x - cx), dz = Math.abs(feet.z - cz);
      const inside = dx <= 0.5 + PLAYER_RADIUS && dz <= 0.5 + PLAYER_RADIUS;

      if (inside) {
        const airborne = isAirborneNow();
        // Must be airborne or just jumped (timing window)...
        if (!(airborne || recentlyJumped())) return;
        // ...and only once per airborne arc...
        if (underSelfPlacedThisAirborneRef.current) return;
        // ...and require a *fresh* Space keydown (blocks holding Space)
        if (!spaceSinceUnderSelfPlaceRef.current) return;
      }
    }

    // Place block
    placeAtNowAndBroadcast(target, selected);

    // After placing under self: consume Space "ticket" and mark airborne-use
    if (playerRef.current?.getFeet) {
      const feet2 = playerRef.current.getFeet();
      const cx = target[0] + 0.5, cz = target[2] + 0.5;
      const dx = Math.abs(feet2.x - cx), dz = Math.abs(feet2.z - cz);
      const inside = dx <= 0.5 + PLAYER_RADIUS && dz <= 0.5 + PLAYER_RADIUS;
      if (inside) {
        spaceSinceUnderSelfPlaceRef.current = false;     // must press Space again
        underSelfPlacedThisAirborneRef.current = true;   // only once per airborne arc
      }
    }

    // Nudge up if we built under ourselves (small epsilon to settle on top)
    const feet2 = playerRef.current?.getFeet();
    if (feet2) {
      const cx = target[0] + 0.5, cz = target[2] + 0.5;
      const dx = Math.abs(feet2.x - cx), dz = Math.abs(feet2.z - cz);
      const inside = dx <= 0.5 + PLAYER_RADIUS && dz <= 0.5 + PLAYER_RADIUS;
      const topY = target[1] + 1.0;
      if (inside && feet2.y < topY + 0.001) {
        const need = (topY + 0.005) - feet2.y;
        if (need > 0) playerRef.current?.nudgeUp(need, true);
      }
    }
  }, [locked, menuOpen, selected, isFilled, isAirborneNow, recentlyJumped, placeAtNowAndBroadcast]);

  /* ---------- Mining (hold left to break, chain to next) ---------- */
  const [mining, setMining] = React.useState<MiningState | null>(null);
  const leftDownRef = React.useRef(false);

  // lock to the first targeted block; tolerate brief LOS loss
  const miningLockRef = React.useRef<{ key: string; lastSeen: number } | null>(null);
  const LOS_GRACE_MS = 200;

  // track left button state globally
  React.useEffect(() => {
    const onDown = (e: MouseEvent) => { if (e.button === 0 && locked && !menuOpen) leftDownRef.current = true; };
    const onUp = (e: MouseEvent) => { if (e.button === 0) { leftDownRef.current = false; miningLockRef.current = null; setMining(null); } };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousedown", onDown); window.removeEventListener("mouseup", onUp); };
  }, [locked, menuOpen]);

  // mining loop + also reset per-airborne flag when grounded
  React.useEffect(() => {
    let raf = 0;
    let last = performance.now();

    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (t - last) / 1000);
      last = t;

      if (!locked || menuOpen || !camRef.current) return;

      // Reset "one per airborne" when grounded
      if (!isAirborneNow()) underSelfPlacedThisAirborneRef.current = false;

      // (re)acquire lock when holding and no active target
      if (leftDownRef.current && !miningLockRef.current) {
        const cam = camRef.current!;
        const origin = new THREE.Vector3().copy(cam.position);
        const dir = new THREE.Vector3(); cam.getWorldDirection(dir).normalize();
        const { hit } = voxelRaycast(origin, dir, INTERACT_DIST);
        if (hit) {
          const k = keyOf(hit);
          const id = (blocksRef.current as any)[k] as BlockId | undefined;
          if (id && id !== "EMPTY" && id !== "WATER") {
            miningLockRef.current = { key: k, lastSeen: performance.now() };
            setMining({ key: k, pos: hit, id, progress: 0, total: Math.max(0.05, hardnessFor(id)) });
          }
        }
      }

      if (!leftDownRef.current || !miningLockRef.current) return;

      // maintain LOS to locked block (with grace)
      const cam = camRef.current!;
      const origin = new THREE.Vector3().copy(cam.position);
      const dir = new THREE.Vector3(); cam.getWorldDirection(dir).normalize();
      const { hit } = voxelRaycast(origin, dir, INTERACT_DIST);
      if (hit && keyOf(hit) === miningLockRef.current.key) {
        miningLockRef.current.lastSeen = performance.now();
      } else if (performance.now() - miningLockRef.current.lastSeen > LOS_GRACE_MS) {
        miningLockRef.current = null;
        setMining(null);
        return;
      }

      // advance progress
      setMining((m) => {
        if (!m) return m;
        const currentId = (blocksRef.current as any)[m.key] as BlockId | undefined;
        if (!currentId || currentId !== m.id) return null;

        const speed = 1.0; // tool multiplier hook
        const prog = Math.min(1, m.progress + (dt * speed) / m.total);
        if (prog >= 1) {
          // break it
          placeAtNowAndBroadcast(m.pos, "EMPTY");
          // keep holding state; just drop the lock so next frame re-acquires the next block
          miningLockRef.current = null;
          return null; // clear current mining UI/progress
        }
        return { ...m, progress: prog };
      });
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [locked, menuOpen, placeAtNowAndBroadcast, isAirborneNow]);

  function CameraGrab({ target }: { target: React.MutableRefObject<THREE.PerspectiveCamera | null> }) {
    const { camera } = useThree();
    React.useEffect(() => { target.current = camera as THREE.PerspectiveCamera; }, [camera]);
    return null;
  }

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        height: isFs ? "100dvh" : 600,
        width: "100%",
        borderRadius: isFs ? 0 : 12,
        overflow: "hidden",
        border: isFs ? "none" : "1px solid #e5e7eb",
        overscrollBehavior: "contain",
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Hotbar */}
      <div style={hotbarWrap(menuOpen)}>
        {BLOCKS.map((b) => (
          <button
            key={b.id}
            onClick={() => setSelected(b.id)}
            title={`${b.label}${b.key ? ` (Key ${b.key})` : ""}`}
            style={{
              ...hotBtn,
              outline: selected === b.id ? "3px solid #2563eb" : "1px solid #e5e7eb",
              background: b.color,
            }}
          >
            {b.label}{b.key && <span style={badge}>{b.key}</span>}
          </button>
        ))}
      </div>

      {/* WS status */}
      <div style={wsPill}>{wsReady ? "Online" : "Offline"}</div>

      {/* 3D */}
      <Canvas
        shadows
        camera={{ position: [WORLD_SIZE * 0.8, WORLD_SIZE * 0.6, WORLD_SIZE * 0.8], fov: 50 }}
        onPointerDownCapture={(e: any) => {
          if (!locked && !menuOpen) { setMustFs(true); startPlay(); e.stopPropagation(); return; }
          if (e.button === 2) handleRightClickPlace(); // right = place
          if (e.button === 0) leftDownRef.current = true; // left = start/continue mining
        }}
        onPointerUpCapture={(e: any) => {
          if (e.button === 0) { leftDownRef.current = false; miningLockRef.current = null; setMining(null); }
        }}
      >
        <Sky sunPosition={[100, 20, 100]} />
        <ambientLight intensity={0.5} />
        <directionalLight castShadow position={[20, 25, 10]} intensity={0.8} shadow-mapSize-width={2048} shadow-mapSize-height={2048} />

        <PointerLockControls
          ref={plcRef}
          onLock={() => { setLocked(true); setMenuOpen(false); }}
          onUnlock={() => { setLocked(false); setMenuOpen(true); leftDownRef.current = false; miningLockRef.current = null; setMining(null); }}
        />

        <CameraGrab target={camRef} />

        {/* world */}
        <GroundPlane size={WORLD_SIZE} onPlace={() => {}} />
        {blockEntries.map(({ id, pos }) => (
          <Voxel key={keyOf(pos)} id={id} pos={pos} onPlaceAdjacent={() => {}} onRemove={() => {}} />
        ))}

        {/* remote players (filter out self defensively) */}
        <RemotePlayers players={Object.fromEntries(Object.entries(others).filter(([id]) => id !== clientId))} />

        <Player ref={playerRef} active={locked} solid={solid} worldSize={WORLD_SIZE} />
        <Environment preset="city" />
      </Canvas>

      {/* HUD */}
      <div style={hudHint}>
        <span>
          {locked
            ? "Online · Wheel change block · 1–7 · Hold Left mine (chains) · Right place · Shift run · Ctrl crouch · Under-self: press Space once per block · ZQSD/WASD · ESC menu"
            : "Click to start (fullscreen + mouse-look)"}
        </span>
      </div>

      {/* Mining progress ring */}
      {locked && mining && (
        <div style={mineRing(mining.progress)}>
          <div style={mineRingInner} />
          <div style={mineText}>
            {mining.progress < 1
              ? `${Math.max(0, (mining.total * (1 - mining.progress))).toFixed(1)}s`
              : "0.0s"}
          </div>
        </div>
      )}

      {/* Crosshair */}
      {locked && <div style={crosshair} />}

      {/* Start overlay */}
      {!locked && !menuOpen && (
        <button onClick={async () => { setMustFs(true); await startPlay(); }} style={startOverlay}>
          Click to start (fullscreen + mouse-look)
        </button>
      )}

      {/* Pause menu */}
      {menuOpen && (
        <div style={menuOverlay} onMouseDown={(e) => e.stopPropagation()}>
          <div style={menuPanel}>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>Paused</div>
            <button style={menuBtn} onClick={async () => {
              if (mustFs && !isFs) { try { await requestFullscreen(); } catch {} }
              setMenuOpen(false); plcRef.current?.lock?.();
            }}>Resume (lock mouse)</button>
            <button style={menuBtn} onClick={onSave}>Save</button>
            <button style={menuBtn} onClick={onLoad}>Load</button>
            <button style={menuBtn} onClick={onExport}>Export</button>
            <button style={menuBtn} onClick={() => importInputRef.current?.click()}>Import…</button>
            <input
              ref={importInputRef} type="file" accept="application/json" style={{ display: "none" }}
              onChange={(e) => { const f = e.currentTarget.files?.[0]; if (f) (async () => { await onImport(f); })(); e.currentTarget.value = ""; }}
            />
            <button style={{ ...menuBtn, borderColor: "#dc2626" }} onClick={onClear}>Clear world</button>
            <button style={menuBtn} onClick={async () => { setMustFs(false); await exitFullscreen(); }}>
              Exit Fullscreen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- UI styles ---------- */
const hotbarWrap = (menuOpen: boolean): React.CSSProperties => ({
  position: "absolute", left: 12, top: 12, display: "flex", gap: 8, flexWrap: "wrap",
  pointerEvents: menuOpen ? "none" : "auto", zIndex: 20,
});
const hotBtn: React.CSSProperties = {
  padding: "8px 12px", borderRadius: 8, border: "1px solid #e5e7eb",
  fontSize: 14, fontWeight: 700, cursor: "pointer", minWidth: 90, textAlign: "center" as const,
};
const badge: React.CSSProperties = {
  marginLeft: 8, padding: "2px 6px", borderRadius: 999, border: "1px solid #e5e7eb", background: "#fff", fontSize: 12,
};
const wsPill: React.CSSProperties = {
  position: "absolute", right: 12, top: 12, padding: "4px 8px", borderRadius: 999,
  background: "rgba(17,24,39,0.8)", color: "#fff", fontSize: 12, zIndex: 25,
};
const hudHint: React.CSSProperties = {
  position: "absolute", bottom: 10, left: 12, right: 12, display: "flex",
  justifyContent: "space-between", fontSize: 12, color: "#111827", opacity: 0.8, pointerEvents: "none",
};
const crosshair: React.CSSProperties = {
  position: "absolute", left: "50%", top: "50%", width: 12, height: 12,
  transform: "translate(-50%, -50%)", pointerEvents: "none", opacity: 0.7,
  background:
    "linear-gradient(#111827,#111827) left center/2px 12px no-repeat, \
     linear-gradient(#111827,#111827) center top/12px 2px no-repeat, \
     linear-gradient(#111827,#111827) right center/2px 12px no-repeat, \
     linear-gradient(#111827,#111827) center bottom/12px 2px no-repeat",
};

/* Circular mining progress UI */
const mineRing = (p: number): React.CSSProperties => {
  const deg = Math.floor(p * 359.9); // never reach 360 to avoid wrap
  return {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: 48,
    height: 48,
    transform: "translate(-50%, -50%)",
    borderRadius: "50%",
    background: `conic-gradient(#10b981 ${deg}deg, rgba(255,255,255,0.12) 0deg)`,
    border: "2px solid rgba(255,255,255,0.7)",
    zIndex: 16,
    pointerEvents: "none",
  };
};

const mineRingInner: React.CSSProperties = {
  position: "absolute",
  inset: 4,
  borderRadius: "50%",
  background: "rgba(17,24,39,0.5)",
};
const mineText: React.CSSProperties = {
  position: "absolute",
  width: "100%",
  bottom: -22,
  textAlign: "center",
  fontSize: 12,
  fontWeight: 800,
  color: "#111827",
  opacity: 0.85,
};

const startOverlay: React.CSSProperties = {
  position: "absolute", inset: 0, display: "grid", placeItems: "center",
  background: "rgba(17,24,39,0.35)", color: "#fff", fontWeight: 800, fontSize: 16,
  border: "none", cursor: "pointer", zIndex: 10,
};
const menuOverlay: React.CSSProperties = {
  position: "absolute", inset: 0, background: "rgba(17,24,39,0.6)", display: "grid", placeItems: "center", zIndex: 30,
};
const menuPanel: React.CSSProperties = {
  background: "#111827", color: "#fff", padding: 16, borderRadius: 12, minWidth: 280,
  boxShadow: "0 10px 30px rgba(0,0,0,0.4)", display: "grid", gap: 8,
};
const menuBtn: React.CSSProperties = {
  padding: "10px 12px", borderRadius: 8, border: "1px solid #374151",
  background: "#1f2937", color: "#fff", cursor: "pointer", textAlign: "left", fontSize: 14,
};
