export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { proxyToDjango } from "@/lib/api";

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const res = await proxyToDjango(req, `/api/projects/${params.slug}/`);
  const body = await res.text();
  return new NextResponse(body, { status: res.status, headers: { "content-type": res.headers.get("content-type") || "application/json" } });
}

export async function PATCH(req: NextRequest, { params }: { params: { slug: string } }) {
  const res = await proxyToDjango(req, `/api/projects/${params.slug}/`);
  const body = await res.text();
  return new NextResponse(body, { status: res.status, headers: { "content-type": res.headers.get("content-type") || "application/json" } });
}

export async function DELETE(req: NextRequest, { params }: { params: { slug: string } }) {
  const res = await proxyToDjango(req, `/api/projects/${params.slug}/`);
  const body = await res.text();
  return new NextResponse(body, { status: res.status, headers: { "content-type": res.headers.get("content-type") || "application/json" } });
}
