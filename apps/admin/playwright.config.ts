import { defineConfig, devices } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { roleDatabaseUrl } from "./playwright-database-url";
import { playwrightTestSecrets } from "./playwright-test-secrets";

function replacementEnvironment(): Record<string, string> {
  if (process.env.CI) return {};
  const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
  const localPath = resolve(root, ".env");
  const path = existsSync(localPath) ? localPath : resolve(root, ".env.example");
  return Object.fromEntries(readFileSync(path, "utf8").split(/\r?\n/).flatMap((line) => {
    const separator = line.indexOf("=");
    return separator > 0 && !line.startsWith("#") ? [[line.slice(0, separator), line.slice(separator + 1)]] : [];
  }));
}

const replacement = replacementEnvironment();
const testSecrets = playwrightTestSecrets(process.env);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:13000";
const localDatabaseUrl = Object.keys(replacement).length > 0
  ? `postgres://postgres:${process.env.POSTGRES_PASSWORD ?? replacement.POSTGRES_PASSWORD ?? "postgres"}@127.0.0.1:${process.env.POSTGRES_PORT ?? replacement.POSTGRES_PORT ?? "15433"}/lobbystack`
  : undefined;
const baseDatabaseUrl = new URL(localDatabaseUrl ?? process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/lobbystack");
process.env.REPLACEMENT_E2E_DATABASE_URL = baseDatabaseUrl.toString();

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  testIgnore: ["**/visual-parity.e2e.ts", "**/new-operator-visual.e2e.ts", "**/loading-parity.e2e.ts", "**/invitation-parity.e2e.ts"],
  fullyParallel: false,
  // Operator fixtures share persisted active-workspace state across spec files.
  ...(process.env.PARITY_OPERATOR_USER_ID ? { workers: 1 } : {}),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm exec tsx --tsconfig ../../scripts/tsconfig.json ../../scripts/prepare-admin-standalone.ts && node .next/standalone/apps/admin/server.js",
    url: `${baseURL}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      PORT: new URL(baseURL).port || "13000",
      APP_BASE_URL: baseURL,
      AUTH_TRUSTED_ORIGINS: baseURL,
      ...testSecrets,
      BETTER_AUTH_USE_SECURE_COOKIES: "false",
      DATABASE_URL: roleDatabaseUrl(baseDatabaseUrl, "lobbystack_app", process.env.LOBBYSTACK_APP_PASSWORD ?? replacement.LOBBYSTACK_APP_PASSWORD ?? "app", process.env.LOBBYSTACK_APP_DATABASE_URL),
      LOBBYSTACK_APP_DATABASE_URL: roleDatabaseUrl(baseDatabaseUrl, "lobbystack_app", process.env.LOBBYSTACK_APP_PASSWORD ?? replacement.LOBBYSTACK_APP_PASSWORD ?? "app", process.env.LOBBYSTACK_APP_DATABASE_URL),
      LOBBYSTACK_AUTH_DATABASE_URL: roleDatabaseUrl(baseDatabaseUrl, "lobbystack_auth", process.env.LOBBYSTACK_AUTH_PASSWORD ?? replacement.LOBBYSTACK_AUTH_PASSWORD ?? "auth", process.env.LOBBYSTACK_AUTH_DATABASE_URL),
      LOBBYSTACK_WORKER_DATABASE_URL: roleDatabaseUrl(baseDatabaseUrl, "lobbystack_worker", process.env.LOBBYSTACK_WORKER_PASSWORD ?? replacement.LOBBYSTACK_WORKER_PASSWORD ?? "worker", process.env.LOBBYSTACK_WORKER_DATABASE_URL),
      LOBBYSTACK_DISPATCHER_DATABASE_URL: roleDatabaseUrl(baseDatabaseUrl, "lobbystack_dispatcher", process.env.LOBBYSTACK_DISPATCHER_PASSWORD ?? replacement.LOBBYSTACK_DISPATCHER_PASSWORD ?? "dispatcher", process.env.LOBBYSTACK_DISPATCHER_DATABASE_URL),
      ...(process.env.REDIS_URL || replacement.REDIS_PORT ? { REDIS_URL: process.env.REDIS_URL ?? `redis://127.0.0.1:${replacement.REDIS_PORT}` } : {}),
      ...(process.env.AI_CHAT_API_KEY && process.env.AI_CHAT_BASE_URL && process.env.AI_CHAT_MODEL ? {
        AI_CHAT_API_KEY: process.env.AI_CHAT_API_KEY,
        AI_CHAT_BASE_URL: process.env.AI_CHAT_BASE_URL,
        AI_CHAT_MODEL: process.env.AI_CHAT_MODEL,
      } : {}),
      NODE_ENV: "production",
    },
  },
});
