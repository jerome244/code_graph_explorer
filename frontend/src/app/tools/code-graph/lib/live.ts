'use client';
import { useEffect, useMemo, useRef, useState } from 'react';

function wsFromHttp(httpUrl: string) {
  const u = new URL(httpUrl);
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  return u;
}

export type Peer = { id: string; name?: string; color?: string; user_id?: number | null };

export function useLiveProject(opts: {
  projectId?: number | null;
  shareToken?: string | null;
  jwt?: string | null;
  displayName?: string;
}) {
  const { projectId, shareToken, jwt, displayName } = opts;
  const [connected, setConnected] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [peers, setPeers] = useState<Map<string, Peer>>(new Map());
  const [remoteSelections, setRemoteSelections] = useState<Map<string, string[]>>(new Map());

  const color = useMemo(() => {
    const h = Math.floor(Math.random() * 360);
    return `hsl(${h},75%,50%)`;
  }, []);

  const wsRef = useRef<WebSocket | null>(null);
  const myIdRef = useRef<string | null>(null);

  // connect
  useEffect(() => {
    const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/+$/, '');
    if (!projectId && !shareToken) return;

    const base = wsFromHttp(API_BASE);
    if (projectId) {
      base.pathname = `/ws/projects/${projectId}/`;
      if (jwt) base.searchParams.set('token', jwt);
    } else {
      base.pathname = `/ws/projects/shared/${shareToken}/`;
    }

    const socket = new WebSocket(base.toString());
    wsRef.current = socket;

    socket.onopen = () => setConnected(true);
    socket.onclose = () => setConnected(false);

    socket.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'welcome') {
        myIdRef.current = msg.id;
        setCanEdit(!!msg.can_edit);
        const m = new Map<string, Peer>();
        (msg.peers || []).forEach((p: Peer) => m.set(p.id, p));
        setPeers(m);
        // identify self
        socket.send(JSON.stringify({ type: 'hello', name: displayName || 'Guest', color }));
        return;
      }
      if (msg.type === 'join' || msg.type === 'hello') {
        setPeers((prev) => {
          const next = new Map(prev);
          const p: Peer = { id: msg.id, name: msg.name, color: msg.color };
          next.set(msg.id, { ...next.get(msg.id), ...p });
          return next;
        });
        return;
      }
      if (msg.type === 'leave') {
        setPeers((prev) => {
          const next = new Map(prev);
          next.delete(msg.id);
          return next;
        });
        setRemoteSelections((prev) => {
          const next = new Map(prev);
          next.delete(msg.id);
          return next;
        });
        return;
      }
      if (msg.type === 'select') {
        if (msg.id === myIdRef.current) return;
        setRemoteSelections((prev) => {
          const next = new Map(prev);
          next.set(msg.id, Array.isArray(msg.ids) ? msg.ids : []);
          return next;
        });
        return;
      }
      if (msg.type === 'options') {
        // bubble to UI via CustomEvent; the page can listen if it wants to auto-follow
        window.dispatchEvent(new CustomEvent('project:options', { detail: msg }));
        return;
      }
      if (msg.type === 'project_updated') {
        window.dispatchEvent(new CustomEvent('project:updated', { detail: msg }));
        return;
      }
    };

    return () => {
      try { socket.close(); } catch {}
      wsRef.current = null;
      setPeers(new Map());
      setRemoteSelections(new Map());
      setConnected(false);
    };
  }, [projectId, shareToken, jwt, displayName, color]);

  // API
  const sendSelections = (ids: string[]) => {
    const s = wsRef.current;
    if (!s || s.readyState !== WebSocket.OPEN) return;
    s.send(JSON.stringify({ type: 'select', ids }));
  };
  const sendOptions = (opts: { filter?: string; includeDeps?: boolean; layoutName?: string; fnMode?: boolean }) => {
    const s = wsRef.current;
    if (!s || s.readyState !== WebSocket.OPEN) return;
    s.send(JSON.stringify({ type: 'options', ...opts }));
  };

  return { connected, canEdit, peers, remoteSelections, sendSelections, sendOptions, myColor: color };
}
