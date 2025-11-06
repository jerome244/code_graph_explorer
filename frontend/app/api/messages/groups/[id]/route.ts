// frontend/app/api/messages/groups/[id]/route.ts
import { cookies } from "next/headers";
const DJ = process.env.DJANGO_API_BASE!;

function pickAccess(req: Request, ck: Awaited<ReturnType<typeof cookies>>) {
  const h = req.headers.get("authorization") || "";
  if (h.toLowerCase().startsWith("bearer ")) return h.slice(7);
  return ck.get("access")?.value || "";
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const ck = await cookies();
  const access = pickAccess(req, ck);
  if (!access) return new Response("Unauthorized", { status: 401 });

  const url = new URL(req.url);
  const page_size = url.searchParams.get("page_size") || "200";

  const r = await fetch(`${DJ}/api/auth/messages/groups/${encodeURIComponent(params.id)}/?page_size=${page_size}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${access}` },
  });

  return new Response(await r.text(), {
    status: r.status,
    headers: { "content-type": r.headers.get("content-type") ?? "application/json" },
  });
}

export async function OPTIONS() { return new Response(null, { status: 204 }); }
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
