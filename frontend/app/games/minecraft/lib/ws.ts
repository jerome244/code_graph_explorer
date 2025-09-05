// lib/ws.ts
type Vec3 = { x: number; y: number; z: number };

export type GameInbound =
  | { type: "welcome"; session: string; you: { id: string; username: string }; players: Record<string, { username: string; last_seen: string }>; time: string }
  | { type: "player_join"; player: { id: string; username?: string }; time: string }
  | { type: "player_leave"; player: { id: string }; time: string }
  | { type: "player_move"; player: { id: string }; pos: Vec3; time: string }
  | { type: "block_place"; player: { id: string }; block: { x: number; y: number; z: number; kind: any }; time: string }
  | { type: "block_remove"; player: { id: string }; x: number; y: number; z: number; time: string }
  | { type: "chat"; player: { id: string; username?: string }; message: string; time: string };

export type GameOutbound =
  | { type: "join"; name?: string }
  | { type: "move"; x: number; y: number; z: number }
  | { type: "place_block"; x: number; y: number; z: number; block: any }
  | { type: "remove_block"; x: number; y: number; z: number }
  | { type: "chat"; message: string }
  | { type: "ping" };

export class GameSocket {
  private ws?: WebSocket;
  private url: string;
  private onMsg: (msg: GameInbound) => void;
  private onOpen?: () => void;
  private onClose?: () => void;
  private reconnect = true;
  private reconnectDelay = 800;

  constructor(url: string, onMsg: (m: GameInbound) => void, onOpen?: () => void, onClose?: () => void) {
    this.url = url;
    this.onMsg = onMsg;
    this.onOpen = onOpen;
    this.onClose = onClose;
  }

  connect(name?: string) {
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => {
      if ((this as any)._debug) console.log("[WS] open", this.url);
      this.onOpen?.();
      if (name) this.send({ type: "join", name });
    };
    ws.onmessage = (e) => {
      if ((this as any)._debug) console.log("[WS] raw", e.data);
      try {
        const data = JSON.parse(e.data);
        this.onMsg(data);
      } catch (err) {
        console.warn("[WS] parse error", err);
      }
    };
    ws.onclose = (ev) => {
      if ((this as any)._debug) console.log("[WS] close", ev.code, ev.reason);
      this.onClose?.();
      if (this.reconnect) setTimeout(() => this.connect(name), this.reconnectDelay);
    };
    ws.onerror = (e) => {
      if ((this as any)._debug) console.log("[WS] error", e);
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
}
