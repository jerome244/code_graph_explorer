// app/kart/page.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

/**
 * Tiny Mario-Kart-like, top-down:
 * - ZQSD/WASD or Arrow keys to drive
 * - Shift = drift (release = mini boost)
 * - 3 AI karts
 * - Lap counting (3 laps), checkpoints
 * - Minimap, HUD
 *
 * No assets; everything is procedural on a Canvas2D.
 */

type Vec2 = { x: number; y: number };
type Kart = {
  x: number; y: number; a: number; // position + heading (rad)
  v: number;                        // forward speed
  steer: number;                    // steering input [-1..1]
  throttle: number;                 // throttle input [0..1]
  brake: number;                    // brake input [0..1]
  drift: boolean;                   // drift (Shift)
  driftTime: number;                // ms drift held
  color: string;
  name: string;
  ai?: { t: number };               // if present => AI progress (0..1 around track)
  lap: number;
  checkpoint: number;
  bestLap: number;                  // ms
  lapStart: number;                 // ms timestamp
};

const DPR_MAX = 2;

// ---- Track ----
const ROAD_W      = 80;   // road width (px)
const RUMBLE_W    = 14;   // rumble outside stroke
const WAYPOINTS: Vec2[] = [
  // Rough stadium loop (clockwise)
  { x: 200, y: 240 }, { x: 380, y: 160 }, { x: 640, y: 140 }, { x: 900, y: 160 },
  { x: 1080, y: 260 }, { x: 1120, y: 420 }, { x: 1020, y: 560 }, { x: 840, y: 640 },
  { x: 600, y: 670 }, { x: 360, y: 640 }, { x: 220, y: 520 }, { x: 180, y: 380 },
];

// make it closed
WAYPOINTS.push(WAYPOINTS[0]);

// checkpoints every few points
const CHECK_EVERY = 2; // must cross each in order to advance lap

// physics constants
const ENGINE_FORCE     = 600;   // px/s^2
const BRAKE_FORCE      = 900;   // px/s^2
const ROLL_RESIST      = 1.4;   // drag-ish
const TURN_RATE        = 2.8;   // rad/s at full steer
const DRIFT_GRIP_SCALE = 0.55;  // lateral grip in drift
const DRIFT_MIN_SPEED  = 120;   // px/s to allow drift
const DRIFT_BOOST_TIME = 250;   // ms threshold to get a boost
const DRIFT_BOOST_PWR  = 240;   // px/s added when releasing a long drift
const OFFROAD_PENALTY  = 0.45;  // multiply engine when off road
const MAX_LAPS         = 3;

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function clamp(v: number, a: number, b: number) { return Math.max(a, Math.min(b, v)); }
function length(x: number, y: number) { return Math.hypot(x, y); }
function dot(ax: number, ay: number, bx: number, by: number) { return ax * bx + ay * by; }
function angleLerp(a: number, b: number, t: number) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  return a + d * t;
}

// distance from point P to segment AB
function distToSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const abx = bx - ax, aby = by - ay;
  const apx = px - ax, apy = py - ay;
  const abLen2 = abx * abx + aby * aby || 1;
  const t = clamp((apx * abx + apy * aby) / abLen2, 0, 1);
  const cx = ax + abx * t, cy = ay + aby * t;
  return { d: Math.hypot(px - cx, py - cy), t, cx, cy };
}

// Find closest distance to road center polyline
function roadDistance(p: Vec2) {
  let best = { d: Infinity, seg: 0, cx: 0, cy: 0, t: 0 };
  for (let i = 0; i < WAYPOINTS.length - 1; i++) {
    const a = WAYPOINTS[i], b = WAYPOINTS[i + 1];
    const r = distToSeg(p.x, p.y, a.x, a.y, b.x, b.y);
    if (r.d < best.d) best = { d: r.d, seg: i, cx: r.cx, cy: r.cy, t: r.t };
  }
  return best;
}

