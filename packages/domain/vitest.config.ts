import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL("../../", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@lobbystack/contracts": `${root}/packages/contracts/src/index.ts`,
      "@lobbystack/db": `${root}/packages/db/src/index.ts`,
      "@lobbystack/providers/crawling/urlSafety": `${root}/packages/providers/src/crawling/urlSafety.ts`,
      "@lobbystack/providers/crypto/secretBox": `${root}/packages/providers/src/crypto/secretBox.ts`,
      "@lobbystack/providers/customHostnames/customHostnames": `${root}/packages/providers/src/customHostnames/customHostnames.ts`,
      "@lobbystack/providers/customHostnames/fakeCustomHostnames": `${root}/packages/providers/src/customHostnames/fakeCustomHostnames.ts`,
      "@lobbystack/providers/stripe/fakeStripeConnect": `${root}/packages/providers/src/stripe/fakeStripeConnect.ts`,
      "@lobbystack/shared": `${root}/packages/shared/src/index.ts`,
      "@lobbystack/telemetry/node": `${root}/packages/telemetry/src/node.ts`,
      "@lobbystack/telemetry": `${root}/packages/telemetry/src/index.ts`,
    },
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "node",
  },
});
