import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return new Response(null, { status: 204 });
}

export async function GET(req: Request) {
  try {
    const base = process.env.DJANGO_API_BASE; // e.g. http://127.0.0.1:8000
    if (!base) {
      return NextResponse.json(
        { error: "Server misconfigured: DJANGO_API_BASE is missing" },
        { status: 500 }
      );
    }

    const url = new URL(req.url);
    const qs = url.search || ""; // preserves full query string

    const upstream = await fetch(`${base}/api/osint/darkweb${qs}`, {
      method: "GET",
      cache: "no-store",
    });

    const payload = await upstream.json().catch(() => ({
      error: "Invalid JSON from upstream",
    }));

    return NextResponse.json(payload, { status: upstream.status });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Proxy error" },
      { status: 500 }
    );
  }
}
