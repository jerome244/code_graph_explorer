import { NextRequest, NextResponse } from "next/server";
import { API_BASE, ACCESS } from "../../../users/_utils";

export const runtime = "nodejs";

function auth(req: NextRequest) {
  const access = req.cookies.get(ACCESS)?.value;
  if (!access) return null;
  return { Authorization: `Bearer ${access}` };
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string, shareId: string } }) {
  const headers = auth(req);
  if (!headers) return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const r = await fetch(`${API_BASE}/api/projects/${params.id}/shares/${params.shareId}/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  try { return NextResponse.json(JSON.parse(text), { status: r.status }); }
  catch { return new NextResponse(text, { status: r.status }); }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string, shareId: string } }) {
  const headers = auth(req);
  if (!headers) return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  const r = await fetch(`${API_BASE}/api/projects/${params.id}/shares/${params.shareId}/`, {
    method: "DELETE",
    headers,
  });
  return new NextResponse(null, { status: r.status });
}
