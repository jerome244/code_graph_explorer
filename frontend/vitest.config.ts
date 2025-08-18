import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  resolve: {
    dedupe: ["react", "react-dom"],
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["src/test/setup.ts"],
    css: true,
    include: ["src/**/*.{test,spec}.?(c|m)[tj]s?(x)"],
    exclude: ["node_modules", ".next", "dist"],
    testTimeout: 10000,
    environmentMatchGlobs: [["src/app/api/**", "node"]],
  },
});
