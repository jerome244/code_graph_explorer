export type TermInbound =
  | { type: "ready" }
  | { type: "started"; pid: number; cmd: string }
  | { type: "out"; text: string }
  | { type: "err"; text: string }
  | { type: "info"; message: string }
  | { type: "exit"; code: number }
  | { type: "stopped" }
  | { type: "error"; code?: string; message: string };

export type TermOutbound =
  | { type: "run"; cmd: string; cwd?: string }
  | { type: "stdin"; data: string }
  | { type: "stop" };

type Listener = (msg: TermInbound) => void;

export class TerminalWS {
  private ws: WebSocket | null = null;
  private url: string;
  private token?: string;
  private listeners = new Set<Listener>();
  private reconnectMs = 1500;
  private _closed = false;

  constructor(url: string, token?: string) {
    this.url = url;
    this.token = token;
  }

  connect() {
    this._closed = false;
    const q = this.token
      ? (this.url.includes("?") ? "&" : "?") + "token=" + encodeURIComponent(this.token)
      : "";
    const wsUrl = this.url + q;

    this.ws = new WebSocket(wsUrl);
    this.ws.onclose = () => {
      if (!this._closed) setTimeout(() => this.connect(), this.reconnectMs);
    };
    this.ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        this.listeners.forEach((fn) => fn(msg));
      } catch {}
    };
  }

  close() {
    this._closed = true;
    this.ws?.close();
  }

  on(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  send(msg: TermOutbound) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }
}
