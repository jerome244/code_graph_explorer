import * as React from "react";

export type RemotePlayer = { p: [number,number,number]; ry: number; sel?: string; name?: string };
export type Snapshot = { your_id: string; world: Record<string,string>; players: Record<string, RemotePlayer> };

type Handlers = {
  onSnapshot: (snap: Snapshot) => void;
  onPlace: (k: string, id: string) => void;
  onRemove: (k: string) => void;
  onState: (id: string, pl: RemotePlayer) => void;
  onJoin?: (id: string, pl: RemotePlayer) => void;
  onLeave?: (id: string) => void;
};

export function useMultiplayer(room: string, handlers: Handlers) {
  const wsRef = React.useRef<WebSocket | null>(null);
  const [clientId, setClientId] = React.useState<string | null>(null);
  const [connected, setConnected] = React.useState(false);

  const url = React.useMemo(() => {
    const base = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";
    return `${base}/ws/mc/${encodeURIComponent(room)}/`;
  }, [room]);

  React.useEffect(() => {
    let retry = 0;
    let closed = false;

    const open = () => {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => { setConnected(true); retry = 0; };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          switch (msg.type) {
            case "snapshot":
              setClientId(msg.your_id);
              handlers.onSnapshot({ your_id: msg.your_id, world: msg.world || {}, players: msg.players || {} });
              break;
            case "place":
              handlers.onPlace(msg.k, msg.id);
              break;
            case "remove":
              handlers.onRemove(msg.k);
              break;
            case "state":
              handlers.onState(msg.id, { p: msg.p, ry: msg.ry, sel: msg.sel, name: msg.name });
              break;
            case "join":
              handlers.onJoin?.(msg.id, msg.player);
              break;
            case "leave":
              handlers.onLeave?.(msg.id);
              break;
          }
        } catch {}
      };
      ws.onclose = () => {
        setConnected(false);
        if (closed) return;
        const delay = Math.min(2000 * (retry++ + 1), 8000);
        setTimeout(open, delay);
      };
      ws.onerror = () => { try { ws.close(); } catch {} };
    };

    open();
    return () => { closed = true; wsRef.current?.close(); };
  }, [url]);

  const send = React.useCallback((obj: any) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== 1) return;
    ws.send(JSON.stringify(obj));
  }, []);

  // helpers
  const sendPlace = React.useCallback((k: string, id: string) => send({ type:"place", k, id }), [send]);
  const sendRemove = React.useCallback((k: string) => send({ type:"remove", k }), [send]);
  const sendState = React.useCallback((p: [number,number,number], ry: number, sel?: string) => send({ type:"state", p, ry, sel }), [send]);

  return { clientId, connected, sendPlace, sendRemove, sendState };
}
