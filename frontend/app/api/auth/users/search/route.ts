import { cookies } from "next/headers";
const DJ = process.env.DJANGO_API_BASE!;

function pickAccess(req: Request, ck: Awaited<ReturnType<typeof cookies>>) {
  const h = req.headers.get("authorization") || "";
  if (h.toLowerCase().startsWith("bearer ")) return h.slice(7);
  return ck.get("access")?.value || "";
}

export async function GET(req: Request) {
  const ck = await cookies();
  const access = pickAccess(req, ck);
  if (!access) return new Response("Unauthorized", { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();

  // Don’t query backend for empty text
  if (!q) return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });

  const r = await fetch(`${DJ}/api/auth/users/search/?q=${encodeURIComponent(q)}`, {
    headers: { Authorization: `Bearer ${access}` },
    cache: "no-store",
  });

  return new Response(await r.text(), {
    status: r.status,
    headers: { "content-type": r.headers.get("content-type") ?? "application/json" },
  });
}

export async function OPTIONS() {
  return new Response(null, { status: 204 }); // no body
}

// (Optional but recommended)
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
