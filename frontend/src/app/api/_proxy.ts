import { getAccessTokenServerServer } from "@/lib/jwt";

export async function proxyWithAuth(
  req: Request,
  djangoPath: string,
  opts?: RequestInit
) {
  const DJANGO = process.env.DJANGO_API_BASE_URL!;
  const access = await getAccessTokenServerServer();

  const headers = new Headers(opts?.headers);
  if (access) headers.set("Authorization", `Bearer ${access}`);

  const init: RequestInit = {
    method: opts?.method ?? req.method,
    headers,
    // only pass body for non-GET/HEAD if caller didn’t override
    body:
      opts?.body ??
      (req.method !== "GET" && req.method !== "HEAD" ? (req as any).body : undefined),
  };

  // First attempt
  let r = await fetch(`${DJANGO}${djangoPath}`, init);
  if (r.status !== 401) return r;

  // Try refresh with an ABSOLUTE URL
  let origin = process.env.NEXT_PUBLIC_BASE_URL;
  if (!origin) {
    try {
      origin = new URL(req.url).origin;
    } catch {
      origin = "http://localhost"; // test/dev fallback
    }
  }

  const ref = await fetch(`${origin}/api/auth/refresh`, { method: "POST" });
  if (!ref.ok) return r; // still 401 → give up

  // Retry with new access token
  const access2 = await getAccessTokenServerServer();
  if (access2) headers.set("Authorization", `Bearer ${access2}`);
  r = await fetch(`${DJANGO}${djangoPath}`, { ...init, headers });
  return r;
}
