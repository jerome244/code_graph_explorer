// frontend/app/api/pico/route.ts
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic"; // disable caching; always run server-side

function isPrivateIPv4(host: string) {
  const m = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const [a, b] = m.slice(1).map(Number);
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local
  return false;
}

function isAllowedHost(host: string) {
  // Allow common local patterns: RFC1918 IPv4, loopback, and mDNS .local
  return isPrivateIPv4(host) || host.endsWith(".local");
}

async function proxyGet(urlStr: string) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 5000); // 5s timeout

  try {
    const res = await fetch(urlStr, { method: "GET", signal: controller.signal });
    const contentType = res.headers.get("content-type") ?? "text/plain; charset=utf-8";
    const body = await res.text().catch(() => "");
    return new NextResponse(body, {
      status: res.status,
      headers: { "content-type": contentType },
    });
  } catch (err: any) {
    const msg = typeof err?.message === "string" ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 502 });
  } finally {
    clearTimeout(t);
  }
}

// GET /api/pico?u=http://192.168.1.131/LED_BUILTIN/ON
export async function GET(req: NextRequest) {
  const uParam = req.nextUrl.searchParams.get("u");
  if (!uParam) return NextResponse.json({ error: "Missing 'u' parameter" }, { status: 400 });

  let url: URL;
  try {
    url = new URL(uParam);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }
  if (url.protocol !== "http:") {
    return NextResponse.json({ error: "Only http:// targets are allowed" }, { status: 400 });
  }
  if (!isAllowedHost(url.hostname)) {
    return NextResponse.json({ error: "Target host not allowed" }, { status: 400 });
  }
  return proxyGet(url.toString());
}

// POST /api/pico  { "url": "http://192.168.1.131/LED_BUILTIN/ON" }
export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const uParam = body?.url;
  if (typeof uParam !== "string") {
    return NextResponse.json({ error: "Body must include string 'url'" }, { status: 400 });
  }

  let url: URL;
  try {
    url = new URL(uParam);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }
  if (url.protocol !== "http:") {
    return NextResponse.json({ error: "Only http:// targets are allowed" }, { status: 400 });
  }
  if (!isAllowedHost(url.hostname)) {
    return NextResponse.json({ error: "Target host not allowed" }, { status: 400 });
  }

  return proxyGet(url.toString());
}
