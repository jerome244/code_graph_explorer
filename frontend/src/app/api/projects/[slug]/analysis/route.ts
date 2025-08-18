import { NextResponse } from "next/server";
import { getAccessToken } from "@/lib/jwt";

type Ctx = { params: { slug: string } };

export async function GET(_req: Request, { params }: Ctx) {
  const DJANGO = process.env.DJANGO_API_BASE_URL!;
  const access = getAccessToken();
  const r = await fetch(`${DJANGO}/api/projects/${params.slug}/analysis/latest/`, {
    headers: access ? { Authorization: `Bearer ${access}` } : undefined,
    cache: "no-store",
  });
  const body = await r.text();
  try { return NextResponse.json(JSON.parse(body), { status: r.status }); }
  catch { return new NextResponse(body, { status: r.status }); }
}
