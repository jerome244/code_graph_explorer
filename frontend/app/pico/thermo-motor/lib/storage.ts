// frontend/app/pico/thermo-motor/lib/storage.ts
import { AllowItem } from "./types";

export const LS_KEY = "pico_baseURL";
export const LS_ALLOW = "pico_rfid_allow";
export const LS_LOCK = "pico_secure_lock";
export const LS_TTL = "pico_secure_ttl";
export const LS_SESS = "pico_secure_session";
export const LS_LOG = "pico_event_log";
export const LS_LOG_SEEN = "pico_event_seen";

export function readAllow(): AllowItem[] {
  try { return JSON.parse(localStorage.getItem(LS_ALLOW) || "[]"); } catch { return []; }
}
export function isLocked(): boolean { return localStorage.getItem(LS_LOCK) === "1"; }
export function readTTL(): number {
  const n = Number(localStorage.getItem(LS_TTL));
  return Number.isFinite(n) && n > 0 ? n : 300;
}
export function readSession() {
  try {
    const js = JSON.parse(localStorage.getItem(LS_SESS) || "null");
    if (!js) return null;
    if (Date.now() >= js.expiresAt) return null;
    return js as { uid: string; grantedAt: number; expiresAt: number };
  } catch { return null; }
}
export function grantSession(uid: string, ttlSec: number) {
  const now = Date.now();
  localStorage.setItem(LS_SESS, JSON.stringify({
    uid, grantedAt: now, expiresAt: now + ttlSec * 1000,
  }));
}
export function revokeSession() { localStorage.removeItem(LS_SESS); }
