// Use a global to survive Next.js HMR in dev mode
const g = globalThis as any;

if (!g.__PICO_TARGET__) {
  g.__PICO_TARGET__ = {
    base: "", // e.g., "http://192.168.1.131" or "http://picow.local"
  };
}

export function getPicoBase(): string {
  return g.__PICO_TARGET__.base as string;
}

export function setPicoBase(base: string) {
  let b = base.trim();
  if (!/^https?:\/\//i.test(b)) {
    b = "http://" + b;
  }
  b = b.replace(/\/+$/, ""); // drop trailing slashes
  g.__PICO_TARGET__.base = b;
  return b;
}
