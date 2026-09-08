import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["src/**/*.test.{ts,tsx}"] },
  resolve: {
    alias: {
      "@lobbystack/shared": fileURLToPath(new URL("../shared/src/index.ts", import.meta.url)),
    },
  },
});
