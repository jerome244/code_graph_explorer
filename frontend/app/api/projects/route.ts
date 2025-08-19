export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { proxyToDjango } from "@/lib/api";

export async function GET(req: NextRequest) {
  const res = await proxyToDjango(req, "/api/projects/");
  const body = await res.text();
  return new NextResponse(body, { status: res.status, headers: { "content-type": res.headers.get("content-type") || "application/json" } });
}

export async function POST(req: NextRequest) {
  const res = await proxyToDjango(req, "/api/projects/");
  const body = await res.text();
  return new NextResponse(body, { status: res.status, headers: { "content-type": res.headers.get("content-type") || "application/json" } });
}
