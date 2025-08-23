// app/doom/page.tsx
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";

type Vec2 = { x: number; y: number };

const DPR_MAX = 2;
const FOV = Math.PI / 3;  // ~60°
const WALK_SPEED = 3.0;   // m/s
const SPRINT_SPEED = 5.2; // m/s
const ROT_SPEED = 2.4;    // rad/s
const PLAYER_RADIUS = 0.18;

type Enemy = { id: string; x: number; y: number; hp: number, hurtUntil: number };

// Map codes: 0 empty, 1 wall, 2 door (closed). Doors tracked in openDoors set.
const MAP_W = 16;
const MAP_H = 16;
const MAP: number[] = [
  1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
  1,0,0,0,0,0,0,0,0,1,0,0,0,0,0,1,
  1,0,1,0,1,1,1,0,2,1,0,1,1,1,0,1,
  1,0,1,0,0,0,1,0,0,1,0,1,0,1,0,1,
  1,0,1,1,1,0,1,0,1,1,0,1,0,1,0,1,
  1,0,0,0,1,0,0,0,0,0,0,1,0,0,0,1,
  1,0,1,0,1,1,1,1,1,1,0,1,1,1,0,1,
  1,0,1,0,0,0,0,0,0,1,0,0,0,1,0,1,
  1,0,1,1,1,1,1,1,0,1,1,1,0,1,0,1,
  1,0,0,0,0,0,0,1,0,0,0,1,2,1,0,1,
  1,0,1,1,1,1,0,1,1,1,0,1,0,1,0,1,
  1,0,1,0,0,0,0,0,0,1,0,1,0,1,0,1,
  1,0,1,0,1,1,1,1,0,1,0,1,0,1,0,1,
  1,0,0,0,0,0,0,1,0,0,0,1,0,0,0,1,
  1,0,0,0,0,0,0,0,0,1,0,0,0,0,0,1,
  1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
];

// ---------- helpers
const cellKey = (x: number, y: number) => `${x}|${y}`;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);

// ---------- wall/door queries
function inBounds(x: number, y: number) {
  return x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;
}
function mapAt(x: number, y: number) {
  if (!inBounds(x, y)) return 1;
  return MAP[y * MAP_W + x];
}

