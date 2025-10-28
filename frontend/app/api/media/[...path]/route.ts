// frontend/app/api/media/[...path]/route.ts
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

function upstreamUrl(req: NextRequest, pathSegs: string[]) {
  const base = (process.env.DJANGO_API_BASE || "").replace(/\/$/, "");
  const search = new URL(req.url).search || "";
  // Rebuild to: {DJANGO_API_BASE}/media/<...path>?<qs>
  return `${base}/media/${encodeURI(pathSegs.join("/"))}${search}`;
}

async function proxy(req: NextRequest, pathSegs: string[]) {
  const url = upstreamUrl(req, pathSegs);
  const res = await fetch(url, {
    // Don’t cache at Next layer, let the upstream decide.
    cache: "no-store",
  });

  // Stream body + pass through critical headers
  const headers = new Headers();
  const ct = res.headers.get("content-type");
  if (ct) headers.set("content-type", ct);
  const cc = res.headers.get("cache-control");
  if (cc) headers.set("cache-control", cc);
  // Allow range requests for images/videos (optional)
  const acceptRanges = res.headers.get("accept-ranges");
  if (acceptRanges) headers.set("accept-ranges", acceptRanges);
  const contentRange = res.headers.get("content-range");
  if (contentRange) headers.set("content-range", contentRange);

  return new Response(res.body, { status: res.status, headers });
}

export async function GET(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxy(req, params.path || []);
}

export async function HEAD(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxy(req, params.path || []);
}

// Some browsers send OPTIONS for images when upgrading/mixed-content gets weird.
// Return 200 so the request proceeds cleanly.
export async function OPTIONS() {
  return new Response(null, { status: 200 });
}
