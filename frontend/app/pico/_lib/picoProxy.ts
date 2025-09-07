"use client";

export function normalizeBase(host: string) {
  return host.replace(/\/+$/, "");
}

export async function proxyText(url: string) {
  const res = await fetch("/api/pico", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Proxy ${res.status}: ${text || "error"}`);
  return text;
}

export async function proxyJSON<T = any>(url: string): Promise<T> {
  const txt = await proxyText(url);
  try { return JSON.parse(txt) as T; } catch { throw new Error("Bad JSON from device"); }
}
