import { cookies } from "next/headers";
const DJ = process.env.DJANGO_API_BASE!;

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const access = (await cookies()).get("access")?.value;
  if (!access) return new Response("Unauthorized", { status: 401 });
  const body = await req.text(); // { files: [{path, content}, ...] }
  const r = await fetch(`${DJ}/api/projects/${params.id}/files/bulk/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
    body,
  });
  return new Response(await r.text(), { status: r.status });
}
