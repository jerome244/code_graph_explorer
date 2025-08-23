import { NextResponse } from "next/server";
export const dynamic = "force-dynamic"; export const runtime = "nodejs";

// Requires ODDS_API_KEY-like secret: HIBP_API_KEY in .env.local
// HIBP returns 404 when no breach — we map to empty list.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const email = (searchParams.get("email") || "").trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "Missing email" }, { status: 400 });

  const key = process.env.HIBP_API_KEY;
  if (!key) return NextResponse.json({ error: "HIBP not configured" }, { status: 501 });

  const url = `https://haveibeenpwned.com/api/v3/breachedaccount/${encodeURIComponent(email)}?truncateResponse=true`;
  try {
    const res = await fetch(url, {
      headers: {
        "hibp-api-key": key,
        "user-agent": "OSINT-Lab/1.0 (demo)",
        "accept": "application/json",
      },
      cache: "no-store",
    });
    if (res.status === 404) return NextResponse.json([]);
    const text = await res.text();
    if (!res.ok) return NextResponse.json({ error: `Upstream ${res.status}`, detail: text.slice(0,800) }, { status: res.status });
    const data = JSON.parse(text);
    // Keep fields safe & small
    const out = (data || []).map((b: any) => ({
      Name: b.Name, Domain: b.Domain, BreachDate: b.BreachDate, AddedDate: b.AddedDate, PwnCount: b.PwnCount,
      DataClasses: b.DataClasses, IsVerified: b.IsVerified
    }));
    return NextResponse.json(out);
  } catch (e:any) {
    return NextResponse.json({ error: String(e) }, { status: 200 });
  }
}
