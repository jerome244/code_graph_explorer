// frontend/app/pico/thermo-motor/lib/api.ts
export async function jgetPico<T = any>(
  baseURL: string,
  picoPath: string,
  qs?: Record<string, string | number>
): Promise<T> {
  if (!baseURL) throw new Error("Missing Pico base URL");
  const usp = new URLSearchParams();
  if (qs) for (const [k, v] of Object.entries(qs)) usp.set(k, String(v));
  if (!usp.has("t")) usp.set("t", "12000");
  usp.set("target", baseURL);
  const url = `/api/pico${picoPath}?${usp.toString()}`;
  const r = await fetch(url, {
    method: "GET",
    headers: { "X-Pico-Base": baseURL },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}
