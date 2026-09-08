import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/visual-parity.e2e.ts",
  fullyParallel: process.env.PARITY_PARALLEL === "1",
  workers: process.env.PARITY_WORKERS ? Number(process.env.PARITY_WORKERS) : 1,
  reporter: [["list"], ["json", { outputFile: `${process.env.PARITY_OUTPUT_DIR ?? "test-results/parity"}/results.json` }]],
  ...(process.env.PARITY_SNAPSHOT_DIR ? { snapshotPathTemplate: `${process.env.PARITY_SNAPSHOT_DIR}/{arg}{ext}` } : {}),
  outputDir: process.env.PARITY_OUTPUT_DIR ?? "test-results/parity",
  use: { trace: "retain-on-failure" },
});
