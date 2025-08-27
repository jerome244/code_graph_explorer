import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL || "http://localhost:8000";

export async function GET() {
  const access = cookies().get("access")?.value;
  if (!access) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const r = await fetch(`${BACKEND}/api/projects/`, {
    headers: { Authorization: `Bearer ${access}` },
    cache: "no-store",
  });
  const data = await r.json().catch(() => ([]));
  return NextResponse.json(data, { status: r.status });
}