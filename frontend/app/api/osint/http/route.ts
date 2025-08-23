import { NextResponse } from "next/server";
export const dynamic = "force-dynamic"; export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url") || "";
  if (!/^https?:\/\//i.test(url)) return NextResponse.json({ error: "Provide absolute http(s) URL" }, { status: 400 });
  try {
    const res = await fetch(url, { redirect: "follow", cache: "no-store" });
    const finalUrl = res.url || url;
    const headers: Record<string,string> = {};
    res.headers.forEach((v, k) => { headers[k] = v; });

    // Try get a small slice of HTML to extract <title>
    let title = "";
    try {
      const buf = await res.arrayBuffer();
      const dec = new TextDecoder("utf-8", { fatal: false });
      const text = dec.decode(buf).slice(0, 20000);
      const m = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      if (m) title = m[1].replace(/\s+/g, " ").trim();
    } catch { /* ignore */ }

    const techHints: string[] = [];
    const hdr = (k: string) => headers[k.toLowerCase()];
    if (hdr("server")) techHints.push(`Server: ${hdr("server")}`);
    if (hdr("x-powered-by")) techHints.push(`X-Powered-By: ${hdr("x-powered-by")}`);
    if (hdr("via")) techHints.push(`Via: ${hdr("via")}`);
    if (hdr("cf-ray")) techHints.push("Cloudflare (cf-ray)");
    if (hdr("x-aspnet-version")) techHints.push(`ASP.NET ${hdr("x-aspnet-version")}`);
    if (title) techHints.push(`Title: ${title}`);

    return NextResponse.json({ finalUrl, status: res.status, ok: res.ok, headers, title, techHints });
  } catch (e:any) {
    return NextResponse.json({ error: e.message }, { status: 200 });
  }
}
