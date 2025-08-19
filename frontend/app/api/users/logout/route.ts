import { NextRequest, NextResponse } from "next/server";
import { API_BASE, ACCESS, REFRESH, cookieOptions } from "../_utils";

export const runtime = "nodejs";

export async function POST(_req: NextRequest) {
  const resp = NextResponse.json({ ok: true });

  // Optionally attempt to blacklist refresh on the Django side
  // We can't read HttpOnly cookie here from client; but the request to this route
  // is same-site, so we can look at the cookie.
  const refresh = _req.cookies.get(REFRESH)?.value;
  if (refresh) {
    try {
      await fetch(`${API_BASE}/api/token/blacklist/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh }),
      });
    } catch {}
  }

  // Clear cookies
  resp.cookies.set(ACCESS, "", { ...cookieOptions(0), maxAge: 0 });
  resp.cookies.set(REFRESH, "", { ...cookieOptions(0), maxAge: 0 });
  return resp;
}
