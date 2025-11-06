import { cookies } from "next/headers";

const DJ = process.env.DJANGO_API_BASE!;

function pickAccess(h: Headers, ck: Awaited<ReturnType<typeof cookies>>) {
  const auth = h.get("authorization") || "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7);
  return ck.get("access")?.value || "";
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const ck = await cookies();
  const access = pickAccess(req.headers, ck);
  if (!access) return new Response("Unauthorized", { status: 401 });

  const r = await fetch(`${DJ}/api/auth/messages/${encodeURIComponent(params.id)}/`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${access}` },
    cache: "no-store",
  });

  return new Response(null, { status: r.status });
}

export async function OPTIONS() { return new Response(null, { status: 204 }); }
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
