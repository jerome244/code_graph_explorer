'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

function wsFromHttp(httpUrl: string) {
  const u = new URL(httpUrl);
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  return u;
}

export type Peer = { id: string; name?: string; color?: string; user_id?: number | null };
export type NodePos = { id: string; x: number; y: number };

type WireWelcomeOrState =
  | {
      type: 'welcome';
      id: string;
      can_edit: boolean;
      peers?: Peer[];
      positions?: Record<string, { x: number; y: number }>;
    }
  | {
      type: 'state';
      can_edit: boolean;
      positions?: Record<string, { x: number; y: number }>;
    };

export function useLiveProject(opts: {
  projectId?: number | null;
  shareToken?: string | null;
  jwt?: string | null;
  displayName?: string;

  /** Called once on join (and on explicit state requests) with all node positions. */
  onPositions?: (snapshot: Record<string, { x: number; y: number }>) => void;

  /** Called whenever remote users move nodes. */
  onNodesPos?: (updates: NodePos[]) => void;

  /** Optional hook for UI; fires when canEdit changes. */
  onCanEditChange?: (can: boolean) => void;
}) {
  const { projectId, shareToken, jwt, displayName, onPositions, onNodesPos, onCanEditChange } = opts;

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
  const canEditRef = useRef<boolean>(false);

  // ---- batched outgoing node moves (~30 fps) --------------------------
  const pendingRef = useRef<Map<string, NodePos>>(new Map());
  const tickingRef = useRef(false);

  const flushPositions = useCallback(() => {
    tickingRef.current = false;
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (!canEditRef.current) return;

    const pending = pendingRef.current;
    if (pending.size === 0) return;

    const positions = Array.from(pending.values());
    pending.clear();
    try {
      ws.send(JSON.stringify({ type: 'nodes_pos', positions }));
    } catch {}
  }, []);

  /** Call this while dragging a node locally. */
  const queueNodeMove = useCallback((id: string, x: number, y: number) => {
    if (!canEditRef.current) return;
    pendingRef.current.set(id, { id, x, y });
    if (!tickingRef.current) {
      tickingRef.current = true;
      setTimeout(flushPositions, 33); // ~30 Hz
    }
  }, [flushPositions]);

  /** Optionally force-send any queued moves now. */
  const publishPositionsNow = useCallback(() => flushPositions(), [flushPositions]);

  // ---- connect --------------------------------------------------------
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

    socket.onopen = () => {
      setConnected(true);
      // identify self
      try {
        socket.send(JSON.stringify({ type: 'hello', name: displayName || 'Guest', color }));
        // ask for a fresh state (redundant with welcome but safe on reconnects)
        socket.send(JSON.stringify({ type: 'request_state' }));
      } catch {}
    };
    socket.onclose = () => setConnected(false);

    socket.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);

      // initial snapshots
      if (msg?.type === 'welcome' || msg?.type === 'state') {
        const w = msg as WireWelcomeOrState;
        if ('id' in w && w.type === 'welcome') {
          myIdRef.current = w.id;
          const m = new Map<string, Peer>();
          (w.peers || []).forEach((p: Peer) => m.set(p.id, p));
          setPeers(m);
        }

        canEditRef.current = !!w.can_edit;
        setCanEdit(canEditRef.current);
        onCanEditChange?.(canEditRef.current);

        if (w.positions) {
          onPositions?.(w.positions);
        }
        return;
      }

      // presence
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

      // selections
      if (msg.type === 'select') {
        if (msg.id === myIdRef.current) return;
        setRemoteSelections((prev) => {
          const next = new Map(prev);
          next.set(msg.id, Array.isArray(msg.ids) ? msg.ids : []);
          return next;
        });
        return;
      }

      // options -> bubble to UI (if you want auto-follow)
      if (msg.type === 'options') {
        window.dispatchEvent(new CustomEvent('project:options', { detail: msg }));
        return;
      }

      // server-side "saved" ping
      if (msg.type === 'project_updated') {
        window.dispatchEvent(new CustomEvent('project:updated', { detail: msg }));
        return;
      }

      // realtime node positions from others
      if (msg.type === 'nodes_pos') {
        const arr = (msg.positions || []) as NodePos[];
        if (arr.length) onNodesPos?.(arr);
        return;
      }
    };

    return () => {
      try { socket.close(); } catch {}
      wsRef.current = null;
      setPeers(new Map());
      setRemoteSelections(new Map());
      setConnected(false);
      canEditRef.current = false;
      setCanEdit(false);
      pendingRef.current.clear();
      tickingRef.current = false;
    };
  }, [projectId, shareToken, jwt, displayName, color, onPositions, onNodesPos, onCanEditChange]);

  // ---- small API ------------------------------------------------------
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

  return {
    connected,
    canEdit,
    peers,
    remoteSelections,
    sendSelections,
    sendOptions,

    // NEW: call this in your graph’s drag handler
    queueNodeMove,
    publishPositionsNow,

    myColor: color,
  };
}
