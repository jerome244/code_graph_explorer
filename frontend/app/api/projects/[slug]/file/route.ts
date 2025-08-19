export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { getBaseUrl } from "@/lib/utils";
import { getAccessTokenFromCookies } from "@/lib/utils";

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const base = getBaseUrl();
  const access = getAccessTokenFromCookies();
  const { searchParams } = new URL(req.url);
  const path = searchParams.get("path");
  if (!path) return new NextResponse("Missing ?path", { status: 400 });

  const res = await fetch(`${base}/api/projects/${params.slug}/file?path=${encodeURIComponent(path)}`, {
    headers: {
      Accept: "*/*",
      ...(access ? { Authorization: `Bearer ${access}` } : {}),
    },
    cache: "no-store",
  });

  const headers = new Headers(res.headers);
  headers.delete("set-cookie");
  return new NextResponse(res.body, { status: res.status, headers });
}
