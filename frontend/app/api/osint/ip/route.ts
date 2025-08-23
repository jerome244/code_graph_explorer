import { NextResponse } from "next/server";
export const dynamic = "force-dynamic"; export const runtime = "nodejs";

// Using ipapi.co (no key for basic fields). Swap for your preferred service if needed.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const ip = (searchParams.get("ip") || "").trim();
  if (!ip) return NextResponse.json({ error: "Missing ip" }, { status: 400 });
  try {
    const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, { cache: "no-store" });
    const data = await res.json();
    const out = {
      ip: data.ip, city: data.city, region: data.region,
      country: data.country, country_name: data.country_name,
      org: data.org, asn: data.asn
    };
    return NextResponse.json(out);
  } catch (e:any) {
    return NextResponse.json({ error: e.message }, { status: 200 });
  }
}
