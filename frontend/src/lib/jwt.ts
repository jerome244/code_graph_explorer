import { cookies as nextCookies } from "next/headers";

export const ACCESS_COOKIE_NAME =
  process.env.ACCESS_COOKIE_NAME || "access";
export const REFRESH_COOKIE_NAME =
  process.env.REFRESH_COOKIE_NAME || "refresh";
const SECURE = String(process.env.SECURE_COOKIES).toLowerCase() === "true";

/**
 * Route Handlers: must await cookies()
 */
export async function setAuthCookies(access: string, refresh: string) {
  const jar = await nextCookies();
  // match Django SIMPLE_JWT lifetimes (30m / 7d) or your config
  jar.set(ACCESS_COOKIE_NAME, access, {
    httpOnly: true,
    sameSite: "lax",
    secure: SECURE,
    path: "/",
    maxAge: 60 * 30,
  });
  jar.set(REFRESH_COOKIE_NAME, refresh, {
    httpOnly: true,
    sameSite: "lax",
    secure: SECURE,
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearAuthCookies() {
  const jar = await nextCookies();
  jar.delete(ACCESS_COOKIE_NAME);
  jar.delete(REFRESH_COOKIE_NAME);
}

/**
 * Use these in Route Handlers (server-safe, async).
 */
export async function getAccessTokenServerServer() {
  const jar = await nextCookies();
  return jar.get(ACCESS_COOKIE_NAME)?.value;
}
export async function getRefreshTokenServer() {
  const jar = await nextCookies();
  return jar.get(REFRESH_COOKIE_NAME)?.value;
}

/**
 * Legacy sync getters — OK in Server Components only.
 * Do NOT use these inside Route Handlers (will throw the Next error).
 */
export function getAccessTokenServer() {
  return nextCookies().get(ACCESS_COOKIE_NAME)?.value;
}
export function getRefreshToken() {
  return nextCookies().get(REFRESH_COOKIE_NAME)?.value;
}
