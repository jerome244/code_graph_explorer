// app/api/osint/leakcheck/route.ts
import { NextRequest, NextResponse } from "next/server";

/**
 * LeakCheck public endpoint (no key): https://leakcheck.net/api/public?check=<email|user>
 * - Returns plain text, no CORS — so we proxy it server-side.
 * - Please use gently and respect their ToS/rate limits.
 */
export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email") || "";
  const username = req.nextUrl.searchParams.get("username") || "";
  const q = email || username;
  if (!q) {
    return NextResponse.json({ error: "Missing email or username" }, { status: 400 });
  }

  const url = `https://leakcheck.net/api/public?check=${encodeURIComponent(q)}`;

  try {
    const r = await fetch(url, {
      headers: { "user-agent": "osint-lab/1.0" },
      cache: "no-store",
    });

    const text = await r.text(); // public endpoint returns plain text
    // Normalize to a simple JSON signal
    const found = /found|yes|true|pwned|present/i.test(text);
    return NextResponse.json({ found, raw: text.trim() });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "LeakCheck fetch failed" }, { status: 502 });
  }
}
