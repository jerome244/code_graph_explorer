import { NextResponse } from "next/server";
export const dynamic = "force-dynamic"; export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const domain = (searchParams.get("domain") || "").trim().toLowerCase();
  if (!domain) return NextResponse.json({ rows: [] });

  const url = `https://crt.sh/?q=%25.${encodeURIComponent(domain)}&output=json`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    const text = await res.text();
    // crt.sh returns JSON or sometimes text/html (rate limit). Try parse array.
    let data: any[] = [];
    try { data = JSON.parse(text); } catch { data = []; }
    const set = new Set<string>();
    for (const row of data) {
      const cn = String(row?.common_name || "");
      const n = String(row?.name_value || "");
      [cn, ...n.split("\n")].forEach((h) => {
        const host = h.trim().toLowerCase();
        if (!host || host.startsWith("*.") || host.includes("@")) return;
        if (host.endsWith(`.${domain}`) || host === domain) set.add(host);
      });
    }
    return NextResponse.json({ rows: Array.from(set).sort().map((name) => ({ name })) });
  } catch (e:any) {
    return NextResponse.json({ rows: [], error: e.message }, { status: 200 });
  }
}
