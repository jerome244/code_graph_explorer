"use client";

import * as React from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Sky, Environment, PointerLockControls } from "@react-three/drei";
import * as THREE from "three";

import type { BlockId, Vec3 } from "./lib/types";
import { BLOCKS } from "./lib/blocks";
import { WORLD_SIZE, keyOf, parseKey, seedWorld, loadWorld, saveWorld } from "./lib/world";
import Player from "./components/Player";
import Voxel from "./components/Voxel";
import GroundPlane from "./components/GroundPlane";

const Y_MIN = 0;
const Y_MAX = 64;
const INTERACT_DIST = 6.5;

export default function Game() {
  const [selected, setSelected] = React.useState<BlockId>("GRASS");
  const [blocks, setBlocks] = React.useState<Record<string, BlockId>>(
    () => (typeof window === "undefined" ? seedWorld() : loadWorld() ?? seedWorld())
  );

  // Solid set (everything except WATER/EMPTY)
  const solid = React.useMemo(() => {
    const s = new Set<string>();
    for (const [k, id] of Object.entries(blocks)) if (id !== "EMPTY" && id !== "WATER") s.add(k);
    return s;
  }, [blocks]);

  // ---------- Fullscreen (only exit via menu) ----------
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

  // Keyboard Lock API to keep Esc from breaking FS (Chromium)
  const enableKbLock = React.useCallback(async () => {
    try { await (navigator as any).keyboard?.lock?.(["Escape"]); } catch {}
  }, []);
  const disableKbLock = React.useCallback(() => {
    try { (navigator as any).keyboard?.unlock?.(); } catch {}
  }, []);

  React.useEffect(() => {
    const onChange = () => {
      const fsEl =
        (document as any).fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement;
      const now = !!fsEl;
      setIsFs(now);
      if (now) enableKbLock(); else disableKbLock();
      // If FS was lost (e.g., Esc on some browsers) we won’t auto-reenter here;
      // we’ll re-enter on Resume. Only the menu’s Exit Fullscreen sets mustFs=false.
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
  }, [enableKbLock, disableKbLock]);

  // ---------- Pointer lock & menu ----------
  const plcRef = React.useRef<any>(null);
  const [locked, setLocked] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const importInputRef = React.useRef<HTMLInputElement | null>(null);

  // ESC toggles: in game -> open menu; in menu -> resume
  React.useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      const found = BLOCKS.find((b) => b.key === e.key);
      if (found) setSelected(found.id);

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveWorld(blocks);
        alert("World saved locally.");
        return;
      }

      if (e.key === "Escape" || e.code === "KeyP") {
        e.preventDefault(); // try to keep FS
        if (menuOpen) {
          // RESUME (re-enter FS if required, then lock)
          if (mustFs && !isFs) { try { await requestFullscreen(); } catch {} }
          setMenuOpen(false);
          plcRef.current?.lock?.();
        } else {
          // OPEN MENU
          setMenuOpen(true);
          plcRef.current?.unlock?.();
        }
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true } as any);
  }, [blocks, menuOpen, isFs, mustFs, requestFullscreen]);

  const onUnlock = React.useCallback(() => {
    setLocked(false);
    setMenuOpen(true);
  }, []);

  // ---------- World helpers ----------
  const blockEntries = React.useMemo(
    () => Object.entries(blocks).map(([k, id]) => ({ id, pos: parseKey(k) as Vec3 })),
    [blocks]
  );

  function placeAt(pos: Vec3, id: BlockId) {
    const [x, y, z] = pos;
    if (x < 0 || x >= WORLD_SIZE || z < 0 || z >= WORLD_SIZE || y < Y_MIN || y > Y_MAX) return;
    const k = keyOf(pos);
    setBlocks((m) => {
      if (id === "EMPTY") { if (!m[k]) return m; const copy = { ...m }; delete copy[k]; return copy; }
      if (m[k] === id) return m;
      return { ...m, [k]: id };
    });
  }

  const onSave = () => { saveWorld(blocks); alert("World saved in your browser."); };
  const onLoad = () => { const m = loadWorld(); if (!m) return alert("No saved world found."); setBlocks(m); };
  const onClear = () => { if (!confirm("Clear the world? This won't remove your saved copy.")) return; setBlocks({}); };
  const onExport = () => {
    const blob = new Blob([JSON.stringify(blocks)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = "minecraft-world-3d.json"; a.click(); URL.revokeObjectURL(url);
  };
  const onImport = async (f: File) => {
    try { const text = await f.text(); const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== "object") throw new Error(); setBlocks(parsed);
    } catch { alert("Invalid world file."); }
  };

  // First click => fullscreen + lock
  const startPlay = React.useCallback(async () => {
    try { setMustFs(true); if (!isFs) await requestFullscreen(); } catch {}
    setMenuOpen(false);
    plcRef.current?.lock?.();
  }, [isFs, requestFullscreen]);

  // ===== Raycast (DDA) to edit while playing =====
  const isSolidCell = React.useCallback((x: number, y: number, z: number) => {
    if (x < 0 || x >= WORLD_SIZE || z < 0 || z >= WORLD_SIZE) return true;
    if (y < Y_MIN - 1 || y > Y_MAX + 1) return true;
    return solid.has(`${x},${y},${z}`);
  }, [solid]);

  function voxelRaycast(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number) {
    const pos = new THREE.Vector3(Math.floor(origin.x), Math.floor(origin.y), Math.floor(origin.z));
    const stepX = dir.x > 0 ? 1 : -1;
    const stepY = dir.y > 0 ? 1 : -1;
    const stepZ = dir.z > 0 ? 1 : -1;
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
        if (t > maxDist) break; if (isSolidCell(pos.x, pos.y, pos.z)) return { hit: [pos.x, pos.y, pos.z] as Vec3, face: [-stepX, 0, 0] as Vec3 }; }
      else if (tMaxY < tMaxZ) { pos.y += stepY; t = tMaxY; tMaxY += invY;
        if (t > maxDist) break; if (isSolidCell(pos.x, pos.y, pos.z)) return { hit: [pos.x, pos.y, pos.z] as Vec3, face: [0, -stepY, 0] as Vec3 }; }
      else { pos.z += stepZ; t = tMaxZ; tMaxZ += invZ;
        if (t > maxDist) break; if (isSolidCell(pos.x, pos.y, pos.z)) return { hit: [pos.x, pos.y, pos.z] as Vec3, face: [0, 0, -stepZ] as Vec3 }; }
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
    if (!hit) return;
    if (button === 2 || shift) {
      placeAt(hit, "EMPTY");
    } else {
      const adj: Vec3 = [hit[0] + (face![0] as number), hit[1] + (face![1] as number), hit[2] + (face![2] as number)];
      placeAt(adj, selected);
    }
  }, [locked, menuOpen, selected]);

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
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Hotbar — always visible */}
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
            {b.label}
            {b.key && <span style={badge}>{b.key}</span>}
          </button>
        ))}
      </div>

      {/* 3D */}
      <Canvas
        shadows
        camera={{ position: [WORLD_SIZE * 0.8, WORLD_SIZE * 0.6, WORLD_SIZE * 0.8], fov: 50 }}
        onPointerDownCapture={(e: any) => {
          if (!locked && !menuOpen) { startPlay(); e.stopPropagation(); return; }
          const btn = e.button ?? 0;
          const shift = !!e.shiftKey;
          handleBuildClick(btn, shift);
        }}
      >
        <Sky sunPosition={[100, 20, 100]} />
        <ambientLight intensity={0.5} />
        <directionalLight
          castShadow
          position={[20, 25, 10]}
          intensity={0.8}
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
        />

        <PointerLockControls
          ref={plcRef}
          onLock={() => { setLocked(true); setMenuOpen(false); }}
          onUnlock={onUnlock}
        />

        {/* capture camera ref */}
        <CameraGrab target={camRef} />

        {/* Display-only geometry; editing via raycast */}
        <GroundPlane size={WORLD_SIZE} onPlace={() => {}} disabled />
        {blockEntries.map(({ id, pos }) => (
          <Voxel key={keyOf(pos)} id={id} pos={pos} onPlaceAdjacent={() => {}} onRemove={() => {}} disabled />
        ))}

        <Player active={locked} solid={solid} worldSize={WORLD_SIZE} />
        <Environment preset="city" />
      </Canvas>

      {/* HUD */}
      <div style={hudHint}>
        <span>
          {locked
            ? "Left place · Right/Shift remove · ZQSD/WASD move · Space jump · ESC/P menu (Esc toggles)"
            : "Click to start (fullscreen + mouse-look)"}
        </span>
      </div>

      {/* Crosshair */}
      {locked && <div style={crosshair} />}

      {/* Start overlay */}
      {!locked && !menuOpen && (
        <button onClick={startPlay} style={startOverlay}>
          Click to start (fullscreen + mouse-look)
        </button>
      )}

      {/* Pause menu: the ONLY place to exit fullscreen */}
      {menuOpen && (
        <div style={menuOverlay} onMouseDown={(e) => e.stopPropagation()}>
          <div style={menuPanel}>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>Paused</div>
            <button
              style={menuBtn}
              onClick={async () => {
                if (mustFs && !isFs) { try { await requestFullscreen(); } catch {} }
                setMenuOpen(false);
                plcRef.current?.lock?.();
              }}
            >
              Resume (lock mouse)
            </button>
            <button style={menuBtn} onClick={onSave}>Save</button>
            <button style={menuBtn} onClick={onLoad}>Load</button>
            <button style={menuBtn} onClick={onExport}>Export</button>
            <button style={menuBtn} onClick={() => importInputRef.current?.click()}>Import…</button>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.currentTarget.files?.[0];
                if (f) onImport(f);
                e.currentTarget.value = "";
              }}
            />
            <button style={{ ...menuBtn, borderColor: "#dc2626" }} onClick={onClear}>Clear world</button>
            <button
              style={menuBtn}
              onClick={async () => {
                setMustFs(false); // allow leaving FS
                disableKbLock();
                await exitFullscreen(); // the only way out
              }}
            >
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
  position: "absolute",
  left: 12,
  top: 12,
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  pointerEvents: menuOpen ? "none" : "auto",
  zIndex: 20,
});
const hotBtn: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #e5e7eb",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
  minWidth: 90,
  textAlign: "center" as const,
};
const badge: React.CSSProperties = {
  marginLeft: 8,
  padding: "2px 6px",
  borderRadius: 999,
  border: "1px solid #e5e7eb",
  background: "#fff",
  fontSize: 12,
};
const hudHint: React.CSSProperties = {
  position: "absolute",
  bottom: 10,
  left: 12,
  right: 12,
  display: "flex",
  justifyContent: "space-between",
  fontSize: 12,
  color: "#111827",
  opacity: 0.8,
  pointerEvents: "none",
};
const crosshair: React.CSSProperties = {
  position: "absolute",
  left: "50%",
  top: "50%",
  width: 12,
  height: 12,
  transform: "translate(-50%, -50%)",
  pointerEvents: "none",
  opacity: 0.7,
  background:
    "linear-gradient(#111827,#111827) left center/2px 12px no-repeat, linear-gradient(#111827,#111827) center top/12px 2px no-repeat, linear-gradient(#111827,#111827) right center/2px 12px no-repeat, linear-gradient(#111827,#111827) center bottom/12px 2px no-repeat",
};
const startOverlay: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "grid",
  placeItems: "center",
  background: "rgba(17,24,39,0.35)",
  color: "#fff",
  fontWeight: 800,
  fontSize: 16,
  border: "none",
  cursor: "pointer",
  zIndex: 10,
};
const menuOverlay: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  background: "rgba(17,24,39,0.6)",
  display: "grid",
  placeItems: "center",
  zIndex: 30,
};
const menuPanel: React.CSSProperties = {
  background: "#111827",
  color: "#fff",
  padding: 16,
  borderRadius: 12,
  minWidth: 280,
  boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
  display: "grid",
  gap: 8,
};
const menuBtn: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid #374151",
  background: "#1f2937",
  color: "#fff",
  cursor: "pointer",
  textAlign: "left",
  fontSize: 14,
};
