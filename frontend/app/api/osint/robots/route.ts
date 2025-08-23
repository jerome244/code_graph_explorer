import { NextResponse } from "next/server";
export const dynamic = "force-dynamic"; export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url") || "";
  if (!/^https?:\/\//i.test(url)) return NextResponse.json({ error: "Provide absolute http(s) URL" }, { status: 400 });
  let robotsUrl = "";
  try {
    const u = new URL(url);
    robotsUrl = `${u.origin}/robots.txt`;
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }
  try {
    const res = await fetch(robotsUrl, { cache: "no-store" });
    const text = await res.text();
    return NextResponse.json({ url: robotsUrl, status: res.status, text: text.slice(0, 20000) });
  } catch (e:any) {
    return NextResponse.json({ url: robotsUrl, status: 0, error: e.message }, { status: 200 });
  }
}
