import path from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  envDir: "../../",
  plugins: [react(), tailwindcss()],
  build: {
    // PostHog error tracking needs emitted source maps so deployed bundles can be symbolicated.
    sourcemap: true,
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@lobbystack/shared": path.resolve(__dirname, "../../packages/shared/src/index.ts"),
      "@lobbystack/telemetry": path.resolve(
        __dirname,
        "../../packages/telemetry/src/index.ts",
      ),
    },
  },
  server: {
    port: 5173,
  },
});
