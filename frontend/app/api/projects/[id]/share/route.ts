import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL || "http://localhost:8000";

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const access = cookies().get("access")?.value;
  if (!access) return NextResponse.json({ detail: "Unauthenticated" }, { status: 401 });

  const id = ctx.params.id;
  const r = await fetch(`${BACKEND}/api/projects/${id}/share/`, {
    headers: { Authorization: `Bearer ${access}` },
    cache: "no-store",
  });
  const data = await r.json().catch(() => ([]));
  return NextResponse.json(data, { status: r.status });
}

export async function POST(req: Request, ctx: { params: { id: string } }) {
  const access = cookies().get("access")?.value;
  if (!access) return NextResponse.json({ detail: "Unauthenticated" }, { status: 401 });

  const id = ctx.params.id;
  const payload = await req.json().catch(() => ({}));

  const r = await fetch(`${BACKEND}/api/projects/${id}/share/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${access}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await r.json().catch(() => ({}));
  return NextResponse.json(data, { status: r.status });
}
