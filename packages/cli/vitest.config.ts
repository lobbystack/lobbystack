import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL("../../", import.meta.url));

export default defineConfig({
  // Test against workspace sources, so a stale or missing build of shared can't hide a mismatch.
  resolve: { alias: { "@lobbystack/shared": `${root}/packages/shared/src/index.ts` } },
  test: { include: ["src/**/*.test.ts"] },
});
