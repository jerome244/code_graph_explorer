import { NextResponse } from "next/server";
import { getAccessTokenServerServer } from "@/lib/jwt";

export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;                 // ✅ await params
  const DJANGO = process.env.DJANGO_API_BASE_URL || "http://127.0.0.1:8000";
  const access = await getAccessTokenServerServer();       // ✅ await cookies()

  const r = await fetch(`${DJANGO}/api/projects/${slug}/analysis/latest/`, {
    headers: access ? { Authorization: `Bearer ${access}` } : undefined,
    cache: "no-store",
  });

  const text = await r.text();
  try { return NextResponse.json(JSON.parse(text), { status: r.status }); }
  catch { return new NextResponse(text, { status: r.status }); }
}
