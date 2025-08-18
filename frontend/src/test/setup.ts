import "@testing-library/jest-dom";
import { afterAll, afterEach, beforeAll, vi } from "vitest";
import { server } from "./mocks/server";

// MSW: start/stop
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// --- Next.js specific mocks ---
vi.mock("next/headers", () => {
  // very simple cookie jar for server-side code
  const store = new Map<string, string>();
  return {
    cookies: () => ({
      get: (name: string) =>
        store.has(name) ? { name, value: store.get(name)! } : undefined,
      getAll: () =>
        Array.from(store.entries()).map(([name, value]) => ({ name, value })),
      set: (name: string, value: string) => void store.set(name, value),
      delete: (name: string) => void store.delete(name),
    }),
    headers: () => new Headers(),
  };
});

// Router mock for client components using useRouter()
const push = vi.fn(), replace = vi.fn(), prefetch = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, prefetch }),
}));
