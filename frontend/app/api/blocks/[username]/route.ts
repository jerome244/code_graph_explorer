import { cookies } from "next/headers";
const DJ = process.env.DJANGO_API_BASE!;

function auth() {
  const token = cookies().get("access")?.value || "";
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function GET(_: Request, { params }: { params: { username: string } }) {
  const r = await fetch(`${DJ}/api/auth/blocks/${encodeURIComponent(params.username)}/`, {
    headers: auth(),
    cache: "no-store",
  });
  return new Response(await r.text(), { status: r.status, headers: { "Content-Type": "application/json" } });
}

export async function POST(_: Request, { params }: { params: { username: string } }) {
  const r = await fetch(`${DJ}/api/auth/blocks/${encodeURIComponent(params.username)}/`, {
    method: "POST",
    headers: auth(),
  });
  return new Response(await r.text(), { status: r.status, headers: { "Content-Type": "application/json" } });
}

export async function DELETE(_: Request, { params }: { params: { username: string } }) {
  const r = await fetch(`${DJ}/api/auth/blocks/${encodeURIComponent(params.username)}/`, {
    method: "DELETE",
    headers: auth(),
  });
  return new Response(await r.text(), { status: r.status, headers: { "Content-Type": "application/json" } });
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
