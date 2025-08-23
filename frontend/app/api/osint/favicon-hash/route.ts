import { NextResponse } from "next/server";
export const dynamic = "force-dynamic"; export const runtime = "nodejs";

// MurmurHash3 (x86_32) for strings
function mmh3(str: string, seed = 0) {
  let h1 = seed | 0, k1 = 0, i = 0, remainder = str.length & 3, bytes = str.length - remainder;
  const c1 = 0xcc9e2d51, c2 = 0x1b873593;
  while (i < bytes) {
    k1 = (str.charCodeAt(i) & 0xff) | ((str.charCodeAt(++i) & 0xff) << 8) |
         ((str.charCodeAt(++i) & 0xff) << 16) | ((str.charCodeAt(++i) & 0xff) << 24);
    ++i;
    k1 = Math.imul(k1, c1); k1 = (k1 << 15) | (k1 >>> 17); k1 = Math.imul(k1, c2);
    h1 ^= k1; h1 = (h1 << 13) | (h1 >>> 19); h1 = Math.imul(h1, 5) + 0xe6546b64;
  }
  k1 = 0;
  if (remainder === 3) { k1 ^= (str.charCodeAt(i + 2) & 0xff) << 16; }
  if (remainder >= 2) { k1 ^= (str.charCodeAt(i + 1) & 0xff) << 8; }
  if (remainder >= 1) { k1 ^= (str.charCodeAt(i) & 0xff); k1 = Math.imul(k1, c1); k1 = (k1 << 15) | (k1 >>> 17); k1 = Math.imul(k1, c2); h1 ^= k1; }
  h1 ^= str.length; h1 ^= h1 >>> 16; h1  = Math.imul(h1, 0x85ebca6b);
  h1 ^= h1 >>> 13; h1 = Math.imul(h1, 0xc2b2ae35); h1 ^= h1 >>> 16;
  return h1 >>> 0; // unsigned
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url") || "";
  if (!/^https?:\/\//i.test(url)) return NextResponse.json({ error: "Provide absolute http(s) URL" }, { status: 400 });

  // Try /favicon.ico on same origin
  let favUrl: string;
  try {
    const u = new URL(url);
    favUrl = `${u.origin}/favicon.ico`;
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  try {
    const res = await fetch(favUrl, { cache: "no-store" });
    if (!res.ok) return NextResponse.json({ error: `favicon ${res.status}`, urlTried: favUrl }, { status: 200 });
    const buf = await res.arrayBuffer();
    const base64 = Buffer.from(buf).toString("base64");
    const hash = mmh3(base64);
    return NextResponse.json({ urlTried: favUrl, base64Length: base64.length, mmh3: hash });
  } catch (e:any) {
    return NextResponse.json({ error: e.message, urlTried: favUrl }, { status: 200 });
  }
}
