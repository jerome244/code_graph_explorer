import { describe, it, expect, vi, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/test/mocks/server";
import { GET } from "./route";

beforeEach(() => {
  process.env.NEXT_PUBLIC_BASE_URL = "http://backend";
});

describe("GET /api/projects/[slug]/file (proxy)", () => {
  it("proxies to Django and returns text", async () => {
    server.use(
      http.get("http://backend/api/projects/:slug/file", ({ request, params }) => {
        const url = new URL(request.url);
        expect(params.slug).toBe("demo");
        expect(url.searchParams.get("path")).toBe("a.py");
        return new HttpResponse("print('hi')\n", { status: 200, headers: { "Content-Type": "text/plain" } });
      })
    );

    const req = new Request("http://localhost/api/projects/demo/file?path=a.py", {
      headers: { cookie: "sessionid=abc" },
    });
    const res = await GET(req as any, { params: { slug: "demo" } as any });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("print('hi')");
  });

  it("forwards cookies", async () => {
    const spy = vi.spyOn(global, "fetch");
    server.use(
      http.get("http://backend/api/projects/:slug/file", ({ request }) => {
        // MSW already got the request; we just return OK
        return new HttpResponse("ok", { status: 200 });
      })
    );
    const req = new Request("http://localhost/api/projects/demo/file?path=a.py", {
      headers: { cookie: "sessionid=COOKIE-X" },
    });
    await GET(req as any, { params: { slug: "demo" } as any });
    const call = spy.mock.calls.find((c) => typeof c[0] === "string" && String(c[0]).includes("/api/projects/demo/file"));
    expect(call?.[1]?.headers?.cookie).toBe("sessionid=COOKIE-X");
    spy.mockRestore();
  });
});
