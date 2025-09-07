// Node runtime proxy for LAN devices; resolves .local, returns clear errors.
import { NextRequest, NextResponse } from "next/server";
import dns from "node:dns/promises";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isPrivateIPv4(host: string) {
  const m = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const [a, b] = m.slice(1).map(Number);
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  return false;
}
function isAllowedHost(host: string) {
  return isPrivateIPv4(host) || host.endsWith(".local");
}

async function resolveToIPv4(u: URL): Promise<URL> {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(u.hostname)) return u;
  try {
    const { address, family } = await dns.lookup(u.hostname, { family: 4 });
    if (family === 4) {
      return new URL(`${u.protocol}//${address}${u.pathname}${u.search}`);
    }
  } catch {}
  return u;
}

async function proxyGET(urlStr: string) {
  const orig = new URL(urlStr);
  if (orig.protocol !== "http:") return NextResponse.json({ error: "Only http:// targets are allowed" }, { status: 400 });
  if (!isAllowedHost(orig.hostname)) return NextResponse.json({ error: "Target host not allowed" }, { status: 400 });

  const target = await resolveToIPv4(orig);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000); // 20s
  const t0 = Date.now();

  try {
    const res = await fetch(target.toString(), { method: "GET", signal: controller.signal });
    const ct = res.headers.get("content-type") ?? "text/plain; charset=utf-8";
    const body = await res.text().catch(() => "");
    return new NextResponse(body, { status: res.status, headers: { "content-type": ct } });
  } catch (err: any) {
    const ms = Date.now() - t0;
    const message = String(err?.message || err);
    console.error("[/api/pico] fetch error:", message, `(${ms}ms)`, "->", target.toString());
    const hint = message.includes("abort") || message.includes("timed out")
      ? "Timeout: device offline, wrong IP, or LAN blocked by firewall/container."
      : "Network error: wrong host, DNS for .local failed, or LAN unreachable.";
    return NextResponse.json({ error: message, hint, tried: target.toString(), duration_ms: ms }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get("u");
  if (!u) return NextResponse.json({ error: "Missing 'u' parameter" }, { status: 400 });
  return proxyGET(u);
}

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (typeof body?.url !== "string") return NextResponse.json({ error: "Body must include string 'url'" }, { status: 400 });
  return proxyGET(body.url);
}
