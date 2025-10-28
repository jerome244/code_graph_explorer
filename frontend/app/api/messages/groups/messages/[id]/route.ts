import { cookies } from "next/headers";
const DJ = process.env.DJANGO_API_BASE!;

function pickAccess(req: Request, ck: Awaited<ReturnType<typeof cookies>>) {
  const h = req.headers.get("authorization") || "";
  if (h.toLowerCase().startsWith("bearer ")) return h.slice(7);
  return ck.get("access")?.value || "";
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const ck = await cookies();
  const access = pickAccess(req, ck);
  if (!access) return new Response("Unauthorized", { status: 401 });

  const r = await fetch(`${DJ}/api/auth/messages/groups/messages/${encodeURIComponent(params.id)}/`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${access}` },
  });

  const text = await r.text().catch(() => "");
  return new Response(text, { status: r.status, headers: { "content-type": r.headers.get("content-type") || "text/plain" } });
}

export async function OPTIONS() { return new Response(null, { status: 204 }); }
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
