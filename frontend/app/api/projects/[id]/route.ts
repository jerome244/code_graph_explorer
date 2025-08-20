// app/api/projects/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { API_BASE, ACCESS } from "../../users/_utils";

export const runtime = "nodejs";

function auth(req: NextRequest) {
  const access = req.cookies.get(ACCESS)?.value;
  if (!access) return null;
  return { Authorization: `Bearer ${access}` };
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const headers = auth(_req); if (!headers) return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  const r = await fetch(`${API_BASE}/api/projects/${params.id}/`, { headers });
  const data = await r.json().catch(() => ({}));
  return NextResponse.json(data, { status: r.status });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const headers = auth(req); if (!headers) return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  const body = await req.json();
  const r = await fetch(`${API_BASE}/api/projects/${params.id}/`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  return NextResponse.json(data, { status: r.status });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const headers = auth(req); if (!headers) return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  const r = await fetch(`${API_BASE}/api/projects/${params.id}/`, { method: "DELETE", headers });
  const text = await r.text();
  return new NextResponse(text, { status: r.status, headers: { "Content-Type": "application/json" } });
}
