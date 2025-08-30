import { cookies } from "next/headers";

const DJ = process.env.DJANGO_API_BASE!;

export async function GET() {
  const access = (await cookies()).get("access")?.value;
  if (!access) return new Response("Unauthorized", { status: 401 });
  const r = await fetch(`${DJ}/api/projects/`, { headers: { Authorization: `Bearer ${access}` }, cache: "no-store" });
  return new Response(await r.text(), { status: r.status });
}

export async function POST(req: Request) {
  const access = (await cookies()).get("access")?.value;
  if (!access) return new Response("Unauthorized", { status: 401 });
  const body = await req.text();
  const r = await fetch(`${DJ}/api/projects/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
    body,
  });
  return new Response(await r.text(), { status: r.status });
}
