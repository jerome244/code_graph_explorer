import { cookies } from "next/headers";

const ACCESS_COOKIE_NAME = process.env.ACCESS_COOKIE_NAME || "access";
const REFRESH_COOKIE_NAME = process.env.REFRESH_COOKIE_NAME || "refresh";
const SECURE = String(process.env.SECURE_COOKIES).toLowerCase() === "true";

export function setAuthCookies(access: string, refresh: string) {
  const jar = cookies();
  // match Django SIMPLE_JWT lifetimes you configured (30m / 7d)
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

export function clearAuthCookies() {
  const jar = cookies();
  jar.delete(ACCESS_COOKIE_NAME);
  jar.delete(REFRESH_COOKIE_NAME);
}

export function getAccessToken() {
  return cookies().get(ACCESS_COOKIE_NAME)?.value;
}
export function getRefreshToken() {
  return cookies().get(REFRESH_COOKIE_NAME)?.value;
}
