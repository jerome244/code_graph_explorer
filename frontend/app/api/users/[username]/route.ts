// app/api/users/[username]/route.ts
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

  // Use the existing Django search API, then find an exact match (case-insensitive)
  const url = `${DJ}/api/auth/users/search/?q=${encodeURIComponent(params.username)}`;
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${access}` },
    cache: "no-store",
  });

  if (!r.ok) return new Response(await r.text(), { status: r.status });

  const list = await r.json();
  const user = Array.isArray(list)
    ? list.find((u: any) => (u?.username ?? "").toLowerCase() === params.username.toLowerCase())
    : null;

  if (!user) return new Response("Not found", { status: 404 });
  return new Response(JSON.stringify(user), { status: 200, headers: { "content-type": "application/json" } });
}

export async function OPTIONS() {
  return new Response(null, { status: 204 });
}
