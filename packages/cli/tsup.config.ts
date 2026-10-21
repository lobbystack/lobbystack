import { defineConfig } from "tsup";

// One self-contained file, so `node dist/bin.js` runs without the workspace's
// TypeScript sources or a bundler in between.
export default defineConfig({
  entry: { bin: "src/bin.ts" },
  outDir: "dist",
  format: ["esm"],
  platform: "node",
  target: "node26",
  bundle: true,
  // yaml ships CommonJS that requires Node's own modules, which an ES module bundle needs require for.
  banner: { js: "#!/usr/bin/env node\nimport { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  noExternal: [/^@lobbystack\//, "yaml", "zod"],
});
