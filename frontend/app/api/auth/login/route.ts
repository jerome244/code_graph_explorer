import { NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL || "http://localhost:8000";
// Adjust if your Django login path is different:
const BACKEND_LOGIN_PATH = "/api/token/"; // expects { access, refresh }

export async function POST(req: Request) {
  const { username, password } = await req.json().catch(() => ({}));
  if (!username || !password) {
    return NextResponse.json({ detail: "Missing credentials" }, { status: 400 });
  }

  const r = await fetch(`${BACKEND}${BACKEND_LOGIN_PATH}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // IMPORTANT: we proxy credentials; Django should NOT set cookies itself here.
    body: JSON.stringify({ username, password }),
  });

  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    return NextResponse.json(err || { detail: "Login failed" }, { status: r.status });
  }

  const data = await r.json().catch(() => ({} as any));
  const access = (data as any).access;
  const refresh = (data as any).refresh;

  if (!access) {
    return NextResponse.json({ detail: "No access token returned" }, { status: 500 });
  }

  const res = NextResponse.json({ ok: true });

  const secure = process.env.NODE_ENV === "production";
  // Set cookies on the FRONTEND origin so /api/auth/me can read them immediately
  res.cookies.set("access", access, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 60 * 60, // 1h
  });
  if (refresh) {
    res.cookies.set("refresh", refresh, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7d
    });
  }
  return res;
}
