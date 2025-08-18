import { NextResponse } from "next/server";
import { setAuthCookies } from "@/lib/jwt";

const DJANGO = process.env.DJANGO_API_BASE_URL!;

export async function POST(req: Request) {
  const { username, password } = await req.json();
  const r = await fetch(`${DJANGO}/api/auth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  if (!r.ok) {
    const err = await r.text();
    return NextResponse.json({ error: err || "Login failed" }, { status: 401 });
  }
  const data = await r.json(); // { access, refresh }
  setAuthCookies(data.access, data.refresh);
  return NextResponse.json({ ok: true });
}
