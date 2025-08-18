import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/test/mocks/server";

// Node's fetch needs absolute URL:
process.env.NEXT_PUBLIC_BASE_URL = "http://localhost";

import { getProjects } from "./getProjects";

describe("getProjects", () => {
  beforeEach(() => {
    server.use(
      http.get("http://localhost/api/projects", () =>
        HttpResponse.json([
          {
            id: 1,
            name: "Demo",
            slug: "demo",
            description: "hello",
            owner: 1,
            created_at: new Date().toISOString(),
          },
        ])
      )
    );
  });

  it("returns projects list", async () => {
    const data = await getProjects();
    expect(Array.isArray(data)).toBe(true);
    expect(data[0].slug).toBe("demo");
  });

  it("returns empty array on non-OK", async () => {
    server.use(
      http.get("http://localhost/api/projects", () =>
        new HttpResponse("nope", { status: 401 })
      )
    );
    const data = await getProjects();
    expect(data).toEqual([]);
  });
});
