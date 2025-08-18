import { NextRequest, NextResponse } from "next/server";

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const { search } = new URL(req.url);
  const upstream = `${process.env.NEXT_PUBLIC_BASE_URL ?? ""}/api/projects/${params.slug}/file${search}`;
  const r = await fetch(upstream, {
    headers: {
      // forward cookies for auth if your Django expects session/JWT cookies
      cookie: req.headers.get("cookie") ?? "",
    },
  });

  const text = await r.text();
  return new NextResponse(text, {
    status: r.status,
    headers: { "Content-Type": r.headers.get("Content-Type") ?? "text/plain; charset=utf-8" },
  });
}
