// frontend/app/api/projects/[id]/route.ts
import { cookies } from "next/headers";

const DJ = process.env.DJANGO_API_BASE!;

function pickAccess(req: Request, ck: Awaited<ReturnType<typeof cookies>>) {
  const h = req.headers.get("authorization") || "";
  if (h.toLowerCase().startsWith("bearer ")) return h.slice(7);
  return ck.get("access")?.value || "";
}

function djUrl(id: string | number) {
  // Django usually expects trailing slash
  return `${DJ}/api/projects/${encodeURIComponent(String(id))}/`;
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ck = await cookies();
  const access = pickAccess(_req, ck);
  if (!access) return new Response("Unauthorized", { status: 401 });

  const r = await fetch(djUrl(params.id), {
    headers: { Authorization: `Bearer ${access}` },
    cache: "no-store",
  });

  // pass through body + status + content-type
  return new Response(await r.text(), {
    status: r.status,
    headers: { "content-type": r.headers.get("content-type") ?? "application/json" },
  });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const ck = await cookies();
  const access = pickAccess(req, ck);
  if (!access) return new Response("Unauthorized", { status: 401 });

  const body = await req.text();
  const r = await fetch(djUrl(params.id), {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${access}`,
      "Content-Type": req.headers.get("content-type") ?? "application/json",
    },
    body,
    cache: "no-store",
  });

  return new Response(await r.text(), {
    status: r.status,
    headers: { "content-type": r.headers.get("content-type") ?? "application/json" },
  });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const ck = await cookies();
  const access = pickAccess(req, ck);
  if (!access) return new Response("Unauthorized", { status: 401 });

  const r = await fetch(djUrl(params.id), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${access}` },
    cache: "no-store",
  });

  // If Django returns 204, return an empty 204 (no body!) to avoid undici errors.
  if (r.status === 204) return new Response(null, { status: 204 });

  // Otherwise pass through the payload/status.
  return new Response(await r.text(), {
    status: r.status,
    headers: { "content-type": r.headers.get("content-type") ?? "application/json" },
  });
}

export async function OPTIONS() {
  // For preflights; empty 204 is fine.
  return new Response(null, { status: 204 });
}
