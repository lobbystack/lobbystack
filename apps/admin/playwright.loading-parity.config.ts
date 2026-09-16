import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/loading-parity.e2e.ts",
  workers: 1,
  reporter: [["list"], ["json", { outputFile: `${process.env.LOADING_PARITY_ARTIFACTS ?? "test-results/loading-parity"}/${process.env.LOADING_PARITY_SIDE ?? "port"}/results.json` }]],
  outputDir: `${process.env.LOADING_PARITY_ARTIFACTS ?? "test-results/loading-parity"}/${process.env.LOADING_PARITY_SIDE ?? "port"}/traces`,
  snapshotPathTemplate: `${process.env.LOADING_PARITY_ARTIFACTS ?? "test-results/loading-parity"}/snapshots/{arg}{ext}`,
  use: { trace: "retain-on-failure" },
});
