import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    environment: "node",
    testTimeout: 20_000,
    hookTimeout: 20_000,
    coverage: { reporter: ["text", "json-summary"] }
  },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } }
});
