'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type Other = {
  id: string;
  name?: string;
  color?: string;
  x: number; y: number; z: number; ry: number;
};

export function useMultiplayer(world: number, name?: string) {
  const [connected, setConnected] = useState(false);
  const [others, setOthers] = useState<Map<string, Other>>(new Map());
  const wsRef = useRef<WebSocket | null>(null);

  // UNIQUE PER TAB:
  const myId = useMemo(() => {
    let id = sessionStorage.getItem('mp_id');
    if (!id) {
      id = (crypto as any).randomUUID?.() || Math.random().toString(36).slice(2);
      sessionStorage.setItem('mp_id', id);
    }
    return id;
  }, []);

  // stable display color per browser (ok to share across tabs)
  const color = useMemo(() => {
    let c = localStorage.getItem('mp_color');
    if (!c) {
      c = `hsl(${Math.floor(Math.random() * 360)} 80% 60%)`;
      localStorage.setItem('mp_color', c);
    }
    return c;
  }, []);

  useEffect(() => {
    let ws: WebSocket;
    let retries = 0;
    let pingTimer: any;

    function connect() {
      const url = `ws://127.0.0.1:8000/ws/game/${world}/`;
      ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        retries = 0;
        // announce presence
        ws.send(JSON.stringify({ type: 'join', id: myId, name: name || 'Player', color }));
        // keep the connection warm
        pingTimer = setInterval(() => {
          try { ws.send(JSON.stringify({ type: 'ping' })); } catch {}
        }, 15000);
      };

      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'snapshot') {
          const m = new Map<string, Other>();
          for (const p of (msg.players as Other[])) {
            if (p.id !== myId) m.set(p.id, p);
          }
          setOthers(m);
        } else if (msg.type === 'join') {
          const p = msg.player as Other;
          if (p.id === myId) return;
          setOthers(prev => { const m = new Map(prev); m.set(p.id, p); return m; });
        } else if (msg.type === 'pos') {
          if (msg.id === myId) return;
          setOthers(prev => {
            const m = new Map(prev);
            const p = m.get(msg.id) || { id: msg.id, x: 0, y: 0, z: 0, ry: 0 } as Other;
            p.x = msg.x; p.y = msg.y; p.z = msg.z; p.ry = msg.ry;
            m.set(msg.id, p);
            return m;
          });
        } else if (msg.type === 'leave') {
          setOthers(prev => { const m = new Map(prev); m.delete(msg.id); return m; });
        }
      };

      const retry = () => {
        setConnected(false);
        clearInterval(pingTimer);
        const delay = Math.min(10000, 1500 * (1 + retries));
        retries += 1;
        setTimeout(connect, delay);
      };

      ws.onclose = retry;
      ws.onerror = () => ws.close();
    }

    connect();
    return () => {
      clearInterval(pingTimer);
      try { wsRef.current?.close(); } catch {}
    };
  }, [world, myId, name, color]);

  const sendPos = useCallback((x: number, y: number, z: number, ry: number) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'pos', x, y, z, ry }));
  }, []);

  return { connected, others, myId, sendPos };
}
