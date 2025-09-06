// frontend/app/api/osint/darkweb/content/route.ts
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const u = searchParams.get("u");
    const base = process.env.DJANGO_API_BASE; // e.g. http://127.0.0.1:8000

    if (!base) {
      return NextResponse.json(
        { error: "Server misconfigured: DJANGO_API_BASE is missing" },
        { status: 500 }
      );
    }
    if (!u) {
      return NextResponse.json({ error: "Missing u parameter" }, { status: 400 });
    }

    const upstream = await fetch(
      `${base}/api/osint/darkweb/content?u=${encodeURIComponent(u)}`,
      { method: "GET", cache: "no-store" }
    );

    // keep it simple like your working route
    const payload = await upstream
      .json()
      .catch(() => ({ ok: false, error: "Invalid JSON from upstream" }));

    return NextResponse.json(payload, { status: upstream.status });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Proxy error" },
      { status: 500 }
    );
  }
}
