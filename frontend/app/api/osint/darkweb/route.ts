import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q");
    const type = searchParams.get("type");
    const base = process.env.DJANGO_API_BASE; // e.g. http://127.0.0.1:8000

    if (!base) {
      return NextResponse.json(
        { error: "Server misconfigured: DJANGO_API_BASE is missing" },
        { status: 500 }
      );
    }

    if (!q) {
      return NextResponse.json(
        { error: "Missing q parameter" },
        { status: 400 }
      );
    }

    const upstream = await fetch(
      `${base}/api/osint/darkweb?q=${encodeURIComponent(
        q
      )}&type=${encodeURIComponent(type || "")}`,
      { method: "GET", cache: "no-store" }
    );

    const payload = await upstream
      .json()
      .catch(() => ({ error: "Invalid JSON from upstream" }));

    return NextResponse.json(payload, { status: upstream.status });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Proxy error" },
      { status: 500 }
    );
  }
}
