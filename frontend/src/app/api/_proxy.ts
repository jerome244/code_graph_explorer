import { NextResponse } from "next/server";
import { getAccessToken } from "@/lib/jwt";

export async function proxyWithAuth(
  req: Request,
  djangoPath: string,
  opts?: RequestInit
) {
  const DJANGO = process.env.DJANGO_API_BASE_URL!;
  const access = getAccessToken();

  const headers = new Headers(opts?.headers || {});
  if (access) headers.set("Authorization", `Bearer ${access}`);

  // pass through body if present
  const init: RequestInit = {
    method: opts?.method || "GET",
    headers,
    body: opts?.body,
  };

  let r = await fetch(`${DJANGO}${djangoPath}`, init);
  if (r.status !== 401) return r;

  // try refreshing
  const ref = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? ""}/api/auth/refresh`, { method: "POST" });
  if (!ref.ok) return r; // return original 401

  // retry request with new access cookie already set by /auth/refresh
  const access2 = getAccessToken();
  if (access2) headers.set("Authorization", `Bearer ${access2}`);
  r = await fetch(`${DJANGO}${djangoPath}`, { ...init, headers });
  return r;
}
