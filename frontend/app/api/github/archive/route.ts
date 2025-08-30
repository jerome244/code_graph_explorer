// /frontend/app/api/github/archive/route.ts
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { repo, ref, token } = await req.json();

    if (typeof repo !== "string" || !/^[^/]+\/[^/]+$/.test(repo.trim())) {
      return Response.json({ error: "Provide repo as 'owner/name'" }, { status: 400 });
    }

    const [owner, name] = repo.trim().split("/");
    const url = `https://api.github.com/repos/${owner}/${name}/zipball${ref ? `/${encodeURIComponent(ref)}` : ""}`;

    const headers: Record<string, string> = {
      "User-Agent": "code-graph-explorer",
      Accept: "application/vnd.github+json",
    };

    // Prefer explicit token from client for private repos; otherwise fallback to env
    const bearer = (token || process.env.GITHUB_TOKEN || "").trim();
    if (bearer) headers.Authorization = `Bearer ${bearer}`;

    const gh = await fetch(url, { headers, redirect: "follow" });
    if (!gh.ok) {
      const text = await gh.text().catch(() => "");
      return Response.json({ error: text || `GitHub error ${gh.status}` }, { status: gh.status });
    }

    const buf = await gh.arrayBuffer();
    const cd = gh.headers.get("content-disposition") || `attachment; filename="${owner}-${name}.zip"`;

    return new Response(buf, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": cd,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return Response.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
