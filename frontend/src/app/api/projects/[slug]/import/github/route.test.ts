// frontend/src/app/api/projects/[slug]/import/github/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/test/mocks/server";

// Set env BEFORE importing the route
process.env.DJANGO_API_BASE_URL = "http://django.local";

// Dynamic token mock we can tweak per test
let TOKEN: string | undefined = "TEST_TOKEN";
vi.mock("@/lib/jwt", () => ({
  getAccessTokenServer: () => TOKEN,
}));

// Import the route after env + mocks
import { POST } from "./route";

// Register the handler fresh for every test (setup resets handlers afterEach)
beforeEach(() => {
  server.use(
    http.post(
      "http://django.local/api/projects/:slug/import/github/",
      async ({ request, params }) => {
        const body = await request.json();
        // repo + ref arrive from the Next route
        expect(body).toMatchObject({ repo: "owner/repo", ref: "main" });

        const auth = request.headers.get("authorization");
        if (TOKEN) {
          expect(auth).toBe(`Bearer ${TOKEN}`);
        } else {
          expect(auth).toBeNull();
        }

        return HttpResponse.json(
          {
            id: 1,
            name: `GitHub ${params.slug}`,
            summary: { files: 4, functions: 7 },
            graph: { nodes: [], edges: [], tree_by_file: {} },
            created_at: new Date().toISOString(),
          },
          { status: 201 }
        );
      }
    )
  );
});

describe("POST /api/projects/[slug]/import/github", () => {
  it("proxies to Django with Authorization + JSON body", async () => {
    TOKEN = "TEST_TOKEN";
    const req = new Request("http://localhost/api/projects/demo/import/github", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo: "owner/repo", ref: "main" }),
    });
    const res = await POST(req, { params: { slug: "demo" } });
    expect(res.status).toBe(201);
    expect((await res.json()).summary.files).toBe(4);
  });

  it("omits Authorization header when no token", async () => {
    TOKEN = undefined;
    const req = new Request("http://localhost/api/projects/demo/import/github", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo: "owner/repo", ref: "main" }),
    });
    const res = await POST(req, { params: { slug: "demo" } });
    expect(res.status).toBe(201);
  });

  it("bubbles up Django errors (e.g., 502)", async () => {
    // Override handler just for this test
    server.use(
      http.post(
        "http://django.local/api/projects/:slug/import/github/",
        () => new HttpResponse("GitHub download failed", { status: 502 })
      )
    );

    const req = new Request("http://localhost/api/projects/demo/import/github", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo: "owner/repo", ref: "deadbeef" }),
    });
    const res = await POST(req, { params: { slug: "demo" } });
    expect(res.status).toBe(502);
    expect(await res.text()).toContain("GitHub");
  });
});
