import { NextRequest, NextResponse } from "next/server";
import { API_BASE, ACCESS, REFRESH, cookieOptions } from "../_utils";

export const runtime = "nodejs";

async function fetchMe(access?: string) {
  const res = await fetch(`${API_BASE}/api/users/me/`, {
    headers: access ? { Authorization: `Bearer ${access}` } : {},
    cache: "no-store",
  });
  return res;
}

export async function GET(req: NextRequest) {
  let access = req.cookies.get(ACCESS)?.value;
  let res = await fetchMe(access);
  if (res.ok) {
    const data = await res.json();
    return NextResponse.json(data);
  }

  // try refresh
  const refresh = req.cookies.get(REFRESH)?.value;
  if (refresh) {
    const r = await fetch(`${API_BASE}/api/token/refresh/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh }),
    });
    if (r.ok) {
      const data = await r.json();
      access = data.access;

      const meRes = await fetchMe(access);
      const me = await meRes.json().catch(() => ({}));

      const resp = NextResponse.json(me, { status: meRes.status });
      resp.cookies.set(ACCESS, access, cookieOptions(60 * 30));
      return resp;
    }
  }

  return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
}
