import { NextRequest } from "next/server";

function joinPath(segments?: string[]) {
  if (!segments || segments.length === 0) return "/";
  return "/" + segments.map((s) => encodeURIComponent(s)).join("/");
}

async function fetchWithTimeout(url: string, ms: number) {
  const ctl = new AbortController();
  const id = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { method: "GET", signal: ctl.signal });
  } finally {
    clearTimeout(id);
  }
}

export async function GET(req: NextRequest, ctx: { params: { path?: string[] } }) {
  const url = new URL(req.url);
  const targetFromQuery = url.searchParams.get("target") || "";
  const targetFromHeader = req.headers.get("x-pico-base") || "";
  let base = (targetFromQuery || targetFromHeader || "").trim();

  if (base && !/^https?:\/\//i.test(base)) base = "http://" + base;
  if (base) base = base.replace(/\/+$/, "");

  const sp = new URLSearchParams(url.searchParams);
  sp.delete("target");

  // NEW: timeout override (?t=ms), default 8000 ms
  const t = Number(url.searchParams.get("t")) || 8000;
  sp.delete("t");

  if (!base) {
    return new Response(
      JSON.stringify({ error: "Missing 'target'. Add ?target=http://<ip-or-host>" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const picoPath = joinPath(ctx.params?.path);
  const forwardUrl = sp.toString()
    ? `${base}${picoPath}?${sp.toString()}`
    : `${base}${picoPath}`;

  try {
    const r = await fetchWithTimeout(forwardUrl, t);
    const body = await r.arrayBuffer();
    const headers = new Headers(r.headers);
    // be explicit: JSON responses are common
    if (!headers.get("content-type")) headers.set("content-type", "application/json");
    // add no-store to avoid caches during rapid toggles
    headers.set("cache-control", "no-store");
    return new Response(body, { status: r.status, headers });
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: e?.message || "Failed to reach Pico", target: base, path: picoPath }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Pico-Base",
    },
  });
}
