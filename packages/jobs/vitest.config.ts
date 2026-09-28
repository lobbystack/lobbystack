import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL("../../", import.meta.url));

export default defineConfig({
  // Test against the contracts source so a stale `dist` build cannot hide or
  // invent job types.
  resolve: { alias: { "@lobbystack/contracts": `${root}/packages/contracts/src/index.ts` } },
  test: { include: ["src/**/*.test.{ts,tsx}"] },
});
