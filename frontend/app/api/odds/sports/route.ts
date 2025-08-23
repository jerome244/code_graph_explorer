import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

export async function GET() {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Missing ODDS_API_KEY" }, { status: 500 });
  }
  const url = new URL("https://api.the-odds-api.com/v4/sports/");
  url.searchParams.set("apiKey", apiKey);

  const res = await fetch(url.toString(), { cache: "no-store" });
  const text = await res.text();
  if (!res.ok) {
    // Bubble up the actual provider response so you see 401/403/etc.
    return NextResponse.json({ error: `Upstream ${res.status}`, detail: text.slice(0, 500) }, { status: res.status });
  }
  const data = JSON.parse(text);
  return NextResponse.json((data || []).filter((s: any) => s?.active));
}
