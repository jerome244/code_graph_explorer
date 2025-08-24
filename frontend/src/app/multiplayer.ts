'use client';
import { useEffect, useMemo, useRef, useState } from 'react';

export type Other = { id:string; name:string; color:string; x:number; y:number; z:number; ry:number };

function uid() {
  const k = 'cge.playerId';
  let v = localStorage.getItem(k);
  if (!v) { v = crypto.randomUUID(); localStorage.setItem(k, v); }
  return v;
}

export function useMultiplayer(world=1, name?: string) {
  const wsRef = useRef<WebSocket|null>(null);
  const [others, setOthers] = useState<Map<string, Other>>(new Map());
  const [connected, setConnected] = useState(false);
  const playerId = useMemo(() => uid(), []);
  const playerName = name || `Player${String(Math.floor(Math.random()*1000)).padStart(3,'0')}`;
  const color = useMemo(() => {
    const c = localStorage.getItem('cge.color');
    if (c) return c;
    const h = Math.floor(Math.random()*360);
    const hex = `hsl(${h} 70% 55%)`;
    localStorage.setItem('cge.color', hex);
    return hex;
  }, []);

  useEffect(() => {
    const url = `ws://127.0.0.1:8000/ws/game/${world}/`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      ws.send(JSON.stringify({ type:'join', id: playerId, name: playerName, color }));
    };
    ws.onclose = () => { setConnected(false); wsRef.current = null; };
    ws.onerror = () => {};
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'snapshot') {
        const m = new Map<string, Other>();
        for (const p of msg.players as Other[]) m.set(p.id, p);
        setOthers(m);
      } else if (msg.type === 'join') {
        setOthers(m => new Map(m).set(msg.player.id, msg.player));
      } else if (msg.type === 'leave') {
        setOthers(m => { const n = new Map(m); n.delete(msg.id); return n; });
      } else if (msg.type === 'pos') {
        setOthers(m => {
          const n = new Map(m);
          const p = n.get(msg.id);
          if (p) { p.x = msg.x; p.y = msg.y; p.z = msg.z; p.ry = msg.ry; }
          return n;
        });
      } else if (msg.type === 'block_place' || msg.type === 'block_break') {
        // TODO: hook into your local overrides if you want live block edits
      } else if (msg.type === 'chat') {
        // TODO: show in a small chat UI
        console.log(`${msg.id}: ${msg.text}`);
      }
    };

    return () => { ws.close(); };
  }, [world, playerId, playerName, color]);

  let lastSent = 0;
  function sendPos(x:number,y:number,z:number, ry:number) {
    const ws = wsRef.current;
    const now = performance.now();
    if (!ws || ws.readyState !== ws.OPEN) return;
    if (now - lastSent < 100) return; // 10 Hz
    lastSent = now;
    ws.send(JSON.stringify({ type:'pos', x,y,z, ry }));
  }

  function sendBlockPlace(x:number,y:number,z:number, material:string) {
    const ws = wsRef.current; if (!ws || ws.readyState !== ws.OPEN) return;
    ws.send(JSON.stringify({ type:'block_place', x,y,z, material }));
  }
  function sendBlockBreak(x:number,y:number,z:number) {
    const ws = wsRef.current; if (!ws || ws.readyState !== ws.OPEN) return;
    ws.send(JSON.stringify({ type:'block_break', x,y,z }));
  }
  function sendChat(text:string) {
    const ws = wsRef.current; if (!ws || ws.readyState !== ws.OPEN) return;
    ws.send(JSON.stringify({ type:'chat', text }));
  }

  return { connected, others, sendPos, sendBlockPlace, sendBlockBreak, sendChat, playerId, playerName, color };
}
