import { describe, it, expect, vi, beforeAll } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/test/mocks/server";

// Set env BEFORE importing the route to be safe
process.env.DJANGO_API_BASE_URL = "http://django.local";

// Mock the jwt accessor used by the route
vi.mock("@/lib/jwt", () => ({ getAccessToken: () => "TEST_TOKEN" }));

// Now import the route (after env & mocks)
import { POST } from "./route";

beforeAll(() => {
  server.use(
    http.post("http://django.local/api/projects/:slug/upload/", async ({ request }) => {
      // Confirm auth header forwarded
      expect(request.headers.get("authorization")).toBe("Bearer TEST_TOKEN");
      // Confirm form-data made it through
      const form = await request.formData();
      expect(form.get("file")).toBeTruthy();
      return HttpResponse.json({ ok: true, id: 123 }, { status: 201 });
    })
  );
});

describe("POST /api/projects/[slug]/upload", () => {
  it("proxies form-data to Django", async () => {
    const file = new File(["zipbytes"], "code.zip", { type: "application/zip" });
    const form = new FormData();
    form.set("file", file);

    // Build a Request and stub formData() so the route doesn't parse a boundary
    const req = new Request("http://localhost/api/projects/demo/upload", { method: "POST" }) as any;
    req.formData = async () => form;

    const res = await POST(req, { params: { slug: "demo" } });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ ok: true });
  });
});
