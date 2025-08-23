import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.API_BASE || process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const r = await fetch(`${BACKEND}/api/darkweb/pages/${params.id}`, { cache: "no-store" });
  const text = await r.text();
  try {
    const json = text ? JSON.parse(text) : null;
    return NextResponse.json(json, { status: r.status });
  } catch {
    return new NextResponse(text || "", { status: r.status });
  }
}