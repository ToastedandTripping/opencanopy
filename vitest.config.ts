import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "happy-dom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["src/test/setup.ts"],
    globals: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Allow tests to import pure netlify utility modules (no Deno APIs).
      // Only wfs-bbox-url.ts qualifies — it contains no Deno-specific code.
      "~netlify": path.resolve(__dirname, "./netlify"),
    },
  },
});
