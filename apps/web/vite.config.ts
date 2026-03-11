import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  envDir: "../../",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@ai-receptionist/shared": path.resolve(__dirname, "../../packages/shared/src/index.ts"),
      "@ai-receptionist/testing": path.resolve(__dirname, "../../packages/testing/src/index.ts"),
    },
  },
  server: {
    port: 5173,
  },
});
