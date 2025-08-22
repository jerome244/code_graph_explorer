// frontend/lib/useProjectSocket.ts
/* Minimal websocket hook:
   - connects when projectId is truthy
   - stamps clientId
   - ignores our own echoes
   - calls onRemoteMove for MOVE_NODE
*/
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type WsMessage =
  | { type: "PING" }
  | { type: "MOVE_NODE"; payload: { id: string; position: { x: number; y: number } } }
  | { type: string; payload?: unknown };

export function useProjectSocket(opts: {
  projectId?: string | number | null;
  onRemoteMove?: (id: string, position: { x: number; y: number }) => void;
}) {
  const { projectId, onRemoteMove } = opts;
  const [ready, setReady] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const clientId = useMemo(() => {
    const KEY = "graphsync.clientId";
    let id = "";
    try {
      id = localStorage.getItem(KEY) || "";
      if (!id) {
        id = crypto.randomUUID?.() || `c_${Math.random().toString(36).slice(2)}`;
        localStorage.setItem(KEY, id);
      }
    } catch {
      id = `c_${Math.random().toString(36).slice(2)}`;
    }
    return id;
  }, []);

  const url = useMemo(() => {
    if (!projectId) return null;
    const base =
      (typeof process !== "undefined" && process.env.NEXT_PUBLIC_WS_BASE) ||
      (typeof window !== "undefined" ? `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}` : "ws://localhost:8000");
    return `${base}/ws/projects/${projectId}/`;
  }, [projectId]);

  useEffect(() => {
    if (!url) return;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    const onOpen = () => setReady(true);
    const onClose = () => setReady(false);
    const onError = () => setReady(false);
    const onMessage = (ev: MessageEvent) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg?.clientId && msg.clientId === clientId) return; // ignore self echo
        if (msg?.type === "MOVE_NODE" && msg?.payload) {
          const { id, position } = msg.payload;
          onRemoteMove?.(id, position);
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.addEventListener("open", onOpen);
    ws.addEventListener("close", onClose);
    ws.addEventListener("error", onError);
    ws.addEventListener("message", onMessage);

    return () => {
      ws.removeEventListener("open", onOpen);
      ws.removeEventListener("close", onClose);
      ws.removeEventListener("error", onError);
      ws.removeEventListener("message", onMessage);
      try {
        ws.close();
      } catch {}
      wsRef.current = null;
    };
  }, [url, clientId, onRemoteMove]);

  const send = useCallback(
    (msg: WsMessage | Record<string, unknown>) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== ws.OPEN) return;
      const withStamp = { ...msg, clientId };
      ws.send(JSON.stringify(withStamp));
    },
    [clientId]
  );

  return { ready, send };
}
