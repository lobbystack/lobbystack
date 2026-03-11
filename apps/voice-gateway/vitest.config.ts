import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@ai-receptionist/ai": path.resolve(__dirname, "../../packages/ai/src/index.ts"),
      "@ai-receptionist/config": path.resolve(__dirname, "../../packages/config/src/index.ts"),
      "@ai-receptionist/shared": path.resolve(__dirname, "../../packages/shared/src/index.ts"),
      "@ai-receptionist/testing": path.resolve(__dirname, "../../packages/testing/src/index.ts"),
    },
  },
  test: {
    environment: "node",
  },
});