// Project a progress value t∈[0,1] along track to world position
function sampleTrack(progress: number) {
  // convert to segment + local t
  const loops = WAYPOINTS.length - 1;
  const u = progress * loops;
  const i = Math.floor(u);
  const f = u - i;
  const a = WAYPOINTS[i % loops];
  const b = WAYPOINTS[(i + 1) % loops];
  return { x: lerp(a.x, b.x, f), y: lerp(a.y, b.y, f), i, f };
}

export default function KartPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const reqRef = useRef<number>(0);
  const [dpr, setDpr] = useState(1);

  // Input (use .code so AZERTY ZQSD maps to KeyW/KeyA/KeyS/KeyD)
  const keys = useRef<Record<string, boolean>>({});

  // Karts (player + bots)
  const karts = useRef<Kart[]>([]);
  const [raceOver, setRaceOver] = useState(false);

  // Camera
  const cam = useRef({ x: 300, y: 300, a: 0 });

  const startRace = useCallback(() => {
    const now = performance.now();

    const player: Kart = {
      x: WAYPOINTS[0].x + 0, y: WAYPOINTS[0].y + 20, a: Math.atan2(WAYPOINTS[1].y - WAYPOINTS[0].y, WAYPOINTS[1].x - WAYPOINTS[0].x),
      v: 0, steer: 0, throttle: 0, brake: 0, drift: false, driftTime: 0,
      color: "#2563eb", name: "YOU", lap: 0, checkpoint: 0, bestLap: Infinity, lapStart: now,
    };

    const bots: Kart[] = [
      { x: WAYPOINTS[0].x - 16, y: WAYPOINTS[0].y - 18, a: player.a, v: 0, steer: 0, throttle: 0, brake: 0, drift: false, driftTime: 0, color: "#ef4444", name: "BOT 1", ai: { t: 0 }, lap: 0, checkpoint: 0, bestLap: Infinity, lapStart: now },
      { x: WAYPOINTS[0].x + 18, y: WAYPOINTS[0].y - 22, a: player.a, v: 0, steer: 0, throttle: 0, brake: 0, drift: false, driftTime: 0, color: "#10b981", name: "BOT 2", ai: { t: 0 }, lap: 0, checkpoint: 0, bestLap: Infinity, lapStart: now },
      { x: WAYPOINTS[0].x - 38, y: WAYPOINTS[0].y + 8,  a: player.a, v: 0, steer: 0, throttle: 0, brake: 0, drift: false, driftTime: 0, color: "#eab308", name: "BOT 3", ai: { t: 0 }, lap: 0, checkpoint: 0, bestLap: Infinity, lapStart: now },
    ];

    karts.current = [player, ...bots];
    setRaceOver(false);
  }, []);

  // ---- Physics & control
  function stepKart(k: Kart, dt: number, isPlayer: boolean) {
    // Inputs
    if (isPlayer) {
      const accel = (keys.current["KeyW"] || keys.current["ArrowUp"] || keys.current["z"]) ? 1 :
                    (keys.current["KeyS"] || keys.current["ArrowDown"] || keys.current["s"]) ? -1 : 0;
      const steer = (keys.current["KeyD"] || keys.current["ArrowRight"] || keys.current["d"]) ? 1 :
                    (keys.current["KeyA"] || keys.current["ArrowLeft"]  || keys.current["q"]) ? -1 : 0;
      const drifting = !!(keys.current["ShiftLeft"] || keys.current["ShiftRight"]);

      k.throttle = accel > 0 ? accel : 0;
      k.brake = accel < 0 ? -accel : 0;
      // Smooth steering for nicer feel
      k.steer = lerp(k.steer, steer, 0.2);
      // Drift only if fast enough and actually steering
      if (drifting && Math.abs(k.steer) > 0.2 && k.v > DRIFT_MIN_SPEED) {
        k.drift = true;
        k.driftTime += dt * 1000;
      } else {
        if (k.drift && k.driftTime >= DRIFT_BOOST_TIME) {
          // tiny boost on release
          k.v += DRIFT_BOOST_PWR;
        }
        k.drift = false;
        k.driftTime = 0;
      }
    } else {
      // ---- Simple AI: follow centerline with slight lookahead & throttle control
      if (k.ai) {
        const look = 0.015; // progress lookahead
        const p = sampleTrack((k.ai.t + look) % 1);
        const dx = p.x - k.x, dy = p.y - k.y;
        const targetA = Math.atan2(dy, dx);
        k.a = angleLerp(k.a, targetA, 0.06);
        const targetV = 300; // px/s cruising
        k.throttle = k.v < targetV ? 1 : 0;
        k.brake = k.v > targetV * 1.2 ? 1 : 0;
        k.steer = 0; // handled by a directly (arcade AI)
        // progress along track based on proximity
        const near = roadDistance(k);
        const segLen = length(WAYPOINTS[near.seg + 1].x - WAYPOINTS[near.seg].x, WAYPOINTS[near.seg + 1].y - WAYPOINTS[near.seg].y);
        const absProgress = (near.seg + near.t) / (WAYPOINTS.length - 1);
        k.ai.t = (absProgress + 0.001 * dt * (0.5 + Math.random())) % 1;
      }
    }

    // Grip multiplier if off-road
    const rd = roadDistance(k);
    const onRoad = rd.d <= (ROAD_W * 0.5 + RUMBLE_W);
    const engineMul = onRoad ? 1 : OFFROAD_PENALTY;
    const gripMul   = k.drift ? DRIFT_GRIP_SCALE : 1;

    // Longitudinal
    let acc = k.throttle * ENGINE_FORCE * engineMul - k.brake * BRAKE_FORCE - ROLL_RESIST * k.v;
    k.v += acc * dt;
    k.v = clamp(k.v, -200, 800); // reverse clamp & max speed

    // Heading / turning
    const turn = TURN_RATE * k.steer * (0.6 + 0.4 * Math.min(1, Math.abs(k.v) / 350));
    k.a += turn * dt * gripMul;

    // Integrate position in heading direction
    const dirx = Math.cos(k.a), diry = Math.sin(k.a);
    k.x += dirx * k.v * dt;
    k.y += diry * k.v * dt;

    // Very soft wall bounce if out of world bounds
    const pad = 40;
    k.x = clamp(k.x, -pad, 1400 + pad);
    k.y = clamp(k.y, -pad, 900 + pad);
  }

  // ---- Laps / checkpoints
  function updateProgress(k: Kart, dt: number, now: number) {
    // compute which checkpoint segment the kart is nearest to
    const cpIndex = Math.floor(roadDistance(k).seg / CHECK_EVERY);
    if (cpIndex === k.checkpoint) return; // still on same region

    const expected = (k.checkpoint + 1) % Math.floor((WAYPOINTS.length - 1) / CHECK_EVERY);
    if (cpIndex === expected) {
      k.checkpoint = cpIndex;
      if (cpIndex === 0) {
        // crossed start line in order
        if (k.lap > 0) {
          const lapTime = now - k.lapStart;
          k.bestLap = Math.min(k.bestLap, lapTime);
        }
        k.lapStart = now;
        k.lap += 1;
      }
    }
  }

  // ---- Draw helpers
  function drawTrack(ctx: CanvasRenderingContext2D) {
    // Grass
    ctx.fillStyle = "#14532d";
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    // Rumble (outer)
    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap  = "round";
    ctx.lineWidth = ROAD_W + RUMBLE_W * 2;
    ctx.strokeStyle = "#b91c1c";
    ctx.beginPath();
    ctx.moveTo(WAYPOINTS[0].x, WAYPOINTS[0].y);
    for (let i = 1; i < WAYPOINTS.length; i++) ctx.lineTo(WAYPOINTS[i].x, WAYPOINTS[i].y);
    ctx.stroke();

    // Road
    ctx.lineWidth = ROAD_W;
    ctx.strokeStyle = "#1f2937";
    ctx.stroke();
    ctx.restore();

    // Center dashes
    ctx.save();
    ctx.setLineDash([16, 22]);
    ctx.lineDashOffset = 0;
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#9ca3af";
    ctx.beginPath();
    ctx.moveTo(WAYPOINTS[0].x, WAYPOINTS[0].y);
    for (let i = 1; i < WAYPOINTS.length; i++) ctx.lineTo(WAYPOINTS[i].x, WAYPOINTS[i].y);
    ctx.stroke();
    ctx.restore();

    // Start line
    const s0 = WAYPOINTS[0], s1 = WAYPOINTS[1];
    const nx = s1.y - s0.y, ny = -(s1.x - s0.x);
    const nlen = Math.hypot(nx, ny) || 1;
    const ux = (nx / nlen) * (ROAD_W * 0.5);
    const uy = (ny / nlen) * (ROAD_W * 0.5);
    ctx.fillStyle = "#e5e7eb";
    ctx.fillRect(s0.x - ux - 2, s0.y - uy - 2, 4 + ux * 2, 4 + uy * 2);

    // Small checkpoint flags
    ctx.fillStyle = "#fde047";
    for (let i = CHECK_EVERY; i < WAYPOINTS.length - 1; i += CHECK_EVERY) {
      const p = WAYPOINTS[i];
      ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawKart(ctx: CanvasRenderingContext2D, k: Kart, isPlayer: boolean) {
    ctx.save();
    ctx.translate(k.x, k.y);
    ctx.rotate(k.a);

    // shadow
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.ellipse(0, 0, 17, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // body
    ctx.fillStyle = k.color;
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 2;
    roundedRect(ctx, -16, -10, 32, 20, 6); ctx.fill(); ctx.stroke();

    // driver dome
    ctx.fillStyle = isPlayer ? "#60a5fa" : "#fca5a5";
    ctx.beginPath(); ctx.arc(2, -4, 6, 0, Math.PI * 2); ctx.fill();

    // wheels
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(-16, -12, 8, 4);
    ctx.fillRect(  8, -12, 8, 4);
    ctx.fillRect(-16,  8, 8, 4);
    ctx.fillRect(  8,  8, 8, 4);

    // drift sparks
    if (k.drift) {
      ctx.fillStyle = "rgba(253,224,71,0.8)";
      for (let i = 0; i < 3; i++) ctx.fillRect(-18 + Math.random() * 6, 10 + Math.random() * 3, 3, 3);
    }

    ctx.restore();
  }

  function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ---- Main loop
  const lastRef = useRef(0);
  const loop = useCallback((ts: number) => {
    if (!canvasRef.current) return;
    const cnv = canvasRef.current;
    const ctx = cnv.getContext("2d");
    if (!ctx) return;

    const last = lastRef.current || ts;
    const dt = Math.min(0.05, (ts - last) / 1000);
    lastRef.current = ts;
    const now = performance.now();

    // Step physics
    karts.current.forEach((k, i) => stepKart(k, dt, i === 0));

    // Progress & laps
    karts.current.forEach((k) => updateProgress(k, dt, now));

    // Finish?
    if (!raceOver && karts.current[0].lap >= MAX_LAPS) {
      setRaceOver(true);
    }

    // Camera follows the player with smoothing
    const you = karts.current[0];
    cam.current.x = lerp(cam.current.x, you.x, 0.12);
    cam.current.y = lerp(cam.current.y, you.y, 0.12);
    cam.current.a = angleLerp(cam.current.a, you.a, 0.08);

    // Render world with camera transform
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cnv.width, cnv.height);

    const w = cnv.width / dpr, h = cnv.height / dpr;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-cam.current.a);
    ctx.translate(-cam.current.x, -cam.current.y);

    drawTrack(ctx);
    // Draw karts (player last so it stays on top)
    for (let i = 1; i < karts.current.length; i++) drawKart(ctx, karts.current[i], false);
    drawKart(ctx, you, true);

    ctx.restore();

    // HUD
    drawHUD(ctx, w, h);

    reqRef.current = requestAnimationFrame(loop);
  }, [dpr, raceOver]);

  function drawHUD(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const you = karts.current[0];
    // Speed
    ctx.save();
    ctx.fillStyle = "#0f172a";
    ctx.globalAlpha = 0.7;
    ctx.fillRect(12, h - 64, 180, 52);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#e5e7eb";
    ctx.font = "bold 18px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText(`Speed: ${(you.v * 0.03).toFixed(0)} km/h`, 20, h - 32);
    ctx.fillText(`Lap: ${Math.min(you.lap + 1, MAX_LAPS)}/${MAX_LAPS}`, 20, h - 12);

    // Race banner
    if (raceOver) {
      ctx.textAlign = "center";
      ctx.font = "bold 28px system-ui, sans-serif";
      ctx.fillStyle = "#22c55e";
      ctx.fillText("🏁 Finished!", w / 2, 40);
      ctx.textAlign = "left";
    }
    ctx.restore();

    // Minimap (top-right)
    const mmW = 180, mmH = 120, mmX = w - mmW - 12, mmY = 12;
    ctx.save();
    ctx.fillStyle = "rgba(15,23,42,0.75)";
    ctx.fillRect(mmX, mmY, mmW, mmH);
    ctx.beginPath();
    for (let i = 0; i < WAYPOINTS.length; i++) {
      const p = WAYPOINTS[i];
      const nx = mmX + (p.x / 1200) * (mmW - 16) + 8;
      const ny = mmY + (p.y / 800)  * (mmH - 16) + 8;
      if (i === 0) ctx.moveTo(nx, ny); else ctx.lineTo(nx, ny);
    }
    ctx.strokeStyle = "#9ca3af";
    ctx.stroke();

    // karts
    for (const k of karts.current) {
      const px = mmX + (k.x / 1200) * (mmW - 16) + 8;
      const py = mmY + (k.y / 800)  * (mmH - 16) + 8;
      ctx.fillStyle = k === you ? "#60a5fa" : "#f87171";
      ctx.fillRect(px - 2, py - 2, 4, 4);
    }
    ctx.restore();
  }

  // ---- mount
  useEffect(() => {
    startRace();
  }, [startRace]);

  useEffect(() => {
    const cnv = canvasRef.current!;
    const onResize = () => {
      const d = Math.min(DPR_MAX, window.devicePixelRatio || 1);
      setDpr(d);
      cnv.width = Math.floor(window.innerWidth * d);
      cnv.height = Math.floor((window.innerHeight - 120) * d);
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    // keyboard (use .code so AZERTY works)
    const onKey = (e: KeyboardEvent) => {
      const down = e.type === "keydown";
      keys.current[e.code] = down;
      if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(e.key)) e.preventDefault();
      // Restart on R when finished
      if (down && (e.key.toLowerCase() === "r") && raceOver) startRace();
    };
    window.addEventListener("keydown", onKey as any, { passive: false } as any);
    window.addEventListener("keyup", onKey as any, { passive: false } as any);

    reqRef.current = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener("keydown", onKey as any);
      window.removeEventListener("keyup", onKey as any);
      cancelAnimationFrame(reqRef.current);
    };
  }, [loop, raceOver, startRace]);

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
        <strong style={{ fontSize: 14 }}>Mini Kart (top-down)</strong>
        <span style={{ fontSize: 12, color: "#64748b" }}>
          Drive: ZQSD / WASD / Arrows • Drift: Shift (release = boost) • Laps: {MAX_LAPS} • Press R after finish to restart
        </span>
      </header>

      <section style={{ display: "grid", placeItems: "center", padding: 12 }}>
        <canvas
          ref={canvasRef}
          style={{
            width: "100%",
            height: "calc(100vh - 120px)",
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            background: "#0b1022",
            maxWidth: 1200,
          }}
        />
      </section>
    </main>
  );
}
