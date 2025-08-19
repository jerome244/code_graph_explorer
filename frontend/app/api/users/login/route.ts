// app/api/users/login/route.ts
import { NextRequest, NextResponse } from "next/server";
import { API_BASE, ACCESS, REFRESH, cookieOptions } from "../_utils"; // <-- fix

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const res = await fetch(`${API_BASE}/api/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({} as any));
  if (!res.ok) return NextResponse.json(data, { status: res.status });

  const access = data.access as string;
  const refresh = data.refresh as string;

  const resp = NextResponse.json({ ok: true });
  resp.cookies.set(ACCESS, access, cookieOptions(60 * 30));
  resp.cookies.set(REFRESH, refresh, cookieOptions(60 * 60 * 24 * 7));
  return resp;
}
