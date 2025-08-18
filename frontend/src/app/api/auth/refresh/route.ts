import { NextResponse } from "next/server";
import { getRefreshToken, setAuthCookies } from "@/lib/jwt";

const DJANGO = process.env.DJANGO_API_BASE_URL!;

export async function POST() {
  const refresh = getRefreshToken();
  if (!refresh) return NextResponse.json({ error: "No refresh" }, { status: 401 });

  const r = await fetch(`${DJANGO}/api/auth/token/refresh/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh }),
  });

  if (!r.ok) return NextResponse.json({ error: "Refresh failed" }, { status: 401 });
  const data = await r.json(); // { access, refresh? (not always) }
  setAuthCookies(data.access, refresh);
  return NextResponse.json({ ok: true });
}
