// app/api/users/[username]/projects/route.ts
import { cookies } from "next/headers";
const DJ = process.env.DJANGO_API_BASE!;

// Reuse the same access picking logic you used elsewhere
function pickAccess(req: Request, ck: Awaited<ReturnType<typeof cookies>>) {
  const h = req.headers.get("authorization") || "";
  if (h.toLowerCase().startsWith("bearer ")) return h.slice(7);
  return ck.get("access")?.value || "";
}

export async function GET(req: Request, { params }: { params: { username: string } }) {
  const ck = await cookies();
  const access = pickAccess(req, ck);
  const headers = access ? { Authorization: `Bearer ${access}` } : undefined;

  const { searchParams } = new URL(req.url);
  const limit = Number(searchParams.get("limit") || "4");

  // Try a couple of common query patterns your backend might support:
  const candidates = [
    `${DJ}/api/projects/?owner=${encodeURIComponent(params.username)}&ordering=-updated_at&limit=${limit}`,
    `${DJ}/api/projects/?username=${encodeURIComponent(params.username)}&ordering=-updated_at&limit=${limit}`,
  ];

  for (const url of candidates) {
    try {
      const r = await fetch(url, { headers, cache: "no-store" });
      if (r.ok) {
        // If backend already respects ordering/limit, just forward
        const text = await r.text();
        return new Response(text, {
          status: r.status,
          headers: { "content-type": r.headers.get("content-type") ?? "application/json" },
        });
      }
    } catch {
      // go to next candidate
    }
  }

  // Fallback: fetch visible projects and filter by owner_username here.
  // (Works if the current viewer can see some of the target user's projects
  //  e.g., they’re public or shared.)
  try {
    const r = await fetch(`${DJ}/api/projects/`, { headers, cache: "no-store" });
    if (!r.ok) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    const all = await r.json();
    const filtered = Array.isArray(all)
      ? all
          .filter((p: any) => p?.owner_username === params.username)
          .sort((a: any, b: any) => {
            const ta = a.updated_at ? Date.parse(a.updated_at) : 0;
            const tb = b.updated_at ? Date.parse(b.updated_at) : 0;
            return tb - ta;
          })
          .slice(0, limit)
      : [];

    return new Response(JSON.stringify(filtered), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204 });
}
