// app/api/github/zip/route.ts
import { NextRequest } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { owner, repo, ref, token } = await req.json();
    if (!owner || !repo) {
      return new Response(JSON.stringify({ error: "owner and repo are required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const branch = encodeURIComponent(ref || "HEAD");
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/zipball/${branch}`;

    const headers: Record<string, string> = {
      "User-Agent": "code-graph-explorer",
      "Accept": "application/vnd.github+json",
    };
    const envToken = process.env.GH_TOKEN;
    const authToken = token || envToken;
    if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

    const res = await fetch(apiUrl, { headers, redirect: "follow" });

    if (!res.ok) {
      const text = await res.text();
      return new Response(JSON.stringify({ error: `GitHub error ${res.status}`, details: text }), {
        status: res.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Stream the zip back to the client
    const body = res.body; // ReadableStream
    if (!body) {
      return new Response(JSON.stringify({ error: "Empty response from GitHub" }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${owner}-${repo}.zip"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || "Unknown error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
