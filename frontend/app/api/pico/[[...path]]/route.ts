import { NextRequest } from "next/server";

function joinPath(segments?: string[]) {
  if (!segments || segments.length === 0) return "/";
  return "/" + segments.map((s) => encodeURIComponent(s)).join("/");
}

async function fetchWithTimeout(url: string, ms: number) {
  const ctl = new AbortController();
  const id = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { method: "GET", signal: ctl.signal, cache: "no-store" });
  } finally {
    clearTimeout(id);
  }
}

export async function GET(
  req: NextRequest,
  ctx: { params: { path?: string[] } }
) {
  const url = new URL(req.url);

  // Target Pico base comes from header or ?target=...
  const targetFromQuery = url.searchParams.get("target") || "";
  const targetFromHeader = req.headers.get("x-pico-base") || "";
  let base = (targetFromQuery || targetFromHeader || "").trim();

  if (base && !/^https?:\/\//i.test(base)) base = "http://" + base;
  if (base) base = base.replace(/\/+$/, ""); // strip trailing slash

  // Forward all original query params except our control ones
  const sp = new URLSearchParams(url.searchParams);
  sp.delete("target");

  // Timeout override (?t=ms), default 8000 ms
  const t = Number(url.searchParams.get("t")) || 8000;
  sp.delete("t");

  if (!base) {
    return new Response(
      JSON.stringify({ error: "Missing 'target'. Add ?target=http://<ip-or-host>" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // ---- Build device path with /api normalization ----
  // raw examples: "/rfid/last" OR "/api/rfid/last"
  const rawPath = joinPath(ctx.params?.path);
  const baseHasApi = /\/api$/i.test(base);
  const pathHasApi = /^\/api(\/|$)/i.test(rawPath);

  // Ensure exactly ONE "/api" between base and path
  let devicePath = rawPath;
  if (baseHasApi && pathHasApi) {
    // both include /api -> strip it from path
    devicePath = rawPath.replace(/^\/api(\/|$)/i, "/");
  } else if (!baseHasApi && !pathHasApi) {
    // neither includes /api -> add it to path
    devicePath = "/api" + rawPath;
  }
  // else: exactly one side has /api → leave rawPath as-is

  const forwardUrl = sp.toString()
    ? `${base}${devicePath}?${sp.toString()}`
    : `${base}${devicePath}`;

  try {
    const r = await fetchWithTimeout(forwardUrl, t);
    const body = await r.arrayBuffer();
    const headers = new Headers(r.headers);
    if (!headers.get("content-type")) headers.set("content-type", "application/json");
    headers.set("cache-control", "no-store");
    headers.set("access-control-allow-origin", "*");
    return new Response(body, { status: r.status, headers });
  } catch (e: any) {
    return new Response(
      JSON.stringify({
        error: e?.message || "Failed to reach Pico",
        target: base,
        path: devicePath,
        forwarded: forwardUrl,
      }),
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
      "Cache-Control": "no-store",
    },
  });
}
