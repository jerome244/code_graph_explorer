import { NextResponse } from "next/server";
import { getAccessToken } from "@/lib/jwt";

type Ctx = { params: { slug: string } };

export async function POST(req: Request, { params }: Ctx) {
  const DJANGO = process.env.DJANGO_API_BASE_URL || "http://127.0.0.1:8000"; // runtime read
  const access = getAccessToken();

  // NOTE: in tests we stub this method (see test)
  const form = await req.formData();

  const r = await fetch(`${DJANGO}/api/projects/${params.slug}/upload/`, {
    method: "POST",
    headers: access ? { Authorization: `Bearer ${access}` } : undefined,
    body: form,
  });

  const body = await r.text();
  try { return NextResponse.json(JSON.parse(body), { status: r.status }); }
  catch { return new NextResponse(body, { status: r.status }); }
}
