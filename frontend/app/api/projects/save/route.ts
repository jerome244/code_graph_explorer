import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL || "http://localhost:8000";

export async function POST(req: Request) {
  const access = cookies().get("access")?.value;
  if (!access) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const payload = await req.json().catch(() => null);
  if (!payload || !payload.name || !payload.data) {
    return NextResponse.json({ error: "Missing name or data" }, { status: 400 });
  }

  const file_count = Array.isArray(payload.data?.nodes) ? payload.data.nodes.length : 0;

  const r = await fetch(`${BACKEND}/api/projects/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${access}`,
    },
    body: JSON.stringify({
      name: payload.name,
      data: payload.data,
      file_count,
    }),
  });

  const data = await r.json().catch(() => ({}));
  return NextResponse.json(data, { status: r.status });
}
