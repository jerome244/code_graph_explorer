import { NextResponse } from "next/server";
const BACKEND = process.env.BACKEND_URL || "http://localhost:8000";

export async function POST(req: Request) {
  const payload = await req.json();
  const r = await fetch(`${BACKEND}/api/register/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    return NextResponse.json({ error: data }, { status: r.status });
  }
  return NextResponse.json({ success: true }, { status: 201 });
}