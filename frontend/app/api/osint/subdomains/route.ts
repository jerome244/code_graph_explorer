import { NextResponse } from "next/server";
export const dynamic = "force-dynamic"; export const runtime = "nodejs";

async function crt(domain: string) {
  try {
    const res = await fetch(`https://crt.sh/?q=%25.${encodeURIComponent(domain)}&output=json`, { cache: "no-store" });
    const text = await res.text();
    let arr: any[] = []; try { arr = JSON.parse(text); } catch { arr = []; }
    const out = new Set<string>();
    for (const row of arr) {
      const cn = String(row?.common_name || "");
      const list = String(row?.name_value || "");
      [cn, ...list.split("\n")].forEach((h) => {
        const host = h.trim().toLowerCase();
        if (!host || host.startsWith("*.") || host.includes("@")) return;
        if (host.endsWith(`.${domain}`) || host === domain) out.add(host);
      });
    }
    return Array.from(out);
  } catch { return []; }
}

async function sonar(domain: string) {
  try {
    const res = await fetch(`https://sonar.omnisint.io/subdomains/${encodeURIComponent(domain)}`, { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data.map((s: string) => s.toLowerCase()) : [];
  } catch { return []; }
}

async function otx(domain: string) {
  try {
    const url = `https://otx.alienvault.com/api/v1/indicators/domain/${encodeURIComponent(domain)}/passive_dns`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    const out = new Set<string>();
    for (const row of data?.passive_dns || []) {
      const h = String(row?.hostname || "").toLowerCase();
      if (h && (h === domain || h.endsWith(`.${domain}`))) out.add(h);
    }
    return Array.from(out);
  } catch { return []; }
}

async function bufferover(domain: string) {
  try {
    const url = `https://dns.bufferover.run/dns?q=.${encodeURIComponent(domain)}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    const set = new Set<string>();
    for (const line of (data?.FDNS_A || []).concat(data?.RDNS || [])) {
      const parts = String(line).split(",");
      const h = (parts[1] || parts[0] || "").toLowerCase();
      if (h && (h === domain || h.endsWith(`.${domain}`))) set.add(h);
    }
    return Array.from(set);
  } catch { return []; }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const domain = (searchParams.get("domain") || "").trim().toLowerCase();
  if (!domain) return NextResponse.json({ error: "Missing domain" }, { status: 400 });

  const [a, b, c, d] = await Promise.all([crt(domain), sonar(domain), otx(domain), bufferover(domain)]);
  const set = new Set<string>([...a, ...b, ...c, ...d]);
  const rows = Array.from(set).sort();
  return NextResponse.json({ count: rows.length, rows });
}
