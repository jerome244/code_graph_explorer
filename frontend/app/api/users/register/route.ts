import { NextRequest, NextResponse } from "next/server";
import { API_BASE } from "../_utils";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const res = await fetch(`${API_BASE}/api/users/register/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    return NextResponse.json(data, { status: res.status });
  }
  return NextResponse.json({ ok: true, user: data });
}
