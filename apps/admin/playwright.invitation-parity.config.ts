import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/invitation-parity.e2e.ts",
  workers: 1,
  reporter: [["list"], ["json", { outputFile: `${process.env.INVITATION_PARITY_ARTIFACTS ?? "test-results/invitation-parity"}/${process.env.INVITATION_PARITY_SIDE ?? "port"}/results.json` }]],
  outputDir: `${process.env.INVITATION_PARITY_ARTIFACTS ?? "test-results/invitation-parity"}/${process.env.INVITATION_PARITY_SIDE ?? "port"}/traces`,
  snapshotPathTemplate: `${process.env.INVITATION_PARITY_ARTIFACTS ?? "test-results/invitation-parity"}/snapshots/{arg}{ext}`,
  use: { trace: "retain-on-failure" },
});
