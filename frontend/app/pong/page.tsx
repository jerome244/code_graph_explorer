// app/pong/page.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

type Role = "A" | "B" | "SPEC";

type GameMsg =
  | { type: "JOIN"; clientId?: string; payload: { name: string } }
  | { type: "PONG" | "PING"; clientId?: string }
  | { type: "INPUT"; clientId?: string; payload: { dir: -1 | 0 | 1; role: Role } }
  | {
      type: "STATE";
      clientId?: string;
      ts?: number;
      payload: {
        aY: number;
        bY: number;
        ball: { x: number; y: number; vx: number; vy: number };
        scoreA: number;
        scoreB: number;
        started: boolean;
      };
    }
  | { type: "ASSIGN"; clientId?: string; payload: { role: Role } }
  | { type: "LEAVE"; clientId?: string };

const WS_BASE =
  process.env.NEXT_PUBLIC_WS_BASE?.replace(/\/$/, "") ||
  (typeof window !== "undefined"
    ? `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}`
    : "");

function uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const W = 640;
const H = 400;
const PADDLE_W = 10;
const PADDLE_H = 80;
const PADDLE_SPEED = 280;
const BALL_R = 6;

// Performance knobs
const PHYSICS_HZ = 120;
const BROADCAST_HZ = 20;
const INTERP_DELAY_MS = 100;
const MAX_BUFFERED_STATES = 50;
const MAX_WS_BUFFERED = 200 * 1024;

// slug-safe room helpers
function cleanRoom(v: string) {
  return v.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 64) || "lobby";
}
function normalizeRoom(raw: string | null): string {
  if (!raw) return "lobby";
  try {
    const u = new URL(raw);
    const inner = u.searchParams.get("room");
    if (inner) return cleanRoom(inner);
  } catch {}
  return cleanRoom(raw);
}

