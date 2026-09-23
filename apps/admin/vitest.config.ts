import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL("../../", import.meta.url));
const src = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    alias: {
      "@lobbystack/shared/product-capabilities": `${root}/packages/shared/src/product-capabilities.ts`,
      "@lobbystack/shared": `${root}/packages/shared/src/index.ts`,
      "@lobbystack/config": `${root}/packages/config/src/index.ts`,
      "@lobbystack/contracts": `${root}/packages/contracts/src/index.ts`,
      "@lobbystack/db": `${root}/packages/db/src/index.ts`,
      "@lobbystack/domain": `${root}/packages/domain/src/index.ts`,
      "@lobbystack/providers/storage/local": `${root}/packages/providers/src/storage/local.ts`,
      "@lobbystack/providers/storage/provider": `${root}/packages/providers/src/storage/provider.ts`,
      "@lobbystack/telemetry/node": `${root}/packages/telemetry/src/node.ts`,
      "@lobbystack/telemetry/browser": `${root}/packages/telemetry/src/browser.ts`,
      "@lobbystack/telemetry/testing": `${root}/packages/telemetry/src/testing.ts`,
      "@lobbystack/telemetry": `${root}/packages/telemetry/src/index.ts`,
      "@": src,
    },
  },
  test: {
    environment: "node",
    exclude: ["**/node_modules/**", "**/.git/**", "**/.next/**"],
    // Component suites drive user-event and route navigation; the 5s default is
    // flaky when all workspaces run concurrently under `pnpm -r test`.
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
