import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST() {
  const refresh = cookies().get("refresh")?.value;
  if (!refresh) return new NextResponse("No refresh token", { status: 401 });

  const resp = await fetch(`${process.env.DJANGO_API_BASE}/api/auth/token/refresh/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh }),
  });
  if (!resp.ok) return new NextResponse(await resp.text(), { status: 401 });

  const { access } = await resp.json();
  const secure = process.env.COOKIE_SECURE === "true";

  const res = NextResponse.json({ ok: true });
  res.cookies.set("access", access, { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 60 * 30 });
  return res;
}
