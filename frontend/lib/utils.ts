import { cookies } from "next/headers";

export const ACCESS_COOKIE = "access_token";
export const REFRESH_COOKIE = "refresh_token";

export function getBaseUrl() {
  const base = process.env.DJANGO_API_URL;
  if (!base) {
    throw new Error("DJANGO_API_URL is not set. Create .env.local with DJANGO_API_URL=http://localhost:8000");
  }
  return base.replace(/\/$/, "");
}

export function getAccessTokenFromCookies() {
  const store = cookies();
  const token = store.get(ACCESS_COOKIE)?.value;
  return token;
}

export function getRefreshTokenFromCookies() {
  const store = cookies();
  const token = store.get(REFRESH_COOKIE)?.value;
  return token;
}
