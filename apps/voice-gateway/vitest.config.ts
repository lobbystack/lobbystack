import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@lobbystack/ai": path.resolve(__dirname, "../../packages/ai/src/index.ts"),
      "@lobbystack/config": path.resolve(__dirname, "../../packages/config/src/index.ts"),
      "@lobbystack/shared": path.resolve(__dirname, "../../packages/shared/src/index.ts"),
    },
  },
  test: {
    environment: "node",
  },
});
