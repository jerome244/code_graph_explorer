import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getBaseUrl, ACCESS_COOKIE, REFRESH_COOKIE, getAccessTokenFromCookies, getRefreshTokenFromCookies } from "./utils";

export async function proxyToDjango(
  req: NextRequest,
  djangoPath: string,
  init: RequestInit & { skipAuth?: boolean } = {}
) {
  const base = getBaseUrl();
  const url = `${base}${djangoPath}`;

  const headers = new Headers(init.headers || {});
  headers.set("Accept", headers.get("Accept") || "application/json");

  // Attach bearer if present and not skipped
  const access = getAccessTokenFromCookies();
  if (!init.skipAuth && access && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${access}`);
  }

  const isFormData = req.headers.get("content-type")?.includes("multipart/form-data");
  let body: BodyInit | null = null;

  if (req.method !== "GET" && req.method !== "HEAD") {
    if (isFormData) {
      const fd = await req.formData();
      const out = new FormData();
      for (const [key, value] of fd.entries()) {
        out.append(key, value as any);
      }
      body = out;
      headers.delete("content-type"); // let fetch set correct multipart boundary
    } else if (req.headers.get("content-type")?.includes("application/json")) {
      const json = await req.json();
      body = JSON.stringify(json);
      headers.set("content-type", "application/json");
    } else {
      const buf = await req.arrayBuffer();
      body = buf as any;
    }
  }

  let res = await fetch(url, {
    method: req.method,
    headers,
    body,
    redirect: "manual",
    cache: "no-store",
  });

  // If unauthorized, attempt refresh once
  if (res.status === 401 && !init.skipAuth) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      headers.set("Authorization", `Bearer ${refreshed}`);
      res = await fetch(url, {
        method: req.method,
        headers,
        body,
        redirect: "manual",
        cache: "no-store",
      });
    }
  }

  return res;
}

export async function refreshAccessToken(): Promise<string | null> {
  const base = getBaseUrl();
  const refresh = getRefreshTokenFromCookies();
  if (!refresh) return null;

  const res = await fetch(`${base}/api/auth/token/refresh/`, {
    method: "POST",
    headers: { "content-type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ refresh }),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { access: string };
  // Update cookie
  const store = cookies();
  store.set(ACCESS_COOKIE, data.access, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 60 * 60, // 1h
  });
  return data.access;
}

export function setAuthCookies(access: string, refresh: string) {
  const store = cookies();
  store.set(ACCESS_COOKIE, access, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 60 * 60, // 1 hour
  });
  store.set(REFRESH_COOKIE, refresh, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
}

export function clearAuthCookies() {
  const store = cookies();
  store.delete(ACCESS_COOKIE);
  store.delete(REFRESH_COOKIE);
}
