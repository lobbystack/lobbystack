import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: rootDir,
  test: {
    environment: "edge-runtime",
    include: ["**/*.test.ts"],
    exclude: ["dist/**", "**/dist/**", "node_modules/**"],
  },
});
