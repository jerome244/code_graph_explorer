import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL || "http://localhost:8000";

export async function GET() {
  // ✅ must await cookies() in App Router route handlers
  const cookieStore = await cookies();
  const access = cookieStore.get("access")?.value;

  if (!access) {
    return NextResponse.json({ detail: "Unauthenticated" }, { status: 401 });
  }

  try {
    const r = await fetch(`${BACKEND}/api/me/`, {
      headers: { Authorization: `Bearer ${access}` },
      cache: "no-store",
    });

    // If backend returns non-JSON on errors, guard the parse
    let data: unknown;
    const text = await r.text();
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { detail: text || r.statusText };
    }

    return NextResponse.json(data ?? {}, { status: r.status });
  } catch (err) {
    return NextResponse.json(
      { detail: "Upstream error", error: (err as Error).message },
      { status: 502 }
    );
  }
}
