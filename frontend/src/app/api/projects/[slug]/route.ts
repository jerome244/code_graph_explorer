import { NextResponse } from "next/server";
import { proxyWithAuth } from "../../_proxy";

type Ctx = { params: { slug: string } };

export async function GET(_req: Request, { params }: Ctx) {
  const r = await proxyWithAuth(new Request(""), `/api/projects/${params.slug}/`);
  const data = await r.json();
  return NextResponse.json(data, { status: r.status });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const body = await req.text();
  const r = await proxyWithAuth(req, `/api/projects/${params.slug}/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body,
  });
  const data = await r.json();
  return NextResponse.json(data, { status: r.status });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const r = await proxyWithAuth(new Request(""), `/api/projects/${params.slug}/`, { method: "DELETE" });
  const text = await r.text();
  return new NextResponse(text, { status: r.status });
}
