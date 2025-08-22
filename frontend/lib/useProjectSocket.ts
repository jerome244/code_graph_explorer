// frontend/lib/useProjectSocket.ts
import { useEffect, useMemo, useRef, useState } from "react";

type Vec2 = { x: number; y: number };
type Status = "connecting" | "open" | "closed" | "error";

type Handlers = {
  onMoveNode?: (id: string, pos: Vec2) => void;
  onHideNode?: (path: string, hidden: boolean) => void;
  onUpdateFile?: (path: string, content: string) => void;
  onSnapshot?: (payload: { graph: any }) => void; // normalized to { graph }
  onPresenceChange?: (peers: number) => void;
  onStatusChange?: (status: Status) => void;
};

/**
 * WebSocket hook for project rooms.
 * - Works with either {type, payload:{...}} or flat {type, ...} messages.
 * - Skips echo if legacy servers still bounce the sender.
 * - Heartbeat with PING/PONG + simple presence events.
 */
export function useProjectSocket(projectId: string, handlers: Handlers = {}) {
  const base =
    process.env.NEXT_PUBLIC_WS_BASE ??
    (typeof window !== "undefined"
      ? `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}`
      : "ws://localhost:8000");
  const url = projectId ? `${base.replace(/\/$/, "")}/ws/projects/${encodeURIComponent(projectId)}/` : "";

  const wsRef = useRef<WebSocket | null>(null);
  const heartRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const queueRef = useRef<string[]>([]);
  const lastPongRef = useRef<number>(0);

  const clientId = useMemo(
    () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2)),
    []
  );

  const [peers, setPeers] = useState(1);
  const [status, setStatus] = useState<Status>("closed");

  useEffect(() => {
    // Tear down if no project
    if (!projectId || !url) {
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {}
        wsRef.current = null;
      }
      setStatus("closed");
      handlers.onStatusChange?.("closed");
      return;
    }

    const ws = new WebSocket(url);
    wsRef.current = ws;

    setStatus("connecting");
    handlers.onStatusChange?.("connecting");

    ws.onopen = () => {
      setStatus("open");
      handlers.onStatusChange?.("open");

      // Flush any queued messages
      for (const raw of queueRef.current.splice(0)) ws.send(raw);

      // Heartbeat
      lastPongRef.current = Date.now();
      heartRef.current = setInterval(() => {
        if (ws.readyState !== WebSocket.OPEN) return;
        ws.send(JSON.stringify({ type: "PING", clientId }));
        if (Date.now() - lastPongRef.current > 30_000) {
          try {
            ws.close();
          } catch {}
        }
      }, 10_000);
    };

    ws.onmessage = (e) => {
      let msg: any;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }

      // Back-compat: ignore my echo if a legacy server still echoes
      if (msg?.clientId && msg.clientId === clientId) return;

      const t = msg?.type;
      if (t === "PONG") {
        lastPongRef.current = Date.now();
        return;
      }
      if (t === "USER_JOINED") {
        setPeers((n) => {
          const next = Math.max(1, n + 1);
          handlers.onPresenceChange?.(next);
          return next;
        });
        return;
      }
      if (t === "USER_LEFT") {
        setPeers((n) => {
          const next = Math.max(1, n - 1);
          handlers.onPresenceChange?.(next);
          return next;
        });
        return;
      }

      // Unwrap payload if present; support both shapes
      const p = msg && typeof msg === "object" && "payload" in msg && msg.payload ? msg.payload : msg;

      switch (t) {
        case "MOVE_NODE":
          if (p?.id && p?.position) handlers.onMoveNode?.(String(p.id), p.position);
          return;
        case "HIDE_NODE":
          if (p?.path != null && typeof p.hidden === "boolean") handlers.onHideNode?.(String(p.path), !!p.hidden);
          return;
        case "UPDATE_FILE":
          if (p?.path != null && "content" in p) handlers.onUpdateFile?.(String(p.path), String(p.content));
          return;
        case "SNAPSHOT": {
          const graph = p?.graph ?? msg?.graph ?? null;
          if (graph) handlers.onSnapshot?.({ graph });
          return;
        }
        default:
          return;
      }
    };

    ws.onerror = () => {
      setStatus("error");
      handlers.onStatusChange?.("error");
    };

    ws.onclose = () => {
      setStatus("closed");
      handlers.onStatusChange?.("closed");
      if (heartRef.current) {
        clearInterval(heartRef.current);
        heartRef.current = null;
      }
    };

    return () => {
      if (heartRef.current) {
        clearInterval(heartRef.current);
        heartRef.current = null;
      }
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {}
        wsRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, projectId]);

  function send(msg: any) {
    const enriched = msg && typeof msg === "object" && !("clientId" in msg) ? { ...msg, clientId } : msg;
    const raw = JSON.stringify(enriched);
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(raw);
    else queueRef.current.push(raw);
  }

  return { status, peers, send, clientId };
}