export default function DoomLikePage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const reqRef = useRef<number>(0);

  const [pointerLocked, setPointerLocked] = useState(false);

  // player
  const posRef = useRef<Vec2>({ x: 1.5, y: 1.5 });
  const angRef = useRef<number>(0);

  // input
  const keysRef = useRef<Record<string, boolean>>({});
  const mouseDeltaRef = useRef<number>(0);

  // doors: if key present → OPEN, otherwise uses MAP value (2 means closed)
  const openDoorsRef = useRef<Set<string>>(new Set());

  // enemies
  const enemiesRef = useRef<Enemy[]>([
    { id: "e1", x: 6.5, y: 2.5, hp: 3, hurtUntil: 0 },
    { id: "e2", x: 11.5, y: 10.5, hp: 3, hurtUntil: 0 },
    { id: "e3", x: 3.5, y: 10.5, hp: 3, hurtUntil: 0 },
  ]);

  // fx
  const flashUntilRef = useRef<number>(0);

  // z-buffer per column (filled by ray pass, used for sprite occlusion)
  const zbufRef = useRef<number[]>([]);

  // ---------- canvas
  const setupCanvas = useCallback(() => {
    const cnv = canvasRef.current;
    if (!cnv) return;
    const dpr = Math.max(1, Math.min(DPR_MAX, window.devicePixelRatio || 1));
    const widthCSS = Math.min(1024, window.innerWidth - 32);
    const heightCSS = Math.min(640, window.innerHeight - 160);
    cnv.style.width = widthCSS + "px";
    cnv.style.height = heightCSS + "px";
    cnv.width = Math.floor(widthCSS * dpr);
    cnv.height = Math.floor(heightCSS * dpr);
    const ctx = cnv.getContext("2d");
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }, []);

  // ---------- collisions
  function isSolidCell(cx: number, cy: number) {
    const t = mapAt(cx, cy);
    if (t === 1) return true;
    if (t === 2 && !openDoorsRef.current.has(cellKey(cx, cy))) return true; // closed door solid
    return false;
  }

  function hitsWall(x: number, y: number, r: number) {
    const minX = Math.floor(x - r);
    const maxX = Math.floor(x + r);
    const minY = Math.floor(y - r);
    const maxY = Math.floor(y + r);
    for (let gy = minY; gy <= maxY; gy++) {
      for (let gx = minX; gx <= maxX; gx++) {
        if (isSolidCell(gx, gy)) {
          const nearestX = Math.max(gx, Math.min(x, gx + 1));
          const nearestY = Math.max(gy, Math.min(y, gy + 1));
          const dx = x - nearestX;
          const dy = y - nearestY;
          if (dx * dx + dy * dy < r * r) return true;
        }
      }
    }
    return false;
  }

  function tryMove(px: number, py: number) {
    const r = PLAYER_RADIUS;
    let nx = posRef.current.x;
    let ny = posRef.current.y;
    if (!hitsWall(px, posRef.current.y, r)) nx = px;
    if (!hitsWall(nx, py, r)) ny = py;
    posRef.current.x = nx;
    posRef.current.y = ny;
  }

  // ---------- ray casting per column; returns perpendicular dist and 'side' for shading
  function castRayPerp(x: number, w: number, h: number) {
    const camX = (2 * x) / w - 1;
    const rayAng = angRef.current + Math.atan(camX * Math.tan(FOV / 2) * 2);
    const dirX = Math.cos(rayAng);
    const dirY = Math.sin(rayAng);

    let mapX = Math.floor(posRef.current.x);
    let mapY = Math.floor(posRef.current.y);

    const deltaDistX = Math.abs(1 / (dirX || 1e-6));
    const deltaDistY = Math.abs(1 / (dirY || 1e-6));

    let stepX = 0, stepY = 0;
    let sideDistX = 0, sideDistY = 0;

    if (dirX < 0) { stepX = -1; sideDistX = (posRef.current.x - mapX) * deltaDistX; }
    else { stepX = 1; sideDistX = (mapX + 1.0 - posRef.current.x) * deltaDistX; }
    if (dirY < 0) { stepY = -1; sideDistY = (posRef.current.y - mapY) * deltaDistY; }
    else { stepY = 1; sideDistY = (mapY + 1.0 - posRef.current.y) * deltaDistY; }

    let hit = 0, side = 0;
    let hitX = mapX, hitY = mapY;

    for (let i = 0; i < 80; i++) {
      if (sideDistX < sideDistY) { sideDistX += deltaDistX; mapX += stepX; side = 0; }
      else { sideDistY += deltaDistY; mapY += stepY; side = 1; }
      if (isSolidCell(mapX, mapY)) { hit = 1; hitX = mapX; hitY = mapY; break; }
    }

    if (!hit) return { dist: 1000, side: 0, cellX: hitX, cellY: hitY };

    let perp: number;
    if (side === 0) perp = (mapX - posRef.current.x + (1 - stepX) / 2) / (dirX || 1e-6);
    else perp = (mapY - posRef.current.y + (1 - stepY) / 2) / (dirY || 1e-6);

    const lineH = Math.min(h, Math.max(2, Math.floor(h / (perp || 1e-6))));
    return { dist: perp, side, lineH, cellX: hitX, cellY: hitY };
  }

  // ---------- door toggle (front cell within reach)
  function interactDoor() {
    const reach = 1.5;
    const tx = posRef.current.x + Math.cos(angRef.current) * reach;
    const ty = posRef.current.y + Math.sin(angRef.current) * reach;
    const cx = Math.floor(tx), cy = Math.floor(ty);
    if (!inBounds(cx, cy)) return;
    if (mapAt(cx, cy) !== 2) return;
    const k = cellKey(cx, cy);
    if (openDoorsRef.current.has(k)) openDoorsRef.current.delete(k);
    else openDoorsRef.current.add(k);
  }

  // ---------- shooting (hitscan): left click
  function shoot() {
    const now = performance.now();
    flashUntilRef.current = now + 80;

    // center ray
    const centerRay = castRayPerp(Math.floor((canvasRef.current?.clientWidth || 1) / 2), canvasRef.current?.clientWidth || 1, canvasRef.current?.clientHeight || 1);
    const wallDist = centerRay?.dist ?? 9999;

    // find first visible enemy roughly on the crosshair
    const ax = Math.cos(angRef.current), ay = Math.sin(angRef.current);
    let best: { e: Enemy; dist: number } | null = null;
    for (const e of enemiesRef.current) {
      if (e.hp <= 0) continue;
      const dx = e.x - posRef.current.x;
      const dy = e.y - posRef.current.y;
      const dist = Math.hypot(dx, dy);
      // angle difference
      const dot = (dx / dist) * ax + (dy / dist) * ay; // cos(theta)
      const theta = Math.acos(clamp(dot, -1, 1));
      if (theta > (FOV * 0.12)) continue; // ~ narrow cone
      if (dist >= wallDist - 0.05) continue; // behind wall hit
      if (!best || dist < best.dist) best = { e, dist };
    }
    if (best) {
      best.e.hp -= 1;
      best.e.hurtUntil = now + 150;
    }
  }

  // ---------- draw
  const draw = useCallback(() => {
    const cnv = canvasRef.current;
    if (!cnv) return;
    const ctx = cnv.getContext("2d");
    if (!ctx) return;

    const w = cnv.clientWidth;
    const h = cnv.clientHeight;

    // background
    ctx.fillStyle = "#0b1022"; ctx.fillRect(0, 0, w, h / 2);
    ctx.fillStyle = "#1e293b"; ctx.fillRect(0, h / 2, w, h / 2);

    // walls pass + zbuffer
    const z = (zbufRef.current = zbufRef.current.length === w ? zbufRef.current : new Array(w).fill(9999));
    for (let x = 0; x < w; x++) {
      const ray = castRayPerp(x, w, h);
      if (!ray) continue;
      z[x] = ray.dist;

      // shade by distance and side
      const shade = Math.max(0.15, Math.min(1, 1 - ray.dist / 12));
      const sideMul = ray.side === 1 ? 0.85 : 1.0;
      const luma = Math.floor(220 * shade * sideMul);

      // door tint
      const isDoorHit = mapAt(ray.cellX, ray.cellY) === 2 && !openDoorsRef.current.has(cellKey(ray.cellX, ray.cellY));
      ctx.fillStyle = isDoorHit ? `rgb(${luma}, ${Math.floor(luma*0.7)}, ${Math.floor(luma*0.3)})` // brownish doors
                                : `rgb(${luma}, ${Math.floor(luma*0.9)}, ${Math.floor(luma*0.75)})`;

      const y0 = Math.floor(h / 2 - (ray.lineH || 2) / 2);
      ctx.fillRect(x, y0, 1, ray.lineH || 2);
    }

    // enemies (sprites): paint far→near so alpha/hurt overlay looks ok
    const dirX = Math.cos(angRef.current), dirY = Math.sin(angRef.current);
    const tanHalf = Math.tan(FOV / 2);
    const now = performance.now();

    const alive = enemiesRef.current.filter(e => e.hp > 0).sort((a,b) => {
      const da = (a.x - posRef.current.x) ** 2 + (a.y - posRef.current.y) ** 2;
      const db = (b.x - posRef.current.x) ** 2 + (b.y - posRef.current.y) ** 2;
      return db - da; // far to near
    });

    for (const e of alive) {
      const dx = e.x - posRef.current.x;
      const dy = e.y - posRef.current.y;

      // camera-space
      const zc = dx * dirX + dy * dirY;               // forward
      const xc = -dx * dirY + dy * dirX;              // right
      if (zc <= 0.05) continue;                       // behind player

      const sx = Math.floor((w / 2) * (1 + (xc / zc) / tanHalf)); // screen x center
      const size = Math.floor(clamp(h / zc, 6, h));                // sprite size (square)
      const x0 = Math.floor(sx - size / 2), x1 = Math.floor(sx + size / 2);
      const y0 = Math.floor(h / 2 - size / 2);

      // occlusion vs zbuffer (cheap): only draw columns where sprite is closer
      for (let x = x0; x <= x1; x++) {
        if (x < 0 || x >= w) continue;
        if (zc < (z[x] || 9999)) {
          // base color
          ctx.fillStyle = "#b91c1c"; // red
          ctx.fillRect(x, y0, 1, size);

          // hurt overlay
          if (now < e.hurtUntil) {
            ctx.fillStyle = "rgba(255,255,255,0.65)";
            ctx.fillRect(x, y0, 1, size);
          }
        }
      }
    }

    // muzzle flash
    if (performance.now() < flashUntilRef.current) {
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.fillRect(w/2 - 10, h/2 - 10, 20, 20);
    }

    // UI
    ctx.fillStyle = "#e2e8f0"; ctx.font = "12px ui-sans-serif, system-ui";
    const hpAlive = enemiesRef.current.filter(e => e.hp > 0).length;
    ctx.fillText(`Enemies: ${hpAlive}  |  Pos: ${posRef.current.x.toFixed(2)}, ${posRef.current.y.toFixed(2)}`, 10, 18);
    ctx.fillStyle = "#94a3b8";
    ctx.fillText(pointerLocked ? "ESC to release mouse • E = door • Click = shoot • Shift = sprint" : "Click canvas to capture mouse", 10, h - 12);
  }, [pointerLocked]);

  // ---------- main loop
  const lastTsRef = useRef<number>(0);
  const loop = useCallback((ts: number) => {
    const last = lastTsRef.current || ts;
    const dt = Math.min(0.05, (ts - last) / 1000);
    lastTsRef.current = ts;

    // rotation (arrows or Q/E)
    if (keysRef.current["ArrowLeft"] || keysRef.current["KeyQ"] || keysRef.current["q"]) {
      angRef.current -= ROT_SPEED * dt;
    }
    if (keysRef.current["ArrowRight"] || keysRef.current["KeyE"] || keysRef.current["e"]) {
      angRef.current += ROT_SPEED * dt;
    }
    // mouse look
    if (pointerLocked) {
      angRef.current += mouseDeltaRef.current * 0.0025;
      mouseDeltaRef.current = 0;
    }

    // movement (ZQSD/WASD or arrows). Shift = sprint
    const forward =
      (keysRef.current["KeyW"] || keysRef.current["w"] || keysRef.current["z"] || keysRef.current["ArrowUp"]) ? 1 :
      (keysRef.current["KeyS"] || keysRef.current["s"] || keysRef.current["ArrowDown"]) ? -1 : 0;

    const strafe =
      (keysRef.current["KeyD"] || keysRef.current["d"]) ? 1 :
      (keysRef.current["KeyA"] || keysRef.current["a"] || keysRef.current["q"]) ? -1 : 0;

    const speed = (keysRef.current["ShiftLeft"] || keysRef.current["ShiftRight"]) ? SPRINT_SPEED : WALK_SPEED;

    let dx = 0, dy = 0;
    if (forward !== 0) {
      dx += Math.cos(angRef.current) * speed * dt * forward;
      dy += Math.sin(angRef.current) * speed * dt * forward;
    }
    if (strafe !== 0) {
      dx += Math.cos(angRef.current + Math.PI / 2) * speed * dt * strafe;
      dy += Math.sin(angRef.current + Math.PI / 2) * speed * dt * strafe;
    }
    if (dx || dy) tryMove(posRef.current.x + dx, posRef.current.y + dy);

    draw();
    reqRef.current = requestAnimationFrame(loop);
  }, [draw, pointerLocked]);

  // ---------- effects & handlers
  useEffect(() => {
    // keys by code + by key; prevent arrow/space scroll; handle 'E' edge for door
    let ePressedPrev = false;
    const onKey = (ev: KeyboardEvent) => {
      const down = ev.type === "keydown";
      keysRef.current[ev.code] = down;
      keysRef.current[(ev.key || "").toLowerCase()] = down;
      if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(ev.key)) ev.preventDefault();

      // door interact on rising edge of 'E' or 'e'
      const eNow = !!(keysRef.current["KeyE"] || keysRef.current["e"]);
      if (eNow && !ePressedPrev) interactDoor();
      ePressedPrev = eNow;
    };
    window.addEventListener("keydown", onKey as any, { passive: false } as any);
    window.addEventListener("keyup", onKey as any, { passive: false } as any);

    const onResize = () => setupCanvas();
    window.addEventListener("resize", onResize);

    const cnv = canvasRef.current!;
    const onClick = (e: MouseEvent) => {
      // left click: shoot (and also capture mouse if not locked yet)
      if (document.pointerLockElement !== cnv) {
        cnv.requestPointerLock();
      } else if (e.button === 0) {
        shoot();
      }
    };
    cnv.addEventListener("mousedown", onClick);
    cnv.addEventListener("contextmenu", (ev) => ev.preventDefault());

    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement === cnv) mouseDeltaRef.current += e.movementX;
    };
    window.addEventListener("mousemove", onMouseMove);

    const onPLC = () => setPointerLocked(document.pointerLockElement === cnv);
    document.addEventListener("pointerlockchange", onPLC);

    setupCanvas();
    reqRef.current = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener("keydown", onKey as any);
      window.removeEventListener("keyup", onKey as any);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("pointerlockchange", onPLC);
      cnv.removeEventListener("mousedown", onClick);
      if (reqRef.current) cancelAnimationFrame(reqRef.current);
    };
  }, [loop, setupCanvas]);

  // ---------- UI
  return (
    <main style={{ display: "grid", gridTemplateRows: "auto 1fr", height: "100vh" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: 12,
          borderBottom: "1px solid #e5e7eb",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <Link href="/" style={{ textDecoration: "none", fontSize: 13 }}>← Home</Link>
        <strong style={{ fontSize: 14 }}>Doom-like (ray casting) — doors, sprint, enemies, shooting</strong>
        <span style={{ fontSize: 12, color: "#64748b" }}>
          Click to capture • Move: ZQSD/WASD • Turn: Q/E or ←/→ • Sprint: Shift • Door: E • Shoot: Left-click • ESC to release
        </span>
      </header>

      <section style={{ display: "grid", placeItems: "center", padding: 16 }}>
        <canvas
          ref={canvasRef}
          style={{ border: "1px solid #e5e7eb", borderRadius: 12, background: "#0b1022", maxWidth: "100%" }}
        />
      </section>
    </main>
  );
}
