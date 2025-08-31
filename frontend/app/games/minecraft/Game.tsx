"use client";

import * as React from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Sky, Environment, PointerLockControls } from "@react-three/drei";
import * as THREE from "three";

import type { BlockId, Vec3 } from "./lib/types";
import { BLOCKS } from "./lib/blocks";
import { WORLD_SIZE, keyOf, parseKey, seedWorld, loadWorld, saveWorld } from "./lib/world";
import Player, { PlayerAPI } from "./components/Player";
import Voxel from "./components/Voxel";
import GroundPlane from "./components/GroundPlane";
import { PLAYER_RADIUS } from "./lib/collision";

const Y_MIN = 0;
const Y_MAX = 64;
const INTERACT_DIST = 6.5;

export default function Game() {
  const [selected, setSelected] = React.useState<BlockId>("GRASS");
  const [blocks, setBlocks] = React.useState<Record<string, BlockId>>(
    () => (typeof window === "undefined" ? seedWorld() : loadWorld() ?? seedWorld())
  );

  // For movement collisions (state-based is fine here)
  const solid = React.useMemo(() => {
    const s = new Set<string>();
    for (const [k, id] of Object.entries(blocks)) if (id !== "EMPTY" && id !== "WATER") s.add(k);
    return s;
  }, [blocks]);

  // Live world for instant build checks
  const blocksRef = React.useRef(blocks);
  React.useEffect(() => { blocksRef.current = blocks; }, [blocks]);

  // ---------- Fullscreen ----------
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [isFs, setIsFs] = React.useState(false);
  const [mustFs, setMustFs] = React.useState(true);

  const requestFullscreen = React.useCallback(async () => {
    const el = containerRef.current as any;
    if (!el) return;
    const req = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen || el.mozRequestFullScreen;
    if (req) await req.call(el);
  }, []);
  const exitFullscreen = React.useCallback(async () => {
    const doc: any = document;
    const exit = doc.exitFullscreen || doc.webkitExitFullscreen || doc.msExitFullscreen || doc.mozCancelFullScreen;
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

  // ---------- Pointer lock & menu ----------
  const plcRef = React.useRef<any>(null);
  const playerRef = React.useRef<PlayerAPI>(null);
  const [locked, setLocked] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const importInputRef = React.useRef<HTMLInputElement | null>(null);

  // Track recent Space press (to tolerate frame timing when you jump & click fast)
  const lastJumpPress = React.useRef(0);
  const recentlyJumped = React.useCallback(() => performance.now() - lastJumpPress.current < 160, []);
  React.useEffect(() => {
    const onDown = (e: KeyboardEvent) => { if (e.code === "Space") lastJumpPress.current = performance.now(); };
    window.addEventListener("keydown", onDown);
    return () => window.removeEventListener("keydown", onDown);
  }, []);

  // Digit hotkeys + save + ESC toggle
  React.useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      if (e.code.startsWith("Digit")) {
        const n = Number(e.code.replace("Digit", ""));
        if (n >= 1 && n <= BLOCKS.length) { e.preventDefault(); setSelected(BLOCKS[n - 1].id); }
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault(); saveWorld(blocks); alert("World saved locally."); return;
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
  }, [blocks, menuOpen, isFs, mustFs, requestFullscreen]);

  // Mouse wheel cycles selected block
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

  const onUnlock = React.useCallback(() => { setLocked(false); setMenuOpen(true); }, []);

  // ---------- World helpers ----------
  const blockEntries = React.useMemo(
    () => Object.entries(blocks).map(([k, id]) => ({ id, pos: parseKey(k) as Vec3 })),
    [blocks]
  );

  // Sync write (state + live ref)
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

  // Start play (first click) => fullscreen + lock
  const startPlay = React.useCallback(async () => {
    try { setMustFs(true); if (!isFs) await requestFullscreen(); } catch {}
    setMenuOpen(false); plcRef.current?.lock?.();
  }, [isFs, requestFullscreen]);

  // ===== Live world queries =====
  const isFilled = React.useCallback((x: number, y: number, z: number) => {
    if (x < 0 || x >= WORLD_SIZE || z < 0 || z >= WORLD_SIZE || y < Y_MIN || y > Y_MAX) return true;
    const v = (blocksRef.current as any)[`${x},${y},${z}`];
    return !!(v && v !== "EMPTY" && v !== "WATER");
  }, []);

  // Robust “airborne” test:
  // - If there is a block below, treat you as airborne only when your feet are > top+epsilon.
  // - If no block below, you're airborne.
  const isAirborneNow = React.useCallback(() => {
    const feet = playerRef.current?.getFeet();
    if (!feet) return false;
    const bx = Math.floor(feet.x);
    const by = Math.floor(feet.y - 0.001);
    const bz = Math.floor(feet.z);
    if (isFilled(bx, by, bz)) {
      const top = by + 1;
      return feet.y > top + 0.02; // 2 cm clearance
    }
    return true;
  }, [isFilled]);

  function voxelRaycast(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number) {
    // DDA using live world
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
      if (tMaxX < tMaxY && tMaxX < tMaxZ) { pos.x += stepX; t = tMaxX; tMaxX += invX;
        if (t > maxDist) break; if (isFilled(pos.x, pos.y, pos.z)) return { hit: [pos.x, pos.y, pos.z] as Vec3, face: [-stepX, 0, 0] as Vec3 }; }
      else if (tMaxY < tMaxZ) { pos.y += stepY; t = tMaxY; tMaxY += invY;
        if (t > maxDist) break; if (isFilled(pos.x, pos.y, pos.z)) return { hit: [pos.x, pos.y, pos.z] as Vec3, face: [0, -stepY, 0] as Vec3 }; }
      else { pos.z += stepZ; t = tMaxZ; tMaxZ += invZ;
        if (t > maxDist) break; if (isFilled(pos.x, pos.y, pos.z)) return { hit: [pos.x, pos.y, pos.z] as Vec3, face: [0, 0, -stepZ] as Vec3 }; }
    }
    return { hit: null as Vec3 | null, face: null as Vec3 | null };
  }

  const camRef = React.useRef<THREE.PerspectiveCamera | null>(null);
  const handleBuildClick = React.useCallback((button: number, shift: boolean) => {
    if (!locked || menuOpen || !camRef.current) return;

    const cam = camRef.current!;
    const origin = new THREE.Vector3().copy(cam.position);
    const dir = new THREE.Vector3(); cam.getWorldDirection(dir).normalize();

    const { hit, face } = voxelRaycast(origin, dir, INTERACT_DIST);
    if (!hit || !face) return;

    // Remove: right-click or Shift
    if (button === 2 || shift) { placeAtNow(hit, "EMPTY"); return; }

    // March outward along face normal until first empty cell
    let tx = hit[0] + face[0], ty = hit[1] + face[1], tz = hit[2] + face[2];
    for (let i = 0; i < 32 && isFilled(tx, ty, tz); i++) { tx += face[0]; ty += face[1]; tz += face[2]; }
    const target: Vec3 = [tx, ty, tz];

    // If target sits under player horizontally, require airborne OR a very recent Space tap
    const feet = playerRef.current?.getFeet();
    if (feet) {
      const cx = target[0] + 0.5, cz = target[2] + 0.5;
      const dx = Math.abs(feet.x - cx), dz = Math.abs(feet.z - cz);
      const inside = dx <= 0.5 + PLAYER_RADIUS && dz <= 0.5 + PLAYER_RADIUS;
      if (inside && !(isAirborneNow() || recentlyJumped())) {
        return; // still on ground: don't allow placing under yourself
      }
    }

    // Place the block
    placeAtNow(target, selected);

    // If we placed under player while airborne, nudge them up so it feels smooth
    if (feet) {
      const cx = target[0] + 0.5, cz = target[2] + 0.5;
      const dx = Math.abs(feet.x - cx), dz = Math.abs(feet.z - cz);
      const inside = dx <= 0.5 + PLAYER_RADIUS && dz <= 0.5 + PLAYER_RADIUS;
      const topY = target[1] + 1.0;
      if (inside && feet.y < topY + 0.001) {
        const need = (topY + 0.02) - feet.y; // slightly larger epsilon
        if (need > 0) playerRef.current?.nudgeUp(need, true);
      }
    }
  }, [locked, menuOpen, selected, isFilled, isAirborneNow, recentlyJumped]);

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

      {/* 3D */}
      <Canvas
        shadows
        camera={{ position: [WORLD_SIZE * 0.8, WORLD_SIZE * 0.6, WORLD_SIZE * 0.8], fov: 50 }}
        onPointerDownCapture={(e: any) => {
          if (!locked && !menuOpen) { setMustFs(true); startPlay(); e.stopPropagation(); return; }
          const btn = e.button ?? 0; const shift = !!e.shiftKey;
          handleBuildClick(btn, shift);
        }}
      >
        <Sky sunPosition={[100, 20, 100]} />
        <ambientLight intensity={0.5} />
        <directionalLight castShadow position={[20, 25, 10]} intensity={0.8} shadow-mapSize-width={2048} shadow-mapSize-height={2048} />

        <PointerLockControls
          ref={plcRef}
          onLock={() => { setLocked(true); setMenuOpen(false); }}
          onUnlock={() => { setLocked(false); setMenuOpen(true); }}
        />

        <CameraGrab target={camRef} />

        {/* render world (clicks handled via crosshair) */}
        <GroundPlane size={WORLD_SIZE} onPlace={() => {}} disabled />
        {Object.entries(blocks).map(([k, id]) => {
          const pos = parseKey(k) as Vec3;
          return <Voxel key={k} id={id} pos={pos} onPlaceAdjacent={() => {}} onRemove={() => {}} disabled />;
        })}

        <Player ref={playerRef} active={locked} solid={solid} worldSize={WORLD_SIZE} />
        <Environment preset="city" />
      </Canvas>

      {/* HUD */}
      <div style={hudHint}>
        <span>
          {locked
            ? "Wheel change block · 1–7 digits select · Left place · Right/Shift remove · ZQSD/WASD · Space jump (must jump to place under you) · ESC toggles menu"
            : "Click to start (fullscreen + mouse-look)"}
        </span>
      </div>

      {/* Crosshair */}
      {locked && <div style={crosshair} />}

      {/* Start overlay */}
      {!locked && !menuOpen && (
        <button onClick={async () => { setMustFs(true); await startPlay(); }} style={startOverlay}>
          Click to start (fullscreen + mouse-look)
        </button>
      )}

      {/* Pause menu (only place to exit fullscreen) */}
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

/* UI styles */
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
