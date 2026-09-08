import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL("../../", import.meta.url));
const src = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    alias: {
      "@lobbystack/shared": `${root}/packages/shared/src/index.ts`,
      "@lobbystack/config": `${root}/packages/config/src/index.ts`,
      "@lobbystack/db": `${root}/packages/db/src/index.ts`,
      "@lobbystack/domain": `${root}/packages/domain/src/index.ts`,
      "@": src,
    },
  },
  test: {
    environment: "node",
    exclude: ["**/node_modules/**", "**/.git/**", "**/.next/**"],
  },
});
