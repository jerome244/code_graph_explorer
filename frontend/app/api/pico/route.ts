// frontend/app/api/pico/route.ts
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function isPrivateIPv4(host: string) {
  const m = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const oct = m.slice(1).map(Number);
  const [a, b] = oct;
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local
  return false;
}
function isAllowedHost(host: string) {
  // Allow RFC1918 IPv4, loopback, and .local (mDNS)
  return isPrivateIPv4(host) || host.endsWith(".local");
}

async function proxyGet(urlStr: string) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 10000); // 10s to make debugging easier

  try {
    const res = await fetch(urlStr, { method: "GET", signal: controller.signal });
    const ct = res.headers.get("content-type") ?? "text/plain; charset=utf-8";
    const body = await res.text().catch(() => "");
    return new NextResponse(body, { status: res.status, headers: { "content-type": ct } });
  } catch (err: any) {
    // Surface the actual Node error; also log it to the server console
    const message = typeof err?.message === "string" ? err.message : String(err);
    console.error("[/api/pico] fetch error:", message);
    return NextResponse.json({ error: message }, { status: 502 });
  } finally {
    clearTimeout(t);
  }
}

function parseUrl(uParam: string | null) {
  if (!uParam) return { error: "Missing 'u' parameter" };
  try {
    const url = new URL(uParam);
    if (url.protocol !== "http:") return { error: "Only http:// targets are allowed" };
    if (!isAllowedHost(url.hostname)) return { error: "Target host not allowed" };
    return { url };
  } catch {
    return { error: "Invalid URL" };
  }
}

// GET /api/pico?u=http://192.168.1.131/LED_BUILTIN/ON
export async function GET(req: NextRequest) {
  const { url, error } = parseUrl(req.nextUrl.searchParams.get("u"));
  if (error) return NextResponse.json({ error }, { status: 400 });
  return proxyGet(url!.toString());
}

// POST /api/pico  { "url": "http://192.168.1.131/LED_BUILTIN/ON" }
export async function POST(req: NextRequest) {
  let uParam: unknown;
  try {
    ({ url: uParam } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof uParam !== "string") {
    return NextResponse.json({ error: "Body must include string 'url'" }, { status: 400 });
  }
  const { url, error } = parseUrl(uParam);
  if (error) return NextResponse.json({ error }, { status: 400 });
  return proxyGet(url!.toString());
}
