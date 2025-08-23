// app/brawler/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";

/**
 * Online co-op Brawler (Double-Dragon-like)
 * - Join a room (?room=name), see other players with names
 * - Host election (lowest clientId). Host spawns + simulates enemies and applies authoritative damage.
 * - Players send frequent PLAYER_STATE + attack events; host computes hits and broadcasts ENEMY_STATE / PLAYER_HP.
 * - If host leaves, a new host is elected and waves reset (simple failover).
 *
 * Controls (P1 on each device):
 *   Move: ZQSD / WASD / Arrow keys
 *   Jump: Space
 *   Attack: F or J
 */

type Facing = 1 | -1;

type Actor = {
  id: string;       // players: clientId; enemies: hostId:counter
  kind: "player" | "enemy";
  x: number;
  y: number;
  z: number;        // lane depth (-LANE..+LANE)
  vx: number;
  vy: number;
  w: number;
  h: number;
  facing: Facing;
  hp: number;
  hpMax: number;
  alive: boolean;
  stun: number;
  invuln: number;
  attackTimer: number;
  attackCooldown: number;
  attackPhase?: 0 | 1 | 2;  // players only (combo anim phase)
  name?: string;            // players
  color: string;
  outline: string;
};

type RTMessage =
  | { type: "USER_JOIN"; payload: { name?: string }; clientId?: string; ts?: number }
  | { type: "USER_LEAVE"; payload: {}; clientId?: string; ts?: number }
  | { type: "PING"; clientId?: string; ts?: number }
  | { type: "PONG"; clientId?: string; ts?: number }

  | { type: "PLAYER_STATE"; payload: { x: number; y: number; z: number; vx: number; vy: number; facing: Facing; attackPhase?: 0|1|2; alive: boolean }; clientId?: string; ts?: number }
  | { type: "PLAYER_ATTACK"; payload: { phase: 0|1|2 }; clientId?: string; ts?: number }
  | { type: "PLAYER_HP"; payload: { id: string; hp: number; alive: boolean; invuln?: number; stun?: number }; clientId?: string; ts?: number }

  | { type: "ENEMY_SPAWN"; payload: { id: string; x: number; y: number; z: number; hp: number }; clientId?: string; ts?: number }
  | { type: "ENEMY_STATE"; payload: { id: string; x: number; y: number; z: number; vx: number; vy: number; hp: number; alive: boolean }; clientId?: string; ts?: number }
  | { type: "SNAPSHOT"; payload: { enemies: Array<{ id: string; x: number; y: number; z: number; vx: number; vy: number; hp: number; alive: boolean }>; hostId: string }; clientId?: string; ts?: number }
  | { type: "REQUEST_SNAPSHOT"; payload: { requesterId: string }; clientId?: string; ts?: number };

const WORLD = {
  width: 4000,
  floorY: 300,
  gravity: 1800,
  laneHalf: 36,
  friction: 1200,
  runSpeed: 220,
  jumpVel: 620,
};
const ENEMY = {
  spawnEvery: 5.0,
  speed: 160,
  attackRange: 52,
  damage: 8,
  hp: 30,
};
const PLAYER = {
  hp: 100,
  damageLight: 10,
  damageHeavy: 16,
  hitPush: 260,
};

const WS_BASE =
  process.env.NEXT_PUBLIC_WS_BASE?.replace(/\/$/, "") ||
  (typeof window !== "undefined"
    ? `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}`
    : "");

function clamp(v: number, a: number, b: number) { return Math.max(a, Math.min(b, v)); }
function uuid() { return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => { const r = (Math.random()*16)|0, v = c==="x"?r:(r&0x3)|0x8; return v.toString(16); }); }
function lanesOverlap(a: Actor, b: Actor) { return Math.abs(a.z - b.z) <= 16; }
function aabbOverlap(ax: Actor, bx: Actor) {
  return Math.abs((ax.x + ax.w/2) - (bx.x + bx.w/2)) < (ax.w + bx.w)/2 &&
         Math.abs((ax.y + ax.h/2) - (bx.y + bx.h/2)) < (ax.h + bx.h)/2;
}
function colorForId(id: string) {
  let h = 0; for (let i=0;i<id.length;i++) h=(h*31+id.charCodeAt(i))%360;
  return `hsl(${h},85%,55%)`;
}

