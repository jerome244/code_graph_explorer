// lib/ws.ts
/**
 * Resolve the base WebSocket URL for the app.
 * - Prefers explicit env overrides (NEXT_PUBLIC_WS_URL or NEXT_PUBLIC_DJANGO_WS_BASE)
 * - Falls back to DJANGO_API_BASE (http->ws)
 * - In the browser, derives from current location (wss on https, ws otherwise)
 * - In SSR/Node, defaults to ws://localhost:8000
 *
 * Always returns a string with NO trailing slash.
 */
export function wsBase(): string {
  // 1) Public envs (browser/server)
  const fromEnv =
    process.env.NEXT_PUBLIC_WS_URL ||
    process.env.NEXT_PUBLIC_DJANGO_WS_BASE ||
    (process.env.DJANGO_API_BASE
      ? process.env.DJANGO_API_BASE.replace(/^http/, "ws")
      : null);

  if (fromEnv) return fromEnv.replace(/\/$/, "");

  // 2) Browser-derived (dev/production)
  if (typeof window !== "undefined") {
    const isDevLocal =
      window.location.hostname === "localhost" &&
      (window.location.port === "3000" || window.location.port === "3001");

    if (isDevLocal) return "ws://localhost:8000";

    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    return `${proto}://${window.location.host}`;
  }

  // 3) SSR/Node fallback
  return "ws://localhost:8000";
}

/**
 * Convenience: build a room websocket URL with optional JWT token.
 * Returns something like: `${wsBase()}/ws/mc/<room>/?token=...`
 */
export function wsRoomUrl(room: string, token?: string): string {
  const base = wsBase();
  const qs = token ? `?token=${encodeURIComponent(token)}` : "";
  return `${base}/ws/mc/${encodeURIComponent(room)}/${qs}`;
}
