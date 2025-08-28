import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL || "http://localhost:8000";

export async function POST(_req: Request, ctx: { params: { id: string } }) {
  // IMPORTANT: await cookies()
  const cookieStore = await cookies();
  const access = cookieStore.get("access")?.value;
  if (!access) return NextResponse.json({ detail: "Unauthenticated" }, { status: 401 });

  const r = await fetch(`${BACKEND}/api/projects/${ctx.params.id}/ws-ticket/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${access}` },
  });

  const data = await r.json().catch(() => ({}));
  return NextResponse.json(data, { status: r.status });
}
