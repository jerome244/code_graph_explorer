import { http, HttpResponse } from "msw";

// Mock your Next API endpoints (not Django directly)
export const handlers = [
  http.post("/api/auth/login", async ({ request }) => {
    const body = await request.json();
    if (body.username === "alice" && body.password === "pass") {
      return HttpResponse.json({ ok: true });
    }
    return new HttpResponse("Invalid credentials", { status: 401 });
  }),

  http.get("/api/projects", () =>
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
  ),
];
