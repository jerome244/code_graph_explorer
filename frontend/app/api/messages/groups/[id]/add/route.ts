import { cookies } from "next/headers";
const DJ = process.env.DJANGO_API_BASE!;

function pickAccess(req: Request, ck: Awaited<ReturnType<typeof cookies>>) {
  const h = req.headers.get("authorization") || "";
  if (h.toLowerCase().startsWith("bearer ")) return h.slice(7);
  return ck.get("access")?.value || "";
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ck = await cookies();
  const access = pickAccess(req, ck);
  if (!access) return new Response("Unauthorized", { status: 401 });

  const body = await req.text();
  const r = await fetch(`${DJ}/api/auth/messages/groups/${encodeURIComponent(params.id)}/add/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${access}`, "content-type": "application/json" },
    body,
  });
  return new Response(await r.text(), { status: r.status, headers: { "content-type": r.headers.get("content-type") || "application/json" } });
}
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
