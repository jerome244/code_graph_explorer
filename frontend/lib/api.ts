import { cookies } from "next/headers";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE!;
const ACCESS = process.env.JWT_ACCESS_COOKIE || "access_token";

export async function apiFetch(path: string, init: RequestInit = {}) {
  // NOTE: await cookies()
  const cookieStore = await cookies();
  const token = cookieStore.get(ACCESS)?.value;

  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers, cache: "no-store" });
  const isJson = (res.headers.get("content-type") || "").includes("application/json");
  const body = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    const msg = typeof body === "string" ? body : JSON.stringify(body);
    throw new Error(`${res.status} ${res.statusText}: ${msg}`);
  }
  return body;
}
