// app/api/projects/route.ts
import { NextRequest, NextResponse } from "next/server";
import { API_BASE, ACCESS } from "../users/_utils";

export const runtime = "nodejs";

function authHeader(req: NextRequest) {
  const access = req.cookies.get(ACCESS)?.value;
  if (!access) return null;
  return { Authorization: `Bearer ${access}` };
}

export async function GET(req: NextRequest) {
  const headers = authHeader(req);
  if (!headers) return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  const qs = req.nextUrl.search || "";
  const r = await fetch(`${API_BASE}/api/projects/${qs}`, { headers });
  const data = await r.json().catch(() => ({}));
  return NextResponse.json(data, { status: r.status });
}

export async function POST(req: NextRequest) {
  const headers = authHeader(req);
  if (!headers) return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  const qs = req.nextUrl.search || ""; // ⬅️ forward ?overwrite=1
  const body = await req.json().catch(() => ({}));
  const r = await fetch(`${API_BASE}/api/projects/${qs}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  // pass through JSON or text cleanly
  const text = await r.text();
  try { return NextResponse.json(JSON.parse(text), { status: r.status }); }
  catch { return new NextResponse(text, { status: r.status }); }
}
