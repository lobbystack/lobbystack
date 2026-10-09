import { defineConfig } from "tsup";

export default defineConfig({
  // documentExtraction runs as its own worker thread entry; see extractDocumentTextInThread.
  entry: ["src/index.ts", "src/documentExtraction.ts"],
  outDir: "dist/runtime",
  format: ["esm"],
  platform: "node",
  target: "node26",
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
