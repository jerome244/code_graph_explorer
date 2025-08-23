import { NextResponse } from "next/server";
export const dynamic = "force-dynamic"; export const runtime = "nodejs";

const CF = "https://cloudflare-dns.com/dns-query";

async function q(name: string, type: string) {
  const u = new URL(CF);
  u.searchParams.set("name", name);
  u.searchParams.set("type", type);
  const res = await fetch(u.toString(), { headers: { accept: "application/dns-json" }, cache: "no-store" });
  if (!res.ok) throw new Error(`DoH ${type} ${res.status}`);
  return res.json();
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const domain = (searchParams.get("domain") || "").trim().toLowerCase();
  if (!domain) return NextResponse.json({ errors: ["Missing domain"] }, { status: 400 });

  const out: any = { errors: [] as string[] };
  try { out.a = (await q(domain, "A")).Answer || []; } catch (e:any){ out.errors.push(e.message); }
  try { out.aaaa = (await q(domain, "AAAA")).Answer || []; } catch (e:any){ out.errors.push(e.message); }
  try { out.mx = (await q(domain, "MX")).Answer || []; } catch (e:any){ out.errors.push(e.message); }
  try { out.ns = (await q(domain, "NS")).Answer || []; } catch (e:any){ out.errors.push(e.message); }
  try { out.txt = (await q(domain, "TXT")).Answer || []; } catch (e:any){ out.errors.push(e.message); }

  // SPF
  const txts: string[] = (out.txt || []).map((r: any) => String(r.data || "").replace(/^"|"$/g, "").replace(/"\s+"/g, ""));
  const spf = txts.find((t: string) => /^v=spf1\b/i.test(t));
  out.spf = spf ? { present: true, record: spf } : { present: false };

  // DMARC
  try { out.dmarc = (await q(`_dmarc.${domain}`, "TXT")).Answer || []; } catch (e:any){ /* ignore */ }

  return NextResponse.json(out);
}
