import { NextResponse } from "next/server";
import { getAccessToken } from "@/lib/jwt";

type Ctx = { params: { slug: string } };

export async function POST(req: Request, { params }: Ctx) {
  const DJANGO = process.env.DJANGO_API_BASE_URL!;
  const access = getAccessToken();
  const body = await req.text();

  const r = await fetch(`${DJANGO}/api/projects/${params.slug}/import/github/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(access ? { Authorization: `Bearer ${access}` } : {}),
    },
    body,
  });
  const text = await r.text();
  try { return NextResponse.json(JSON.parse(text), { status: r.status }); }
  catch { return new NextResponse(text, { status: r.status }); }
}
