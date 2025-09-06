// app/api/blocks/[username]/route.ts
import { cookies } from "next/headers";
const DJ = process.env.DJANGO_API_BASE!;

function pickAccess(req: Request, ck: Awaited<ReturnType<typeof cookies>>) {
  const h = req.headers.get("authorization") || "";
  if (h.toLowerCase().startsWith("bearer ")) return h.slice(7);
  return ck.get("access")?.value || "";
}

export async function GET(req: Request, { params }: { params: { username: string } }) {
  const ck = await cookies();
  const access = pickAccess(req, ck);
  if (!access) return new Response("Unauthorized", { status: 401 });

  const r = await fetch(`${DJ}/api/auth/blocks/${encodeURIComponent(params.username)}/`, {
    headers: { Authorization: `Bearer ${access}` },
    cache: "no-store",
  });
  return new Response(await r.text(), { status: r.status, headers: { "content-type": "application/json" } });
}

export async function POST(req: Request, { params }: { params: { username: string } }) {
  const ck = await cookies();
  const access = pickAccess(req, ck);
  if (!access) return new Response("Unauthorized", { status: 401 });

  const r = await fetch(`${DJ}/api/auth/blocks/${encodeURIComponent(params.username)}/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${access}` },
  });
  return new Response(await r.text(), { status: r.status, headers: { "content-type": "application/json" } });
}

export async function DELETE(req: Request, { params }: { params: { username: string } }) {
  const ck = await cookies();
  const access = pickAccess(req, ck);
  if (!access) return new Response("Unauthorized", { status: 401 });

  const r = await fetch(`${DJ}/api/auth/blocks/${encodeURIComponent(params.username)}/`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${access}` },
  });
  return new Response(await r.text(), { status: r.status, headers: { "content-type": "application/json" } });
}

export async function OPTIONS() { return new Response(null, { status: 204 }); }
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
