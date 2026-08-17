import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: new URL("./src/index.ts", import.meta.url).pathname,
      name: "LobbyStack",
      formats: ["iife"],
      fileName: () => "embed.js",
    },
    outDir: "dist",
    emptyOutDir: true,
    cssCodeSplit: false,
    minify: "esbuild",
    target: "es2018",
    sourcemap: false,
    rollupOptions: {
      output: {
        extend: true,
        inlineDynamicImports: true,
      },
    },
  },
  define: {
    global: "window",
  },
});