export default function PongPage() {
  const sp = useSearchParams();

  // room + identity
  const [room, setRoom] = useState(() => normalizeRoom(sp.get("room")));
  const [name, setName] = useState(() => `Guest-${Math.random().toString(36).slice(2, 6)}`);
  const clientIdRef = useRef(uuid());

  // ws
  const wsRef = useRef<WebSocket | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const heartbeatRef = useRef<number | null>(null);
  const lastPongRef = useRef<number>(0);
  const joinedOnceRef = useRef<boolean>(false);
  const [wsUrl, setWsUrl] = useState<string>("");
  const [wsErr, setWsErr] = useState<string>("");

  // role & host (no auto-assign/auto-host)
  const [role, setRole] = useState<Role>("SPEC");
  const [isHost, setIsHost] = useState<boolean>(false);

  // inputs
  const inputDirRef = useRef<-1 | 0 | 1>(0); // this client's current held direction
  // 🔸 Host remembers each player's held direction continuously:
  const dirARef = useRef<-1 | 0 | 1>(0);
  const dirBRef = useRef<-1 | 0 | 1>(0);

  // sim state (authoritative on host)
  type Sim = {
    aY: number;
    bY: number;
    ball: { x: number; y: number; vx: number; vy: number };
    scoreA: number;
    scoreB: number;
    started: boolean;
  };
  const stateRef = useRef<Sim>({
    aY: H / 2 - PADDLE_H / 2,
    bY: H / 2 - PADDLE_H / 2,
    ball: { x: W / 2, y: H / 2, vx: 0, vy: 0 },
    scoreA: 0,
    scoreB: 0,
    started: false,
  });

  // follower interpolation buffer
  const bufferRef = useRef<{ tLocal: number; s: Sim }[]>([]);

  // canvas
  const cnvRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);
  const lastTsRef = useRef<number>(0);
  const physicsAccumulatorRef = useRef<number>(0);
  const lastBroadcastAtRef = useRef<number>(0);

  // Hi-DPI canvas scale
  const setupCanvas = useCallback(() => {
    const cnv = cnvRef.current;
    if (!cnv) return;
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    cnv.style.width = `${W}px`;
    cnv.style.height = `${H}px`;
    cnv.width = Math.floor(W * dpr);
    cnv.height = Math.floor(H * dpr);
    const ctx = cnv.getContext("2d");
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }, []);

  // ---- connect using EXISTING /ws/projects/:id/ hub (slug-safe fake project id)
  const connect = useCallback((roomId: string) => {
    if (!WS_BASE) return;
    const roomProjectId = `pong__${roomId}`;
    const url = `${WS_BASE}/ws/projects/${encodeURIComponent(roomProjectId)}/`;
    setWsUrl(url);
    setWsErr("");

    const ws = new WebSocket(url);
    wsRef.current = ws;
    joinedOnceRef.current = false;

    ws.onopen = () => {
      setWsConnected(true);
      if (!joinedOnceRef.current) {
        try { ws.send(JSON.stringify({ type: "JOIN", clientId: clientIdRef.current, payload: { name } } as GameMsg)); } catch {}
        joinedOnceRef.current = true;
      }

      // heartbeat
      lastPongRef.current = Date.now();
      if (heartbeatRef.current) window.clearInterval(heartbeatRef.current);
      heartbeatRef.current = window.setInterval(() => {
        if (ws.readyState !== 1) return;
        try { ws.send(JSON.stringify({ type: "PING", clientId: clientIdRef.current })); } catch {}
        if (Date.now() - lastPongRef.current > 30000) {
          try { ws.close(); } catch {}
        }
      }, 10000) as unknown as number;
    };

    ws.onmessage = (e) => {
      let msg: GameMsg | null = null;
      try { msg = JSON.parse(e.data); } catch { return; }
      if (!msg) return;

      // Ignore echoes of our own frames
      if (msg.clientId && msg.clientId === clientIdRef.current) return;

      if (msg.type === "PONG") { lastPongRef.current = Date.now(); return; }
      if (msg.type === "ASSIGN") { if (msg.payload?.role) setRole(msg.payload.role); return; }

      if (msg.type === "STATE") {
        // If we are host, ignore other STATE frames to avoid host flapping
        if (isHost) return;

        const s = msg.payload!;
        const snapshot: Sim = {
          aY: s.aY,
          bY: s.bY,
          ball: { ...s.ball },
          scoreA: s.scoreA,
          scoreB: s.scoreB,
          started: s.started,
        };

        // push into interpolation buffer
        const buf = bufferRef.current;
        buf.push({ tLocal: performance.now(), s: snapshot });
        if (buf.length > MAX_BUFFERED_STATES) buf.splice(0, buf.length - MAX_BUFFERED_STATES);

        stateRef.current = snapshot;
        return;
      }

      if (msg.type === "INPUT" && isHost) {
        // 🔧 Update the HELD direction for whichever paddle sent it
        const dir = (msg.payload?.dir ?? 0) as -1 | 0 | 1;
        const senderRole = msg.payload?.role as Role;
        if (senderRole === "A") dirARef.current = dir;
        else if (senderRole === "B") dirBRef.current = dir;
        return;
      }
    };

    ws.onclose = () => {
      setWsConnected(false);
      if (heartbeatRef.current) { window.clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
      setTimeout(() => { connect(roomId); }, 1200);
    };

    ws.onerror = () => {
      setWsConnected(false);
      setWsErr("WebSocket error / cannot connect");
    };
  }, [name, isHost]);

  // launch ball (host only)
  const launchBall = () => {
    const ang = (Math.random() * 0.6 - 0.3) * Math.PI;
    const speed = 260;
    const dir = Math.random() < 0.5 ? -1 : 1;
    stateRef.current.ball = {
      x: W / 2,
      y: H / 2,
      vx: Math.cos(ang) * speed * dir,
      vy: Math.sin(ang) * speed,
    };
    stateRef.current.started = true;
  };

  const broadcastStateNow = () => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== 1) return;
    if (ws.bufferedAmount > MAX_WS_BUFFERED) return; // backpressure guard
    const s = stateRef.current;
    const msg: GameMsg = {
      type: "STATE",
      clientId: clientIdRef.current,
      ts: performance.now(),
      payload: {
        aY: s.aY,
        bY: s.bY,
        ball: { ...s.ball },
        scoreA: s.scoreA,
        scoreB: s.scoreB,
        started: s.started,
      },
    };
    try { ws.send(JSON.stringify(msg)); } catch {}
    lastBroadcastAtRef.current = performance.now();
  };

  // fixed-step physics on host
  const stepHostFixed = (dt: number) => {
    const sdt = 1 / PHYSICS_HZ;
    const s = stateRef.current;
    physicsAccumulatorRef.current += dt;

    while (physicsAccumulatorRef.current >= sdt) {
      // 🔁 Apply continuous held directions for both paddles
      //    If the host is controlling one role locally, use host's local input for that side.
      let dirA = dirARef.current;
      let dirB = dirBRef.current;
      if (role === "A") dirA = inputDirRef.current;
      if (role === "B") dirB = inputDirRef.current;

      s.aY = clamp(s.aY + dirA * PADDLE_SPEED * sdt, 0, H - PADDLE_H);
      s.bY = clamp(s.bY + dirB * PADDLE_SPEED * sdt, 0, H - PADDLE_H);

      if (s.started) {
        s.ball.x += s.ball.vx * sdt;
        s.ball.y += s.ball.vy * sdt;

        // top/bottom
        if (s.ball.y < BALL_R) { s.ball.y = BALL_R; s.ball.vy *= -1; }
        else if (s.ball.y > H - BALL_R) { s.ball.y = H - BALL_R; s.ball.vy *= -1; }

        // left paddle
        if (
          s.ball.x - BALL_R <= PADDLE_W + 4 &&
          s.ball.y >= s.aY - 4 &&
          s.ball.y <= s.aY + PADDLE_H + 4 &&
          s.ball.vx < 0
        ) {
          s.ball.x = PADDLE_W + 4 + BALL_R;
          s.ball.vx *= -1.04;
          const rel = (s.ball.y - (s.aY + PADDLE_H / 2)) / (PADDLE_H / 2);
          s.ball.vy += rel * 60;
        }

        // right paddle
        if (
          s.ball.x + BALL_R >= W - (PADDLE_W + 4) &&
          s.ball.y >= s.bY - 4 &&
          s.ball.y <= s.bY + PADDLE_H + 4 &&
          s.ball.vx > 0
        ) {
          s.ball.x = W - (PADDLE_W + 4) - BALL_R;
          s.ball.vx *= -1.04;
          const rel = (s.ball.y - (s.bY + PADDLE_H / 2)) / (PADDLE_H / 2);
          s.ball.vy += rel * 60;
        }

        // scoring
        if (s.ball.x < -40) {
          s.scoreB += 1; s.started = false; setTimeout(() => { launchBall(); broadcastStateNow(); }, 450);
        } else if (s.ball.x > W + 40) {
          s.scoreA += 1; s.started = false; setTimeout(() => { launchBall(); broadcastStateNow(); }, 450);
        }
      }

      physicsAccumulatorRef.current -= sdt;
    }

    // throttle broadcast to BROADCAST_HZ
    const now = performance.now();
    const minGap = 1000 / BROADCAST_HZ;
    if (!lastBroadcastAtRef.current || now - lastBroadcastAtRef.current >= minGap) {
      broadcastStateNow();
    }
  };

  // client-side: interpolate remote ball + keep your own paddle responsive
  const stepClientLocal = (dt: number) => {
    const s = stateRef.current;
    if (role === "A") s.aY = clamp(s.aY + inputDirRef.current * PADDLE_SPEED * dt, 0, H - PADDLE_H);
    if (role === "B") s.bY = clamp(s.bY + inputDirRef.current * PADDLE_SPEED * dt, 0, H - PADDLE_H);

    const now = performance.now();
    const target = now - INTERP_DELAY_MS;
    const buf = bufferRef.current;
    if (buf.length >= 2) {
      let i = buf.findIndex((p) => p.tLocal > target);
      if (i === -1) {
        const last = buf[buf.length - 1].s;
        stateRef.current = { ...last, aY: s.aY, bY: s.bY };
      } else if (i === 0) {
        const first = buf[0].s;
        stateRef.current = { ...first, aY: s.aY, bY: s.bY };
      } else {
        const a = buf[i - 1];
        const b = buf[i];
        const t = clamp01((target - a.tLocal) / Math.max(1, b.tLocal - a.tLocal));
        const lerp = (x: number, y: number) => x + (y - x) * t;
        stateRef.current = {
          aY: s.aY,
          bY: s.bY,
          ball: {
            x: lerp(a.s.ball.x, b.s.ball.x),
            y: lerp(a.s.ball.y, b.s.ball.y),
            vx: lerp(a.s.ball.vx, b.s.ball.vx),
            vy: lerp(a.s.ball.vy, b.s.ball.vy),
          },
          scoreA: b.s.scoreA,
          scoreB: b.s.scoreB,
          started: b.s.started,
        };
      }
      if (buf.length > MAX_BUFFERED_STATES) buf.splice(0, buf.length - MAX_BUFFERED_STATES);
    }
  };

  // render
  const draw = (ctx: CanvasRenderingContext2D) => {
    const s = stateRef.current;
    ctx.clearRect(0, 0, W, H);

    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = "#334155";
    ctx.setLineDash([8, 10]);
    ctx.beginPath();
    ctx.moveTo(W / 2, 0);
    ctx.lineTo(W / 2, H);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "#e5e7eb";
    ctx.fillRect(4, s.aY, PADDLE_W, PADDLE_H);
    ctx.fillRect(W - (PADDLE_W + 4), s.bY, PADDLE_W, PADDLE_H);

    ctx.beginPath();
    ctx.arc(s.ball.x, s.ball.y, BALL_R, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#f8fafc";
    ctx.font = "bold 28px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto";
    ctx.textAlign = "center";
    ctx.fillText(String(s.scoreA), W / 2 - 40, 40);
    ctx.fillText(String(s.scoreB), W / 2 + 40, 40);

    ctx.fillStyle = "#94a3b8";
    ctx.font = "12px ui-sans-serif, system-ui";
    ctx.textAlign = "left";
    const control = role === "A" ? "W/S" : role === "B" ? "↑/↓" : "—";
    ctx.fillText(`You are: ${role}   Controls: ${control}`, 12, H - 14);
  };

  const loop = useCallback((ts: number) => {
    const ctx = cnvRef.current?.getContext("2d");
    if (!ctx) return;

    const last = lastTsRef.current || ts;
    const dt = Math.min(0.05, (ts - last) / 1000);
    lastTsRef.current = ts;

    if (isHost) stepHostFixed(dt);
    else stepClientLocal(dt);

    draw(ctx);
    rafRef.current = requestAnimationFrame(loop);
  }, [isHost, role]);

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      let dir: -1 | 0 | 1 = inputDirRef.current;
      let myRole: Role = role;

      if (myRole === "A") {
        if (e.type === "keydown" && (e.key === "w" || e.key === "W")) dir = -1;
        if (e.type === "keydown" && (e.key === "s" || e.key === "S")) dir = 1;
        if (e.type === "keyup" && (e.key === "w" || e.key === "W" || e.key === "s" || e.key === "S")) dir = 0;
      } else if (myRole === "B") {
        if (e.type === "keydown" && e.key === "ArrowUp") dir = -1;
        if (e.type === "keydown" && e.key === "ArrowDown") dir = 1;
        if (e.type === "keyup" && (e.key === "ArrowUp" || e.key === "ArrowDown")) dir = 0;
      } else {
        return;
      }

      if (dir !== inputDirRef.current) {
        inputDirRef.current = dir;
        const ws = wsRef.current;
        if (ws && ws.readyState === 1) {
          const msg: GameMsg = { type: "INPUT", clientId: clientIdRef.current, payload: { dir, role: myRole } };
          try { ws.send(JSON.stringify(msg)); } catch {}
        }
      }
    };

    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
  }, [role]);

  // start loop, connect WS, set up canvas when room changes; also write ?room= into URL
  useEffect(() => {
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("room", room);
      window.history.replaceState(null, "", url.toString());
      setupCanvas();
    }

    if (wsRef.current && wsRef.current.readyState === 1) {
      try { wsRef.current.close(); } catch {}
    }
    connect(room);

    if (!rafRef.current) rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };
  }, [room, connect, loop, setupCanvas]);

  // share link after mount
  const [shareLink, setShareLink] = useState<string>("");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("room", room);
    setShareLink(url.toString());
  }, [room]);

  // ----------- Controls -----------
  const startMatch = () => {
    setIsHost(true); // we remain host; self-echoed STATE is ignored
    if (!stateRef.current.started) {
      launchBall();
      broadcastStateNow();
    }
  };

  const stopMatch = () => {
    if (!isHost) return;
    stateRef.current.started = false;
    broadcastStateNow();
  };

  return (
    <main style={{ display: "grid", gridTemplateRows: "auto 1fr", height: "100vh" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: 12,
          borderBottom: "1px solid #e5e7eb",
          flexWrap: "wrap",
        }}
      >
        <Link href="/" style={{ textDecoration: "none", fontSize: 13 }}>
          ← Home
        </Link>
        <strong style={{ fontSize: 14 }}>Pong (2-player, realtime)</strong>

        <div style={{ width: 1, height: 24, background: "#e5e7eb" }} />

        <label style={{ fontSize: 12, color: "#334155" }}>
          Name:
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ marginLeft: 6, border: "1px solid #e5e7eb", borderRadius: 6, padding: "4px 8px", fontSize: 12 }}
          />
        </label>

        <label style={{ fontSize: 12, color: "#334155" }}>
          Room:
          <input
            value={room}
            onChange={(e) => setRoom(normalizeRoom(e.target.value || "lobby"))}
            style={{ marginLeft: 6, border: "1px solid #e5e7eb", borderRadius: 6, padding: "4px 8px", fontSize: 12 }}
          />
        </label>

        <button
          onClick={() => setRoom((r) => r || "lobby")}
          style={{
            border: "1px solid #e5e7eb",
            background: "#fff",
            borderRadius: 6,
            padding: "4px 10px",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          Join / Create
        </button>

        <div style={{ width: 1, height: 24, background: "#e5e7eb" }} />

        <button
          onClick={startMatch}
          title="Start broadcasting physics to everyone in the room"
          style={{
            border: "1px solid #16a34a",
            background: "#ecfdf5",
            color: "#065f46",
            borderRadius: 6,
            padding: "4px 10px",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          ▶ Start Match
        </button>

        <button
          onClick={stopMatch}
          disabled={!isHost}
          title="Stop ball movement (host only)"
          style={{
            border: "1px solid #f87171",
            background: "#fef2f2",
            color: "#991b1b",
            borderRadius: 6,
            padding: "4px 10px",
            fontSize: 12,
            cursor: isHost ? "pointer" : "not-allowed",
            opacity: isHost ? 1 : 0.6,
          }}
        >
          ■ Stop
        </button>

        {role === "SPEC" && (
          <>
            <button
              onClick={() => setRole("A")}
              style={{ border: "1px solid #e5e7eb", background: "#fff", borderRadius: 6, padding: "4px 10px", fontSize: 12, cursor: "pointer" }}
            >
              Take Player A
            </button>
            <button
              onClick={() => setRole("B")}
              style={{ border: "1px solid #e5e7eb", background: "#fff", borderRadius: 6, padding: "4px 10px", fontSize: 12, cursor: "pointer" }}
            >
              Take Player B
            </button>
          </>
        )}

        <span style={{ marginLeft: "auto", fontSize: 12, color: "#64748b" }}>
          WS: {wsConnected ? "Connected" : "Disconnected"} &nbsp;•&nbsp; Role: {role} &nbsp;•&nbsp; {isHost ? "Host" : "Client"}
        </span>
        {!!wsUrl && (
          <span style={{ width: "100%", fontSize: 11, color: "#6b7280" }}>
            WS URL: {wsUrl} {wsErr ? ` • ${wsErr}` : ""}
          </span>
        )}
      </header>

      <section style={{ display: "grid", placeItems: "center", padding: 16 }}>
        <div style={{ display: "grid", gap: 10, justifyItems: "center" }}>
          <canvas
            ref={cnvRef}
            width={W}
            height={H}
            style={{ border: "1px solid #e5e7eb", borderRadius: 12, background: "#0f172a" }}
          />
          <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: "#334155" }}>
            <span>Share room link:</span>
            <input
              value={shareLink}
              readOnly
              onFocus={(e) => e.currentTarget.select()}
              placeholder="(link appears after mount)"
              style={{ width: 420, border: "1px solid #e5e7eb", borderRadius: 6, padding: "4px 8px", fontSize: 12 }}
            />
            <button
              onClick={() => { if (shareLink) navigator.clipboard?.writeText(shareLink); }}
              disabled={!shareLink}
              style={{
                border: "1px solid #e5e7eb",
                background: "#fff",
                borderRadius: 6,
                padding: "4px 8px",
                fontSize: 12,
                cursor: shareLink ? "pointer" : "not-allowed",
                opacity: shareLink ? 1 : 0.6,
              }}
            >
              Copy
            </button>
          </div>
          <div style={{ fontSize: 12, color: "#64748b" }}>
            Player A: W/S &nbsp;&nbsp;|&nbsp;&nbsp; Player B: ↑/↓
          </div>
        </div>
      </section>
    </main>
  );
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
function clamp01(t: number) {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}
