import { cookies } from "next/headers";
const DJ = process.env.DJANGO_API_BASE!;

function pickAccess(req: Request, ck: Awaited<ReturnType<typeof cookies>>) {
  const h = req.headers.get("authorization") || "";
  if (h.toLowerCase().startsWith("bearer ")) return h.slice(7);
  return ck.get("access")?.value || "";
}

export async function POST(req: Request, { params }: { params: { username: string } }) {
  const ck = await cookies();
  const access = pickAccess(req, ck);
  if (!access) return new Response("Unauthorized", { status: 401 });

  const r = await fetch(`${DJ}/api/auth/users/${encodeURIComponent(params.username)}/follow/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${access}`, "content-type": "application/json" },
  });
  return new Response(await r.text(), { status: r.status, headers: { "content-type": "application/json" } });
}

export async function DELETE(req: Request, { params }: { params: { username: string } }) {
  const ck = await cookies();
  const access = pickAccess(req, ck);
  if (!access) return new Response("Unauthorized", { status: 401 });

  const r = await fetch(`${DJ}/api/auth/users/${encodeURIComponent(params.username)}/follow/`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${access}` },
  });
  return new Response(await r.text(), { status: r.status, headers: { "content-type": "application/json" } });
}

export async function OPTIONS() { return new Response(null, { status: 204 }); }
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
