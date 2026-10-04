import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL("../../", import.meta.url));

export default defineConfig({
  // Test against workspace sources: built packages nest their output under
  // dist/<package>/src, which their package.json entry points don't match.
  resolve: {
    alias: {
      "@lobbystack/contracts": `${root}/packages/contracts/src/index.ts`,
      "@lobbystack/db": `${root}/packages/db/src/index.ts`,
      "@lobbystack/domain": `${root}/packages/domain/src/index.ts`,
      "@lobbystack/providers/crawling/urlSafety": `${root}/packages/providers/src/crawling/urlSafety.ts`,
      "@lobbystack/shared": `${root}/packages/shared/src/index.ts`,
      "@lobbystack/telemetry/node": `${root}/packages/telemetry/src/node.ts`,
      "@lobbystack/telemetry": `${root}/packages/telemetry/src/index.ts`,
    },
  },
  test: { include: ["src/**/*.test.ts"] },
});
