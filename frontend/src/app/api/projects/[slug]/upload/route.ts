import { NextResponse } from "next/server";
import { getAccessTokenServerServer } from "@/lib/jwt";

export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;                 // ✅ await params
  const DJANGO = process.env.DJANGO_API_BASE_URL || "http://127.0.0.1:8000";
  const access = await getAccessTokenServerServer();       // ✅ await cookies()

  const form = await req.formData();

  const r = await fetch(`${DJANGO}/api/projects/${slug}/upload/`, {
    method: "POST",
    headers: access ? { Authorization: `Bearer ${access}` } : undefined,
    body: form,
  });

  const text = await r.text();
  try { return NextResponse.json(JSON.parse(text), { status: r.status }); }
  catch { return new NextResponse(text, { status: r.status }); }
}
