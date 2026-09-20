import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL("../../", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@lobbystack/ai": `${root}/packages/ai/src/index.ts`,
      "@lobbystack/config": `${root}/packages/config/src/index.ts`,
      "@lobbystack/contracts": `${root}/packages/contracts/src/index.ts`,
      "@lobbystack/db": `${root}/packages/db/src/index.ts`,
      "@lobbystack/domain": `${root}/packages/domain/src/index.ts`,
      "@lobbystack/jobs": `${root}/packages/jobs/src/index.ts`,
      "@lobbystack/providers/ai/embeddingProvider": `${root}/packages/providers/src/ai/embeddingProvider.ts`,
      "@lobbystack/providers/crawling/firecrawl": `${root}/packages/providers/src/crawling/firecrawl.ts`,
      "@lobbystack/providers/crypto/secretBox": `${root}/packages/providers/src/crypto/secretBox.ts`,
      "@lobbystack/providers/email/smtp": `${root}/packages/providers/src/email/smtp.ts`,
      "@lobbystack/providers/google/calendar": `${root}/packages/providers/src/google/calendar.ts`,
      "@lobbystack/providers/polar/polarBilling": `${root}/packages/providers/src/polar/polarBilling.ts`,
      "@lobbystack/providers/storage/provider": `${root}/packages/providers/src/storage/provider.ts`,
      "@lobbystack/providers/twilio/twilioProvider": `${root}/packages/providers/src/twilio/twilioProvider.ts`,
      "@lobbystack/providers": `${root}/packages/providers/src/index.ts`,
      "@lobbystack/shared": `${root}/packages/shared/src/index.ts`,
      "@lobbystack/telemetry/node": `${root}/packages/telemetry/src/node.ts`,
      "@lobbystack/telemetry": `${root}/packages/telemetry/src/index.ts`,
    },
  },
  test: {
    environment: "node",
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
