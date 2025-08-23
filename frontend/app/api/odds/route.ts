// app/api/odds/route.ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Missing ODDS_API_KEY" }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const sport = searchParams.get("sport") || "upcoming";
  const regions = searchParams.get("regions") || process.env.NEXT_PUBLIC_DEFAULT_ODDS_REGION || "eu";
  const markets = searchParams.get("markets") || "h2h";
  const oddsFormat = searchParams.get("oddsFormat") || "decimal";

  const url = new URL(`https://api.the-odds-api.com/v4/sports/${sport}/odds`);
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("regions", regions);
  url.searchParams.set("markets", markets);
  url.searchParams.set("oddsFormat", oddsFormat);

  const from = searchParams.get("commenceTimeFrom");
  const to = searchParams.get("commenceTimeTo");
  if (from) url.searchParams.set("commenceTimeFrom", from);
  if (to) url.searchParams.set("commenceTimeTo", to);

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: "Upstream error", detail: text }, { status: res.status });
  }
  const data = await res.json();
  return NextResponse.json(data);
}
