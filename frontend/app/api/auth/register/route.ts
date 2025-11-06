export async function POST(req: Request) {
  const body = await req.json();
  const resp = await fetch(`${process.env.DJANGO_API_BASE}/api/auth/register/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) return new Response(await resp.text(), { status: resp.status });
  return new Response(await resp.text(), { status: 201 });
}