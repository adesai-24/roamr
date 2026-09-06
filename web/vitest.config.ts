import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    // e2e/ belongs to Playwright; vitest collecting it would launch browsers here.
    exclude: ["node_modules/**", "e2e/**", ".next/**"],
    globals: true,
  },
  esbuild: {
    jsx: "automatic",
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
