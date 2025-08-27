import { NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL || "http://localhost:8000";

export async function POST(req: Request) {
  const { username, password } = await req.json();
  const r = await fetch(`${BACKEND}/api/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = await r.json();
  if (!r.ok) {
    return NextResponse.json({ error: data }, { status: r.status });
  }
  const res = NextResponse.json({ success: true });
  // httpOnly cookies so the browser can't read them
  res.cookies.set("access", data.access, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 5,
  });
  res.cookies.set("refresh", data.refresh, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}