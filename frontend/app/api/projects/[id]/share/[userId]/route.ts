import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL || "http://localhost:8000";

export async function PATCH(req: Request, ctx: { params: { id: string; userId: string } }) {
  const access = cookies().get("access")?.value;
  if (!access) return NextResponse.json({ detail: "Unauthenticated" }, { status: 401 });

  const { id, userId } = ctx.params;
  const payload = await req.json().catch(() => ({}));

  const r = await fetch(`${BACKEND}/api/projects/${id}/share/${userId}/`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${access}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await r.json().catch(() => ({}));
  return NextResponse.json(data, { status: r.status });
}

export async function DELETE(_req: Request, ctx: { params: { id: string; userId: string } }) {
  const access = cookies().get("access")?.value;
  if (!access) return NextResponse.json({ detail: "Unauthenticated" }, { status: 401 });

  const { id, userId } = ctx.params;

  const r = await fetch(`${BACKEND}/api/projects/${id}/share/${userId}/`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${access}`,
    },
  });

  if (r.status === 204) {
    return new NextResponse(null, { status: 204 });
  }

  const data = await r.json().catch(() => ({}));
  return NextResponse.json(data, { status: r.status });
}
