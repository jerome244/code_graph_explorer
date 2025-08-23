// app/api/odds/scores/route.ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Missing ODDS_API_KEY" }, { status: 500 });

  const { searchParams } = new URL(req.url);
  const sport = searchParams.get("sport") || "upcoming";
  const daysFrom = searchParams.get("daysFrom") || "2";

  // https://the-odds-api.com/ (scores endpoint)
  const url = new URL(`https://api.the-odds-api.com/v4/sports/${sport}/scores`);
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("daysFrom", daysFrom);
  url.searchParams.set("dateFormat", "iso");

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: "Upstream error", detail: text }, { status: res.status });
  }
  const data = await res.json();
  return NextResponse.json(data);
}
