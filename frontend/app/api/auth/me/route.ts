import { cookies } from "next/headers";

export async function GET() {
  const access = cookies().get("access")?.value;
  if (!access) return new Response("Unauthorized", { status: 401 });

  const resp = await fetch(`${process.env.DJANGO_API_BASE}/api/auth/me/`, {
    headers: { Authorization: `Bearer ${access}` },
    cache: "no-store",
  });

  const body = await resp.text();
  return new Response(body, {
    status: resp.status,
    headers: { "content-type": resp.headers.get("content-type") ?? "application/json" },
  });
}
