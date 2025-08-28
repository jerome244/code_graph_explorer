import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const creds = await req.json();
  const dj = process.env.DJANGO_API_BASE!;
  const r = await fetch(`${dj}/api/auth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(creds),
  });

  if (!r.ok) return new NextResponse(await r.text(), { status: 400 });

  const { access, refresh } = await r.json();
  const secure = process.env.COOKIE_SECURE === "true";

  const res = new NextResponse(null, { status: 204 });
  res.cookies.set("access", access, { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 60 * 30 });
  res.cookies.set("refresh", refresh, { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 60 * 60 * 24 * 7 });
  return res;
}
