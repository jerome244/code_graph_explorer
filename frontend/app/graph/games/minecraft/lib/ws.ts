// lib/ws.ts
type Vec3 = { x: number; y: number; z: number };

export type GameInbound =
  | { type: "welcome"; session: string; you: { id: string; username: string }; players: Record<string, { username: string; last_seen: string }>; time: string }
  | { type: "player_join"; player: { id: string; username?: string }; time: string }
  | { type: "player_leave"; player: { id: string }; time: string }
  | { type: "player_move"; player: { id: string }; pos: Vec3; time: string }
  | { type: "block_place"; player: { id: string }; block: { x: number; y: number; z: number; kind: any }; time: string }
  | { type: "block_remove"; player: { id: string }; x: number; y: number; z: number; time: string }
  | { type: "chat"; player: { id: string; username?: string }; message: string; time: string }
  // NEW: server-side errors before/after accept()
  | { type: "error"; code: "room_full" | "too_many_tabs" | "unauthorized" | "forbidden" | string; message: string; limit?: number };

export type GameOutbound =
  | { type: "join"; name?: string }
  | { type: "move"; x: number; y: number; z: number }
  | { type: "place_block"; x: number; y: number; z: number; block: any }
  | { type: "remove_block"; x: number; y: number; z: number }
  | { type: "chat"; message: string }
  | { type: "ping" };

type ErrorHandler = (err: { code: string | number; message: string; limit?: number }) => void;

export class GameSocket {
  private ws?: WebSocket;
  private url: string;
  private onMsg: (msg: GameInbound) => void;
  private onOpen?: () => void;
  private onClose?: () => void;
  private onError?: ErrorHandler;

  private reconnect = true;
  private reconnectDelay = 800; // base ms
  private maxReconnectDelay = 8000; // cap
  private nameToSend?: string;

  constructor(
    url: string,
    onMsg: (m: GameInbound) => void,
    onOpen?: () => void,
    onClose?: () => void,
    onError?: ErrorHandler
  ) {
    this.url = url;
    this.onMsg = onMsg;
    this.onOpen = onOpen;
    this.onClose = onClose;
    this.onError = onError;
  }

  connect(name?: string) {
    this.nameToSend = name ?? this.nameToSend;
    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.onopen = () => {
      if ((this as any)._debug) console.log("[WS] open", this.url);
      this.onOpen?.();
      if (this.nameToSend) this.send({ type: "join", name: this.nameToSend });
    };

    ws.onmessage = (e) => {
      if ((this as any)._debug) console.log("[WS] raw", e.data);
      let data: GameInbound | undefined;
      try {
        data = JSON.parse(e.data);
      } catch (err) {
        console.warn("[WS] parse error", err);
        return;
      }

      // Handle server-declared errors upfront
      if (data && data.type === "error") {
        const { code, message, limit } = data as Extract<GameInbound, { type: "error" }>;
        // Surface via callback or fallback alert
        if (this.onError) this.onError({ code, message, limit });
        else {
          // Minimal UX; feel free to swap with your toast system
          alert(message + (limit ? ` (limit: ${limit})` : ""));
        }
        return; // let normal close event decide reconnect behavior
      }

      // Normal flow
      if (data) this.onMsg(data);
    };

    ws.onclose = (ev) => {
      if ((this as any)._debug) console.log("[WS] close", ev.code, ev.reason);
      this.onClose?.();

      // Hard denials: don't auto-reconnect
      // 4001 room full, 4002 too many tabs, 4401 unauthorized, 4403 forbidden
      if ([4001, 4002, 4401, 4403].includes(ev.code)) {
        this.reconnect = false;
        // If server didn't send an error payload earlier, emit something here
        if (this.onError) {
          const msg =
            ev.code === 4001
              ? "This game session is full."
              : ev.code === 4002
              ? "Too many concurrent connections. Close another tab and retry."
              : ev.code === 4401
              ? "Authentication required."
              : "You do not have access.";
          this.onError({ code: ev.code, message: msg });
        }
        return;
      }

      if (this.reconnect) {
        // jittered backoff
        const jitter = Math.random() * 0.25 + 0.9; // 0.9..1.15x
        const delay = Math.min(this.reconnectDelay * jitter, this.maxReconnectDelay);
        setTimeout(() => this.connect(this.nameToSend), delay);
        // exponential up to cap
        this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, this.maxReconnectDelay);
      }
    };

    ws.onerror = (e: Event) => {
      if ((this as any)._debug) console.log("[WS] error", e);
      // Browser fires 'error' before 'close'; we handle UX in onclose.
    };
  }

  close() {
    this.reconnect = false;
    this.ws?.close();
  }

  send(msg: GameOutbound) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      if ((this as any)._debug) console.log("[WS] send", msg);
      this.ws.send(JSON.stringify(msg));
    }
  }

  // Optional helper to toggle debug logs
  setDebug(enabled: boolean) {
    (this as any)._debug = enabled;
  }
}
