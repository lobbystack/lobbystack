import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: fileURLToPath(new URL("./src/index.ts", import.meta.url)),
      name: "LobbyStack",
      formats: ["iife"],
      fileName: () => "embed.js",
    },
    outDir: "dist",
    emptyOutDir: true,
    target: "es2018",
    sourcemap: false,
    rolldownOptions: {
      output: {
        extend: true,
        // Rollup put "use strict" inside the IIFE; Rolldown omits it unless the
        // source has one, so add it back at the same spot.
        intro: '"use strict";',
      },
    },
  },
});
