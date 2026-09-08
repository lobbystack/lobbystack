import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/new-operator-visual.e2e.ts",
  workers: 1,
  reporter: [["list"], ["json", { outputFile: `${process.env.OPERATOR_BASELINE_ARTIFACTS ?? "test-results/operator-baseline"}/results.json` }]],
  outputDir: `${process.env.OPERATOR_BASELINE_ARTIFACTS ?? "test-results/operator-baseline"}/traces`,
  snapshotPathTemplate: `${process.env.OPERATOR_BASELINE_ARTIFACTS ?? "test-results/operator-baseline"}/snapshots/{arg}{ext}`,
  use: { trace: "retain-on-failure" },
});
