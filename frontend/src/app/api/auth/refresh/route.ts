import { NextResponse } from "next/server";
import { cookies as nextCookies } from "next/headers";
import { ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME } from "@/lib/jwt";

const SECURE = String(process.env.SECURE_COOKIES).toLowerCase() === "true";

export async function POST() {
  const DJANGO = process.env.DJANGO_API_BASE_URL || "http://127.0.0.1:8000";

  // MUST await cookies() in Route Handlers (Next dynamic API)
  const jar = await nextCookies();
  const refresh = jar.get(REFRESH_COOKIE_NAME)?.value;
  if (!refresh) {
    return NextResponse.json({ detail: "No refresh token" }, { status: 401 });
  }

  // Exchange refresh → access (Django SimpleJWT)
  const r = await fetch(`${DJANGO}/api/auth/refresh/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh }),
  });

  const text = await r.text();
  if (!r.ok) return new NextResponse(text, { status: r.status });

  let data: any;
  try { data = JSON.parse(text); } catch { return new NextResponse(text, { status: r.status }); }

  const access = data?.access;
  if (!access) return NextResponse.json({ detail: "No access in response" }, { status: 500 });

  // Set (or update) access cookie; keep existing refresh cookie as-is
  jar.set(ACCESS_COOKIE_NAME, access, {
    httpOnly: true,
    sameSite: "lax",
    secure: SECURE,
    path: "/",
    maxAge: 60 * 30, // 30m
  });

  return NextResponse.json({ ok: true });
}
