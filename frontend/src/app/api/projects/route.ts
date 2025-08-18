import { NextResponse } from "next/server";
import { proxyWithAuth } from "../_proxy";

export async function GET() {
  const r = await proxyWithAuth(new Request(""), "/api/projects/");
  const data = await r.json();
  return NextResponse.json(data, { status: r.status });
}

export async function POST(req: Request) {
  const body = await req.text();
  const r = await proxyWithAuth(req, "/api/projects/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  const data = await r.json();
  return NextResponse.json(data, { status: r.status });
}
