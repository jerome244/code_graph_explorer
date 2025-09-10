import { NextRequest } from "next/server";

// Ensure Node runtime (more forgiving with AbortController)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function joinPath(segments?: string[]) {
  if (!segments || segments.length === 0) return "/";
  return "/" + segments.map((s) => encodeURIComponent(s)).join("/");
}

// Fetch with timeout + 1 retry on abort/network error
async function fetchWithTimeout(url: string, ms: number) {
  const attempt = async () => {
    const ctl = new AbortController();
    const id = setTimeout(() => ctl.abort(), ms);
    try {
      return await fetch(url, {
        method: "GET",
        signal: ctl.signal,
        cache: "no-store",
        // Avoid socket reuse on tiny HTTP stacks after EMI/reset:
        // (Header may be ignored, but helps on Node runtime)
        headers: { Connection: "close", Accept: "application/json, text/plain;q=0.9, */*;q=0.8" },
        // keepalive false is default on Node, explicit here for clarity
        keepalive: false as any,
      });
    } finally {
      clearTimeout(id);
    }
  };

  try {
    return await attempt();
  } catch (e: any) {
    // Retry once after a short pause if it was an abort or network error
    if (e?.name === "AbortError" || e?.code === "ECONNRESET" || e?.code === "UND_ERR") {
      await new Promise((r) => setTimeout(r, 250));
      return await attempt();
    }
    throw e;
  }
}

export async function GET(req: NextRequest, ctx: { params: { path?: string[] } }) {
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
  const rawPath = joinPath(ctx.params?.path);
  const baseHasApi = /\/api$/i.test(base);
  const pathHasApi = /^\/api(\/|$)/i.test(rawPath);

  let devicePath = rawPath;
  if (baseHasApi && pathHasApi) {
    devicePath = rawPath.replace(/^\/api(\/|$)/i, "/");
  } else if (!baseHasApi && !pathHasApi) {
    devicePath = "/api" + rawPath;
  }
  // else: exactly one side has /api → leave as-is

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
