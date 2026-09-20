import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  outDir: "dist/runtime",
  format: ["esm"],
  platform: "node",
  target: "node22",
  bundle: true,
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
  splitting: false,
  sourcemap: true,
  clean: false,
  treeshake: true,
  noExternal: [/^@lobbystack\//],
});
