"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type RoleMsg = { type: "role"; role: "left" | "right" | "spectator" };
type StateMsg = {
  type: "state";
  width: number;
  height: number;
  ball: { x: number; y: number; vx: number; vy: number };
  paddles: { left: number; right: number };
  scores: { left: number; right: number };
  players: { left: boolean; right: boolean };
};

export default function Game() {
  const [room, setRoom] = useState("lobby");
  const [connected, setConnected] = useState(false);
  const [role, setRole] = useState<"left" | "right" | "spectator" | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const stateRef = useRef<StateMsg | null>(null);
  const keysRef = useRef({ up: false, down: false });
  const inputTimer = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const connect = useCallback(() => {
    const base = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";
    // NOTE: backend route: /ws/pong/:room/
    const ws = new WebSocket(`${base}/ws/pong/${encodeURIComponent(room)}/`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
    };
    ws.onclose = () => {
      setConnected(false);
      setRole(null);
      stateRef.current = null;
    };
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data) as RoleMsg | StateMsg;
      if (msg.type === "role") setRole(msg.role);
      if (msg.type === "state") stateRef.current = msg;
    };
  }, [room]);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
  }, []);

  // send inputs ~30Hz
  useEffect(() => {
    if (!connected) return;
    inputTimer.current = window.setInterval(() => {
      const ws = wsRef.current;
      if (ws && ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: "input", ...keysRef.current }));
      }
    }, 33) as unknown as number;

    return () => {
      if (inputTimer.current) window.clearInterval(inputTimer.current);
      inputTimer.current = null;
    };
  }, [connected]);

  // keyboard listeners
  useEffect(() => {
    const onKey = (e: KeyboardEvent, isDown: boolean) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (k === "arrowup" || k === "w") keysRef.current.up = isDown;
      if (k === "arrowdown" || k === "s") keysRef.current.down = isDown;
    };
    const kd = (e: KeyboardEvent) => onKey(e, true);
    const ku = (e: KeyboardEvent) => onKey(e, false);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
    };
  }, []);

  // canvas render loop
  useEffect(() => {
    const cvs = canvasRef.current!;
    const ctx = cvs.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    const targetW = 800;
    const targetH = 500;

    const resize = () => {
      cvs.style.width = `${targetW}px`;
      cvs.style.height = `${targetH}px`;
      cvs.width = Math.floor(targetW * dpr);
      cvs.height = Math.floor(targetH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      ctx.clearRect(0, 0, targetW, targetH);

      // table bg + center line
      ctx.fillStyle = "#0b1020";
      ctx.fillRect(0, 0, targetW, targetH);
      ctx.setLineDash([8, 8]);
      ctx.beginPath();
      ctx.moveTo(targetW / 2, 0);
      ctx.lineTo(targetW / 2, targetH);
      ctx.strokeStyle = "white";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([]);

      const st = stateRef.current;
      if (!st) {
        ctx.fillStyle = "white";
        ctx.font = "16px system-ui, sans-serif";
        ctx.fillText("Waiting for state...", 20, 30);
        return;
      }

      // paddles
      ctx.fillStyle = "white";
      ctx.fillRect(20, st.paddles.left, 10, 80);
      ctx.fillRect(targetW - 20 - 10, st.paddles.right, 10, 80);

      // ball
      ctx.fillRect(st.ball.x, st.ball.y, 10, 10);

      // scores
      ctx.font = "24px system-ui, sans-serif";
      ctx.fillText(String(st.scores.left), targetW / 2 - 40, 40);
      ctx.fillText(String(st.scores.right), targetW / 2 + 24, 40);

      // connection info
      ctx.font = "12px system-ui, sans-serif";
      ctx.fillText(
        `Players: L ${st.players.left ? "✓" : "–"} / R ${st.players.right ? "✓" : "–"}`,
        20,
        targetH - 16
      );
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex gap-2 items-center">
        <input
          className="border rounded px-3 py-2 flex-1"
          value={room}
          onChange={(e) => setRoom(e.target.value)}
          placeholder="room name"
        />
        {!connected ? (
          <button className="rounded px-4 py-2 bg-black text-white" onClick={connect}>
            Join
          </button>
        ) : (
          <button className="rounded px-4 py-2 border" onClick={disconnect}>
            Leave
          </button>
        )}
      </div>

      <div className="text-sm text-gray-600">
        Role: <span className="font-medium">{role ?? "—"}</span>{" "}
        <span className="ml-2">{connected ? "• connected" : "• disconnected"}</span>
      </div>

      <canvas ref={canvasRef} className="rounded border" />
      <div className="text-sm text-gray-500">
        Controls: <kbd>W</kbd>/<kbd>S</kbd> or <kbd>↑</kbd>/<kbd>↓</kbd>
      </div>
    </div>
  );
}
