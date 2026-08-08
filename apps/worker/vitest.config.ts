import path from "node:path";
import { defineConfig } from "vitest/config";

const root = path.resolve(import.meta.dirname, "../..");

export default defineConfig({
  resolve: {
    alias: [
      {
        find: "@lobbystack/db/schema",
        replacement: path.resolve(root, "packages/db/src/schema/index.ts"),
      },
      {
        find: "@lobbystack/db/client",
        replacement: path.resolve(root, "packages/db/src/client.ts"),
      },
      {
        find: "@lobbystack/db/outbox",
        replacement: path.resolve(root, "packages/db/src/outbox.ts"),
      },
      {
        find: "@lobbystack/db",
        replacement: path.resolve(root, "packages/db/src/index.ts"),
      },
      {
        find: "@lobbystack/contracts",
        replacement: path.resolve(root, "packages/contracts/src/index.ts"),
      },
      {
        find: "@lobbystack/domain",
        replacement: path.resolve(root, "packages/domain/src/index.ts"),
      },
      {
        find: "@lobbystack/jobs",
        replacement: path.resolve(root, "packages/jobs/src/index.ts"),
      },
      {
        find: "@lobbystack/providers",
        replacement: path.resolve(root, "packages/providers/src/index.ts"),
      },
      {
        find: "@lobbystack/shared",
        replacement: path.resolve(root, "packages/shared/src/index.ts"),
      },
      {
        find: "@lobbystack/telemetry/node",
        replacement: path.resolve(root, "packages/telemetry/src/node.ts"),
      },
      {
        find: "@lobbystack/telemetry",
        replacement: path.resolve(root, "packages/telemetry/src/index.ts"),
      },
    ],
  },
  test: {
    environment: "node",
  },
});
