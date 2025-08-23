import { NextResponse } from "next/server";
export const dynamic = "force-dynamic"; export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const domain = (searchParams.get("domain") || "").trim().toLowerCase();
  if (!domain) return NextResponse.json({ error: "Missing domain" }, { status: 400 });

  try {
    const res = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, { cache: "no-store" });
    const raw = await res.json();
    const registrar = raw?.entities?.find((e: any) => (e?.roles||[]).includes("registrar"))?.vcardArray?.[1]?.find((x: any)=>x?.[0]==="fn")?.[3];
    const nameservers = (raw?.nameservers || []).map((n: any) => ({ ldhName: n.ldhName }));
    const out = {
      handle: raw.handle, ldhName: raw.ldhName,
      status: raw.status, events: raw.events,
      nameservers, registrar, raw
    };
    return NextResponse.json(out);
  } catch (e:any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
