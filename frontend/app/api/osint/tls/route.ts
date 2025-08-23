import { NextResponse } from "next/server";
export const dynamic = "force-dynamic"; export const runtime = "nodejs";

// Proxies SSL Labs public API (rate-limited). We don't loop here; client can poll.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const host = (searchParams.get("host") || "").trim();
  if (!host) return NextResponse.json({ error: "Missing host" }, { status: 400 });

  const params = new URLSearchParams({
    host,
    publish: "off",
    fromCache: searchParams.get("fromCache") || "on",
    all: "done",
    startNew: searchParams.get("startNew") || "on",
  });

  try {
    const res = await fetch(`https://api.ssllabs.com/api/v3/analyze?${params.toString()}`, { cache: "no-store" });
    const text = await res.text();
    return NextResponse.json(JSON.parse(text));
  } catch (e:any) {
    return NextResponse.json({ error: String(e) }, { status: 200 });
  }
}
