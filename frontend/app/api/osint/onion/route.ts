import { NextRequest, NextResponse } from "next/server";


const BACKEND = process.env.API_BASE || process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";


export async function GET(req: NextRequest) {
const { searchParams } = new URL(req.url);
const q = searchParams.get("q") || "";
const r = await fetch(`${BACKEND}/api/darkweb/search?q=${encodeURIComponent(q)}`, { cache: "no-store" });
const data = await r.json().catch(() => ([]));
return NextResponse.json(data, { status: r.status });
}


export async function POST(req: NextRequest) {
const body = await req.json().catch(() => ({}));
const r = await fetch(`${BACKEND}/api/darkweb/crawl`, {
method: "POST",
headers: { "content-type": "application/json" },
body: JSON.stringify(body),
});
const data = await r.json().catch(() => ({}));
return NextResponse.json(data, { status: r.status });
}
