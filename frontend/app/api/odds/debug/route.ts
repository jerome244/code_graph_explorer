import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const key = process.env.ODDS_API_KEY || "";
  const hasKey = !!key;
  const masked = hasKey ? `${key.slice(0,3)}…${key.slice(-3)} (len=${key.length})` : null;

  // Try calling the sports endpoint to surface the real upstream error
  let upstream: any = null;
  try {
    if (hasKey) {
      const url = new URL("https://api.the-odds-api.com/v4/sports/");
      url.searchParams.set("apiKey", key);
      const res = await fetch(url.toString(), { cache: "no-store" });
      const text = await res.text();
      upstream = { status: res.status, ok: res.ok, sample: text.slice(0, 280) };
    }
  } catch (e: any) {
    upstream = { error: String(e) };
  }

  return NextResponse.json({
    hasKey,
    keyPreview: masked,   // never returns the full key
    runtime: process.env.NEXT_RUNTIME || "node",
    nodeVersion: process.version,
    upstream,
  });
}
