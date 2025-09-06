import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const base = process.env.DJANGO_API_BASE; // e.g. http://127.0.0.1:8000

    if (!base) {
      return NextResponse.json(
        { error: "Server misconfigured: DJANGO_API_BASE is missing" },
        { status: 500 }
      );
    }

    const upstream = await fetch(`${base}/api/osint/scan/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });

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