export default function BrawlerOnline() {
  const search = useSearchParams();
  const router = useRouter();

  const initialRoom = (search?.get("room") || "brawler-lobby").slice(0, 64);
  const [room, setRoom] = useState(initialRoom);
  const [pendingRoom, setPendingRoom] = useState(initialRoom);
  const [wsStatus, setWsStatus] = useState<"Disconnected"|"Connecting"|"Live">("Disconnected");
  const [shareLink, setShareLink] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("room", room);
      setShareLink(url.toString());
    } catch {}
  }, [room]);

  // canvas
  const canvasRef = useRef<HTMLCanvasElement|null>(null);
  const reqRef = useRef<number>(0);
  const lastTsRef = useRef(0);
  const camXRef = useRef(0);

  // input
  const keysRef = useRef<Record<string, boolean>>({});

  // local identity
  const clientIdRef = useRef(uuid());
  const myNameRef = useRef(`Guest-${clientIdRef.current.slice(0,4)}`);

  // presence
  const presentIdsRef = useRef<Set<string>>(new Set([clientIdRef.current]));
  const [hostId, setHostId] = useState<string>(clientIdRef.current);
  const [role, setRole] = useState<"Host"|"Client">("Host");

  // players/enemies
  const playersRef = useRef<Map<string, Actor>>(new Map());
  const enemiesRef = useRef<Map<string, Actor>>(new Map());
  const spawnTimerRef = useRef(0);
  const enemyCounterRef = useRef(0);

  // local player getter
  const me = () => playersRef.current.get(clientIdRef.current)!;

  // WS
  const wsRef = useRef<WebSocket|null>(null);
  const heartbeatRef = useRef<number|null>(null);
  const lastPongRef = useRef<number>(0);
  const lastStateSentRef = useRef<number>(0);
  const lastCachedStateRef = useRef<{x:number;y:number;z:number;vx:number;vy:number;facing:Facing;alive:boolean}|null>(null);
  const forceStateTimerRef = useRef<number|null>(null);

  // UI list
  const [uiPlayers, setUiPlayers] = useState<Array<{id:string;name:string}>>([{id: clientIdRef.current, name: `${myNameRef.current} (you)`}]);

  // ---------- init/reset local player ----------
  const resetWorld = useCallback(() => {
    playersRef.current.clear();
    enemiesRef.current.clear();
    const P: Actor = {
      id: clientIdRef.current,
      kind: "player",
      x: 120, y: WORLD.floorY - 64, z: 0,
      vx: 0, vy: 0, w: 42, h: 64,
      facing: 1, hp: PLAYER.hp, hpMax: PLAYER.hp, alive: true,
      stun: 0, invuln: 0, attackTimer: 0, attackCooldown: 0, attackPhase: 0,
      name: myNameRef.current,
      color: colorForId(clientIdRef.current),
      outline: "#0f172a",
    };
    playersRef.current.set(P.id, P);
    spawnTimerRef.current = 0;
    camXRef.current = 0;
    enemyCounterRef.current = 0;
  }, []);

  // ---------- canvas ----------
  const setupCanvas = useCallback(() => {
    const cnv = canvasRef.current!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const wCss = Math.min(1100, window.innerWidth - 32);
    const hCss = Math.min(640, window.innerHeight - 160);
    cnv.style.width = `${wCss}px`;
    cnv.style.height = `${hCss}px`;
    cnv.width = Math.floor(wCss * dpr);
    cnv.height = Math.floor(hCss * dpr);
    const ctx = cnv.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }, []);

  function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number, camX: number) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#c7d2fe"); g.addColorStop(1, "#93c5fd");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

    const horizon = 180;
    const bands = [
      { y: horizon, color: "#94a3b8", speed: 0.2, height: 40 },
      { y: horizon + 30, color: "#64748b", speed: 0.4, height: 50 },
    ];
    for (const b of bands) {
      const off = -((camX * b.speed) % 200);
      for (let x = off - 200; x < w + 200; x += 200) {
        ctx.fillStyle = b.color;
        ctx.fillRect(x + 10, b.y - 20, 40, b.height);
        ctx.fillRect(x + 70, b.y - 32, 30, b.height + 12);
        ctx.fillRect(x + 120, b.y - 16, 50, b.height + 8);
      }
    }
    ctx.fillStyle = "#374151"; ctx.fillRect(0, WORLD.floorY, w, 6);
    ctx.fillStyle = "#1f2937"; ctx.fillRect(0, WORLD.floorY + 6, w, h - (WORLD.floorY + 6));
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.setLineDash([6, 10]);
    ctx.beginPath();
    ctx.moveTo(0, WORLD.floorY - WORLD.laneHalf);
    ctx.lineTo(w, WORLD.floorY - WORLD.laneHalf);
    ctx.moveTo(0, WORLD.floorY + WORLD.laneHalf);
    ctx.lineTo(w, WORLD.floorY + WORLD.laneHalf);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawActor(ctx: CanvasRenderingContext2D, a: Actor, camX: number) {
    if (!a.alive && a.hp <= 0) return;
    const screenX = a.x - camX;
    // shadow
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.beginPath(); ctx.ellipse(screenX + a.w/2, WORLD.floorY - 2, 26, 8, 0, 0, Math.PI*2); ctx.fill();

    const fx = screenX, fy = a.y;
    ctx.lineWidth = 2;
    ctx.strokeStyle = a.outline;
    ctx.fillStyle = a.color;
    ctx.fillRect(fx, fy, a.w, a.h);
    ctx.strokeRect(fx, fy, a.w, a.h);

    ctx.fillStyle = "#111827";
    if (a.facing === 1) ctx.fillRect(fx + a.w - 10, fy + 10, 6, 6);
    else ctx.fillRect(fx + 4, fy + 10, 6, 6);

    // hp
    const hpw = Math.max(0, Math.floor((a.hp / a.hpMax) * a.w));
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.fillRect(fx, fy - 8, a.w, 4);
    ctx.fillStyle = a.kind === "player" ? "#22c55e" : "#ef4444";
    ctx.fillRect(fx, fy - 8, hpw, 4);

    if (a.kind === "player" && a.name) {
      ctx.font = "12px ui-sans-serif, system-ui";
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.textAlign = "center";
      ctx.fillText(a.name, fx + a.w/2, fy - 16);
    }
  }

  // ---------- physics ----------
  function integrate(a: Actor, dt: number) {
    a.attackTimer = Math.max(0, a.attackTimer - dt);
    a.attackCooldown = Math.max(0, a.attackCooldown - dt);
    a.stun = Math.max(0, a.stun - dt);
    a.invuln = Math.max(0, a.invuln - dt);

    a.vy += WORLD.gravity * dt;

    if (a.vx > 0) a.vx = Math.max(0, a.vx - WORLD.friction * dt);
    else if (a.vx < 0) a.vx = Math.min(0, a.vx + WORLD.friction * dt);

    a.x += a.vx * dt;
    a.y += a.vy * dt;

    const floor = WORLD.floorY - a.h;
    if (a.y > floor) { a.y = floor; a.vy = 0; }

    a.x = clamp(a.x, 0, WORLD.width - a.w);
    a.z = clamp(a.z, -WORLD.laneHalf, WORLD.laneHalf);
  }

  function playerControl(p: Actor, dt: number, keys: Record<string, boolean>) {
    if (!p.alive) { integrate(p, dt); return; }
    if (p.stun > 0) { integrate(p, dt); return; }

    let left=false,right=false,up=false,down=false,jump=false,attack=false;
    left  = !!(keys["KeyA"] || keys["KeyQ"] || keys["ArrowLeft"]);
    right = !!(keys["KeyD"] || keys["ArrowRight"]);
    up    = !!(keys["KeyW"] || keys["KeyZ"] || keys["ArrowUp"]);
    down  = !!(keys["KeyS"] || keys["ArrowDown"]);
    jump  = !!(keys["Space"]);
    attack= !!(keys["KeyF"] || keys["KeyJ"]);

    if (left && !right) { p.vx = -WORLD.runSpeed; p.facing = -1; }
    else if (right && !left) { p.vx = WORLD.runSpeed; p.facing = 1; }

    if (up && !down) p.z = clamp(p.z - 140 * dt, -WORLD.laneHalf, WORLD.laneHalf);
    else if (down && !up) p.z = clamp(p.z + 140 * dt, -WORLD.laneHalf, WORLD.laneHalf);

    const onGround = Math.abs(p.y - (WORLD.floorY - p.h)) < 1e-3;
    if (jump && onGround) p.vy = -WORLD.jumpVel;

    if (attack) triggerAttack(p, /*broadcast*/true);

    integrate(p, dt);
  }

  function triggerAttack(p: Actor, broadcast: boolean) {
    if (p.attackTimer > 0 || p.attackCooldown > 0 || !p.alive) return;
    p.attackPhase = (((p.attackPhase || 0) + 1) % 3) as 0|1|2;
    p.attackTimer = (p.attackPhase === 2 ? 0.22 : 0.18);
    p.attackCooldown = p.attackTimer + 0.12;

    if (broadcast) sendRT({ type: "PLAYER_ATTACK", payload: { phase: p.attackPhase }, clientId: clientIdRef.current, ts: Date.now() });

    // host will actually apply damage for everyone
  }

  function damage(target: Actor, amount: number, knockToward: Facing, power = PLAYER.hitPush) {
    if (!target.alive || target.invuln > 0) return;
    target.hp -= amount;
    target.stun = 0.18;
    target.invuln = 0.12;
    target.vx = power * (knockToward as number);
    if (target.hp <= 0) {
      target.alive = false;
      target.vx = 140 * (knockToward as number);
      target.vy = -420;
    }
  }

  // ---------- host-only enemy AI & authority ----------
  function hostStepAI(dt: number) {
    // spawn
    spawnTimerRef.current += dt;
    if (spawnTimerRef.current >= ENEMY.spawnEvery) {
      spawnTimerRef.current = 0;
      const cam = camXRef.current;
      const w = canvasRef.current?.clientWidth || 900;
      const side = Math.random() < 0.5 ? -1 : 1;
      const at = clamp(cam + side * (w * 0.8), 40, WORLD.width - 60);
      const count = (Math.random() < 0.5 ? 1 : 2);
      for (let i=0;i<count;i++) hostSpawnEnemy(at + (i*46*side));
    }

    // AI & integrate
    const livePlayers = [...playersRef.current.values()].filter(p => p.alive);
    for (const e of enemiesRef.current.values()) {
      if (!e.alive && e.y <= WORLD.floorY - e.h) {
        // dead, keep falling until ground; then leave as corpse for a bit
      }
      if (e.stun > 0) { integrate(e, dt); continue; }
      // choose nearest player
      if (livePlayers.length) {
        let best = livePlayers[0], bestD = Infinity;
        for (const p of livePlayers) {
          const d = Math.abs(p.x - e.x) + Math.abs(p.z - e.z)*0.5;
          if (d < bestD) { bestD = d; best = p; }
        }
        const dx = best.x - e.x;
        e.facing = (dx >= 0 ? 1 : -1) as Facing;
        const laneDelta = clamp(best.z - e.z, -1, 1) * 120;
        e.z += laneDelta * dt; e.z = clamp(e.z, -WORLD.laneHalf, WORLD.laneHalf);

        if (Math.abs(dx) > ENEMY.attackRange) {
          e.vx = ENEMY.speed * Math.sign(dx);
        } else {
          e.vx = 0;
          if (lanesOverlap(e, best) && Math.abs(dx) < ENEMY.attackRange+6 && best.invuln<=0) {
            damage(best, ENEMY.damage, e.facing, 200);
            // authoritative: tell the specific player (and others) new HP
            sendRT({ type: "PLAYER_HP", payload: { id: best.id, hp: Math.max(0,best.hp), alive: best.alive, invuln: best.invuln, stun: best.stun }, clientId: clientIdRef.current, ts: Date.now() });
          }
        }
      }
      integrate(e, dt);
    }

    // enemy state broadcast (throttled)
    hostMaybeBroadcastEnemies(performance.now());
  }

  function hostSpawnEnemy(x: number) {
    const id = `${hostId}:${enemyCounterRef.current++}`;
    const e: Actor = {
      id, kind: "enemy",
      x, y: WORLD.floorY - 64, z: (Math.random()*2-1)*(WORLD.laneHalf-6),
      vx: 0, vy: 0, w: 40, h: 64, facing: -1,
      hp: ENEMY.hp, hpMax: ENEMY.hp, alive: true,
      stun: 0, invuln: 0, attackTimer: 0, attackCooldown: 0,
      color: "#ef4444", outline: "#111827",
    };
    enemiesRef.current.set(id, e);
    sendRT({ type: "ENEMY_SPAWN", payload: { id, x: e.x, y: e.y, z: e.z, hp: e.hp }, clientId: clientIdRef.current, ts: Date.now() });
  }

  const lastEnemyBroadcastRef = useRef(0);
  function hostMaybeBroadcastEnemies(now: number) {
    if (now - lastEnemyBroadcastRef.current < 120) return; // ~8 Hz
    lastEnemyBroadcastRef.current = now;
    for (const e of enemiesRef.current.values()) {
      sendRT({ type: "ENEMY_STATE", payload: { id: e.id, x: e.x, y: e.y, z: e.z, vx: e.vx, vy: e.vy, hp: e.hp, alive: e.alive }, clientId: clientIdRef.current, ts: Date.now() });
    }
  }

  function hostApplyPlayerAttack(attackerId: string, phase: 0|1|2) {
    const p = playersRef.current.get(attackerId);
    if (!p || !p.alive) return;
    const dmg = phase === 2 ? PLAYER.damageHeavy : PLAYER.damageLight;

    // build attack hitbox
    const hw = p.w*0.6, hh = p.h*0.8;
    const hx = p.facing === 1 ? p.x + p.w*0.4 : p.x - p.w*0.4 - hw;
    const hy = p.y + p.h*0.2;

    for (const e of enemiesRef.current.values()) {
      if (!e.alive) continue;
      if (!lanesOverlap(p, e)) continue;
      const hit =
        Math.abs((hx+hw/2) - (e.x + e.w/2)) < (hw + e.w)/2 &&
        Math.abs((hy+hh/2) - (e.y + e.h/2)) < (hh + e.h)/2;
      if (hit) {
        damage(e, dmg, p.facing);
      }
    }
  }

  // ---------- WS helpers ----------
  const sendRT = useCallback((msg: RTMessage) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== 1) return;
    if ((ws as any).bufferedAmount > 256*1024) return;
    ws.send(JSON.stringify(msg));
  }, []);

  // join/connect
  useEffect(() => {
    if (!WS_BASE) return;
    setWsStatus("Connecting");
    resetWorld();

    // recompute host initially with just me
    presentIdsRef.current = new Set([clientIdRef.current]);
    setHostId(clientIdRef.current);
    setRole("Host");
    setUiPlayers([{ id: clientIdRef.current, name: `${myNameRef.current} (you)` }]);

    const url = `${WS_BASE}/ws/projects/${encodeURIComponent(room)}/`;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsStatus("Live");
        // announce & request snapshot from current host
        sendRT({ type: "USER_JOIN", payload: { name: myNameRef.current }, clientId: clientIdRef.current, ts: Date.now() });
        sendRT({ type: "REQUEST_SNAPSHOT", payload: { requesterId: clientIdRef.current }, clientId: clientIdRef.current, ts: Date.now() });

        // immediate state and keepalive
        forcePlayerStateNow();
        if (forceStateTimerRef.current) clearInterval(forceStateTimerRef.current);
        forceStateTimerRef.current = window.setInterval(() => {
          lastCachedStateRef.current = null;
          lastStateSentRef.current = 0;
          forcePlayerStateNow();
        }, 1000) as unknown as number;

        // heartbeat
        lastPongRef.current = Date.now();
        if (heartbeatRef.current) clearInterval(heartbeatRef.current);
        heartbeatRef.current = window.setInterval(() => {
          if (ws.readyState !== 1) return;
          ws.send(JSON.stringify({ type: "PING", clientId: clientIdRef.current, ts: Date.now() }));
          if (Date.now() - lastPongRef.current > 30000) ws.close();
        }, 10000) as unknown as number;

        const onLeave = () => {
          try { ws.send(JSON.stringify({ type: "USER_LEAVE", payload: {}, clientId: clientIdRef.current, ts: Date.now() })); } catch {}
        };
        window.addEventListener("beforeunload", onLeave, { once: true });
        window.addEventListener("pagehide", onLeave, { once: true });
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data) as RTMessage;
          const origin = (msg as any).clientId;

          if (msg.type === "PONG") { lastPongRef.current = Date.now(); return; }

          // presence/host election
          if (msg.type === "USER_JOIN") {
            const id = origin!;
            presentIdsRef.current.add(id);
            recomputeHost();
            // create remote player entry if needed
            if (!playersRef.current.has(id)) {
              const P: Actor = {
                id, kind: "player",
                x: 160, y: WORLD.floorY - 64, z: 0, vx: 0, vy: 0,
                w: 42, h: 64, facing: 1, hp: PLAYER.hp, hpMax: PLAYER.hp, alive: true,
                stun: 0, invuln: 0, attackTimer: 0, attackCooldown: 0, attackPhase: 0,
                name: msg.payload?.name || `Guest-${id.slice(0,4)}`,
                color: colorForId(id), outline: "#0f172a",
              };
              playersRef.current.set(id, P);
            } else {
              const P = playersRef.current.get(id)!;
              P.name = msg.payload?.name || P.name;
            }
            refreshUIPlayerList();
            return;
          }
          if (msg.type === "USER_LEAVE") {
            const id = origin!;
            presentIdsRef.current.delete(id);
            // keep their corpse visible briefly by not deleting player; optional: mark offline
            recomputeHost(true);
            refreshUIPlayerList();
            return;
          }

          // ignore my own echoes
          if (origin && origin === clientIdRef.current) return;

          // game messages
          switch (msg.type) {
            case "PLAYER_STATE": {
              const id = origin!;
              let P = playersRef.current.get(id);
              if (!P) {
                P = {
                  id, kind: "player",
                  x: msg.payload.x, y: msg.payload.y, z: msg.payload.z,
                  vx: msg.payload.vx, vy: msg.payload.vy,
                  w: 42, h: 64, facing: msg.payload.facing,
                  hp: PLAYER.hp, hpMax: PLAYER.hp, alive: msg.payload.alive,
                  stun: 0, invuln: 0, attackTimer: 0, attackCooldown: 0, attackPhase: msg.payload.attackPhase || 0,
                  name: `Guest-${id.slice(0,4)}`,
                  color: colorForId(id), outline: "#0f172a",
                };
                playersRef.current.set(id, P);
                refreshUIPlayerList();
              } else {
                P.x = msg.payload.x; P.y = msg.payload.y; P.z = msg.payload.z;
                P.vx = msg.payload.vx; P.vy = msg.payload.vy; P.facing = msg.payload.facing;
                P.alive = msg.payload.alive;
                P.attackPhase = msg.payload.attackPhase || P.attackPhase;
              }
              break;
            }

            case "PLAYER_ATTACK": {
              // host applies damage based on current positions
              if (hostId === clientIdRef.current && origin) {
                hostApplyPlayerAttack(origin, msg.payload.phase);
              }
              break;
            }

            case "PLAYER_HP": {
              const t = playersRef.current.get(msg.payload.id);
              if (t) {
                t.hp = msg.payload.hp;
                t.alive = msg.payload.alive;
                if (msg.payload.invuln != null) t.invuln = msg.payload.invuln;
                if (msg.payload.stun != null) t.stun = msg.payload.stun;
              }
              break;
            }

            case "ENEMY_SPAWN": {
              const e = enemiesRef.current.get(msg.payload.id);
              if (!e) {
                enemiesRef.current.set(msg.payload.id, {
                  id: msg.payload.id, kind: "enemy",
                  x: msg.payload.x, y: msg.payload.y, z: msg.payload.z,
                  vx: 0, vy: 0, w: 40, h: 64, facing: -1,
                  hp: msg.payload.hp, hpMax: ENEMY.hp, alive: true,
                  stun: 0, invuln: 0, attackTimer: 0, attackCooldown: 0,
                  color: "#ef4444", outline: "#111827",
                });
              }
              break;
            }

            case "ENEMY_STATE": {
              const e = enemiesRef.current.get(msg.payload.id);
              if (e) {
                e.x = msg.payload.x; e.y = msg.payload.y; e.z = msg.payload.z;
                e.vx = msg.payload.vx; e.vy = msg.payload.vy;
                e.hp = msg.payload.hp; e.alive = msg.payload.alive;
              } else {
                enemiesRef.current.set(msg.payload.id, {
                  id: msg.payload.id, kind: "enemy",
                  x: msg.payload.x, y: msg.payload.y, z: msg.payload.z,
                  vx: msg.payload.vx, vy: msg.payload.vy,
                  w: 40, h: 64, facing: msg.payload.vx >= 0 ? 1 : -1,
                  hp: msg.payload.hp, hpMax: ENEMY.hp, alive: msg.payload.alive,
                  stun: 0, invuln: 0, attackTimer: 0, attackCooldown: 0,
                  color: "#ef4444", outline: "#111827",
                });
              }
              break;
            }

            case "REQUEST_SNAPSHOT": {
              // if I'm host → send current enemies
              if (hostId === clientIdRef.current) {
                const enemies = [...enemiesRef.current.values()].map(e => ({
                  id: e.id, x: e.x, y: e.y, z: e.z, vx: e.vx, vy: e.vy, hp: e.hp, alive: e.alive
                }));
                sendRT({ type: "SNAPSHOT", payload: { enemies, hostId: hostId }, clientId: clientIdRef.current, ts: Date.now() });
              }
              break;
            }

            case "SNAPSHOT": {
              // accept any snapshot (use latest host)
              if (msg.payload && Array.isArray(msg.payload.enemies)) {
                enemiesRef.current.clear();
                for (const e of msg.payload.enemies) {
                  enemiesRef.current.set(e.id, {
                    id: e.id, kind: "enemy",
                    x: e.x, y: e.y, z: e.z, vx: e.vx, vy: e.vy,
                    w: 40, h: 64, facing: e.vx >= 0 ? 1 : -1,
                    hp: e.hp, hpMax: ENEMY.hp, alive: e.alive,
                    stun: 0, invuln: 0, attackTimer: 0, attackCooldown: 0,
                    color: "#ef4444", outline: "#111827",
                  });
                }
                if (msg.payload.hostId) {
                  setHostId(msg.payload.hostId);
                  setRole(msg.payload.hostId === clientIdRef.current ? "Host" : "Client");
                }
              }
              break;
            }

            default: break;
          }
        } catch (err) {
          console.error("WS parse error:", err);
        }
      };

      ws.onclose = () => {
        setWsStatus("Disconnected");
        if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
        if (forceStateTimerRef.current) { clearInterval(forceStateTimerRef.current); forceStateTimerRef.current = null; }
      };

      ws.onerror = () => setWsStatus("Disconnected");
    } catch (err) {
      console.error("WS error:", err);
      setWsStatus("Disconnected");
    }

    return () => {
      try { wsRef.current?.close(); } catch {}
      if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
      if (forceStateTimerRef.current) { clearInterval(forceStateTimerRef.current); forceStateTimerRef.current = null; }
    };
  }, [room, resetWorld, sendRT]);

  function recomputeHost(resetEnemies=false) {
    const ids = [...presentIdsRef.current];
    ids.sort();
    const newHost = ids[0] || clientIdRef.current;
    setHostId(newHost);
    setRole(newHost === clientIdRef.current ? "Host" : "Client");
    if (resetEnemies) {
      // simple failover: when host leaves, clear enemies; new host will start waves
      enemiesRef.current.clear();
      enemyCounterRef.current = 0;
    }
  }

  function refreshUIPlayerList() {
    const arr: Array<{id:string;name:string}> = [];
    for (const p of playersRef.current.values()) {
      const isMe = p.id === clientIdRef.current;
      arr.push({ id: p.id, name: isMe ? `${p.name || ""} (you)` : (p.name || `Guest-${p.id.slice(0,4)}`) });
    }
    arr.sort((a,b) => a.name.localeCompare(b.name));
    setUiPlayers(arr);
  }

  // ---------- player state broadcast ----------
  function forcePlayerStateNow() {
    const p = me();
    sendRT({ type: "PLAYER_STATE", payload: { x: p.x, y: p.y, z: p.z, vx: p.vx, vy: p.vy, facing: p.facing, attackPhase: p.attackPhase, alive: p.alive }, clientId: clientIdRef.current, ts: Date.now() });
  }
  function maybeSendPlayerState(now: number) {
    if (!wsRef.current || wsRef.current.readyState !== 1) return;
    if (now - lastStateSentRef.current < 90) return; // ~11 Hz
    const p = me();
    const next = { x: p.x, y: p.y, z: p.z, vx: p.vx, vy: p.vy, facing: p.facing as Facing, alive: p.alive };
    const prev = lastCachedStateRef.current;
    if (prev && Math.abs(prev.x-next.x)<0.5 && Math.abs(prev.y-next.y)<0.5 && Math.abs(prev.z-next.z)<0.5 && Math.abs(prev.vx-next.vx)<0.5 && Math.abs(prev.vy-next.vy)<0.5 && prev.facing===next.facing && prev.alive===next.alive) {
      return;
    }
    lastCachedStateRef.current = next;
    lastStateSentRef.current = now;
    sendRT({ type: "PLAYER_STATE", payload: next, clientId: clientIdRef.current, ts: Date.now() });
  }

  // ---------- main loop ----------
  const loop = useCallback((ts: number) => {
    const cnv = canvasRef.current; if (!cnv) return;
    const ctx = cnv.getContext("2d")!;
    const w = cnv.clientWidth, h = cnv.clientHeight;
    const last = lastTsRef.current || ts;
    const dt = clamp((ts - last) / 1000, 0, 0.033);
    lastTsRef.current = ts;

    // local control for my player
    playerControl(me(), dt, keysRef.current);

    // host: run AI and authority
    if (hostId === clientIdRef.current) hostStepAI(dt);

    // integrate remote players slightly (gravity/friction), but mostly we trust their positions from messages
    for (const [id, P] of playersRef.current) {
      if (id === clientIdRef.current) continue;
      integrate(P, dt);
    }

    // enemy housekeeping on clients (non-host): just integrate small to smooth between snapshots
    if (hostId !== clientIdRef.current) {
      for (const E of enemiesRef.current.values()) integrate(E, dt);
    }

    // camera follows average of alive players
    const alive = [...playersRef.current.values()].filter(p => p.alive);
    const targetX = alive.length ? (alive.reduce((s, p) => s + p.x, 0) / alive.length) - w / 2 : camXRef.current;
    camXRef.current = clamp(camXRef.current + (targetX - camXRef.current) * 0.07, 0, WORLD.width - w);

    // draw
    drawBackground(ctx, w, h, camXRef.current);
    const drawList: Actor[] = [...playersRef.current.values(), ...enemiesRef.current.values()];
    drawList.sort((a, b) => (a.y + a.h) - (b.y + b.h));
    for (const a of drawList) drawActor(ctx, a, camXRef.current);

    // HUD
    ctx.font = "12px ui-sans-serif, system-ui";
    ctx.fillStyle = "#0f172a";
    const p = me();
    ctx.fillText("HP", 12, 18);
    drawBar(ctx, 34, 10, 140, 8, Math.max(0, Math.min(1, p.hp / p.hpMax)));
    ctx.textAlign = "right";
    ctx.fillText(`Enemies: ${[...enemiesRef.current.values()].filter(e=>e.alive).length}`, w - 12, 18);

    // networking send
    maybeSendPlayerState(ts);

    reqRef.current = requestAnimationFrame(loop);
  }, [hostId]);

  function drawBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, t: number) {
    ctx.fillStyle = "rgba(255,255,255,0.6)"; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "#22c55e"; ctx.fillRect(x, y, Math.floor(w*t), h);
    ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.strokeRect(x, y, w, h);
  }

  // ---------- mount ----------
  useEffect(() => {
    resetWorld();
    setupCanvas();
    lastTsRef.current = performance.now();
    reqRef.current = requestAnimationFrame(loop);

    const onResize = () => setupCanvas();
    window.addEventListener("resize", onResize);

    const onKey = (e: KeyboardEvent) => {
      const down = e.type === "keydown";
      keysRef.current[e.code] = down;
      if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(e.key)) e.preventDefault();
      // attack on press
      if (down && (e.code === "KeyF" || e.code === "KeyJ")) triggerAttack(me(), true);
    };
    window.addEventListener("keydown", onKey as any, { passive: false } as any);
    window.addEventListener("keyup", onKey as any, { passive: false } as any);

    return () => {
      cancelAnimationFrame(reqRef.current);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKey as any);
      window.removeEventListener("keyup", onKey as any);
    };
  }, [resetWorld, setupCanvas, loop]);

  // ---------- UI handlers ----------
  const copyShare = async () => {
    try { await navigator.clipboard.writeText(shareLink); setCopied(true); setTimeout(()=>setCopied(false), 1200); } catch {}
  };
  const joinPendingRoom = () => {
    const name = pendingRoom.trim() || "brawler-lobby";
    setRoom(name);
    router.push(`/brawler?room=${encodeURIComponent(name)}`);
  };

  // ---------- JSX ----------
  return (
    <main style={{ display: "grid", gridTemplateRows: "auto 1fr", height: "100vh" }}>
      <header
        style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", alignItems: "center", gap: 12, padding: 12, borderBottom: "1px solid #e5e7eb" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link href="/" style={{ textDecoration: "none", fontSize: 13 }}>← Home</Link>
          <strong style={{ fontSize: 14, whiteSpace: "nowrap" }}>Brawler — online co-op</strong>
        </div>

        {/* Room controls */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", justifySelf: "center", flexWrap: "wrap" }}>
          <input
            value={pendingRoom}
            onChange={(e) => setPendingRoom(e.target.value)}
            placeholder="room name"
            style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "6px 8px", minWidth: 180 }}
          />
          <button onClick={joinPendingRoom} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #e5e7eb", cursor: "pointer" }}>
            Join / Create
          </button>

          <span style={{ fontSize: 12, color: "#64748b" }}>Room:</span>
          <code style={{ fontSize: 12, background: "#f1f5f9", padding: "2px 6px", borderRadius: 6 }}>{room}</code>

          <button onClick={copyShare} title="Copy share link" style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #e5e7eb", cursor: "pointer" }}>
            {copied ? "Copied!" : "Copy Link"}
          </button>
          <a href={shareLink} target="_blank" rel="noreferrer" style={{ fontSize: 12, textDecoration: "none", color: "#2563eb" }}>
            Open link
          </a>
        </div>

        {/* Status + players */}
        <div style={{ justifySelf: "end", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: wsStatus === "Live" ? "#059669" : wsStatus === "Connecting" ? "#d97706" : "#ef4444" }}>
            WS: {wsStatus}
          </span>
          <span style={{ fontSize: 12, color: "#64748b" }}>• Role: {role}</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {uiPlayers.map((p) => (
              <div key={p.id} title={p.name} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span
                  style={{
                    display: "inline-block", width: 10, height: 10, borderRadius: "50%",
                    background: colorForId(p.id), border: "1px solid rgba(0,0,0,0.2)",
                  }}
                />
                <span style={{ fontSize: 12, color: "#334155", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
              </div>
            ))}
          </div>
          <span style={{ marginLeft: 4, fontSize: 12, color: "#64748b" }}>({uiPlayers.length})</span>
        </div>
      </header>

      <section style={{ display: "grid", placeItems: "center", padding: 12 }}>
        <canvas
          ref={canvasRef}
          style={{ border: "1px solid #e5e7eb", borderRadius: 12, background: "#e5e7eb", maxWidth: "100%" }}
        />
      </section>
    </main>
  );
}
