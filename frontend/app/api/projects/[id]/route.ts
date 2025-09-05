// app/api/projects/[id]/route.ts
import { cookies } from "next/headers";

const api = process.env.DJANGO_API_BASE;

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const access = cookies().get("access")?.value;
  if (!access) return new Response("Unauthorized", { status: 401 });

  // DRF usually needs a trailing slash on detail routes
  const url = `${api}/api/projects/${params.id}/`;

  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${access}` },
    cache: "no-store",
  });

  // Pass through response (including status and content-type)
  const body = await r.text(); // body could be JSON or error text
  return new Response(body, {
    status: r.status,
    headers: { "content-type": r.headers.get("content-type") || "application/json" },
  });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const access = cookies().get("access")?.value;
  if (!access) return new Response("Unauthorized", { status: 401 });

  const url = `${api}/api/projects/${params.id}/`;
  const r = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${access}` },
  });

  if (r.status === 204 || r.status === 200) {
    return new Response(null, { status: 204 }); // no body on 204
  }
  const text = await r.text().catch(() => "");
  return new Response(text || "Delete failed", { status: r.status || 500 });
}

// (optional) avoid any static caching
export const dynamic = "force-dynamic";
