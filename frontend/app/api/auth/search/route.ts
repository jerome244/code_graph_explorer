import { cookies } from "next/headers";
const DJ = process.env.DJANGO_API_BASE!;

function pickAccess(req: Request, ck: Awaited<ReturnType<typeof cookies>>) {
  const h = req.headers.get("authorization") || "";
  if (h.toLowerCase().startsWith("bearer ")) return h.slice(7);
  return ck.get("access")?.value || "";
}

export async function GET(req: Request) {
  const ck = await cookies();
  const access = pickAccess(req, ck);
  if (!access) return new Response("Unauthorized", { status: 401 });

  const url = new URL(req.url);
  const qRaw = (url.searchParams.get("q") || "").trim();
  const limit = url.searchParams.get("limit") || "8";
  if (!qRaw) {
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  const q = qRaw.replace(/^@/, "");

  // Try list endpoints first if your backend supports them.
  const candidates = [
    `${DJ}/api/auth/users/?search=${encodeURIComponent(q)}&page_size=${encodeURIComponent(limit)}`,
    `${DJ}/api/auth/users/?q=${encodeURIComponent(q)}&page_size=${encodeURIComponent(limit)}`,
  ];

  let lastText = "";
  for (const endpoint of candidates) {
    const r = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${access}` },
      cache: "no-store",
    });
    lastText = await r.text().catch(() => "");
    if (r.ok) {
      try {
        const j = JSON.parse(lastText);
        const results = Array.isArray(j) ? j : (j?.results ?? []);
        return new Response(JSON.stringify(results), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      } catch {
        // continue to fallback
      }
    }
  }

  // Fallback: exact username detail endpoint
  const detailUrl = `${DJ}/api/auth/users/${encodeURIComponent(q)}/`;
  const r2 = await fetch(detailUrl, {
    headers: { Authorization: `Bearer ${access}` },
    cache: "no-store",
  });
  const txt2 = await r2.text().catch(() => "");

  if (r2.ok) {
    try {
      const user = JSON.parse(txt2);
      return new Response(JSON.stringify([user]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    } catch {
      // fall through
    }
  }

  if (r2.status === 404) {
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  return new Response(txt2 || lastText || "Search not available", {
    status: r2.status || 502,
    headers: { "content-type": "application/json" },
  });
}

export async function OPTIONS() { return new Response(null, { status: 204 }); }
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
