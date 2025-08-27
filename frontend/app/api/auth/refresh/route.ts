import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL || "http://localhost:8000";

export async function POST() {
  const refresh = cookies().get("refresh")?.value;
  if (!refresh) return NextResponse.json({ detail: "No refresh token" }, { status: 401 });

  const r = await fetch(`${BACKEND}/api/token/refresh/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh }),
  });
  const data = await r.json();
  if (!r.ok) return NextResponse.json(data, { status: r.status });

  const res = NextResponse.json({ success: true });
  res.cookies.set("access", data.access, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 5,
  });
  return res;
}