import { execFileSync } from "node:child_process";

function printUsage(): void {
  console.log("Usage: pnpm dev:onboarding:website <businessId>");
  console.log("");
  console.log("Prepares a local business for manual onboarding website QA.");
  console.log("Next steps:");
  console.log("1. Open /onboarding/website");
  console.log("2. Submit a website URL");
  console.log("3. Verify onboarding advances to /onboarding/number");
  console.log("4. Verify the created website ingestion job stores workflowId");
}

const [businessId] = process.argv.slice(2);

if (!businessId || businessId === "--help" || businessId === "-h") {
  printUsage();
  process.exit(businessId ? 0 : 1);
}

execFileSync(
  "npx",
  [
    "convex",
    "run",
    "--env-file",
    ".env.local",
    "internal.businesses.admin.setOnboardingStage",
    JSON.stringify({ businessId, onboardingStage: "website" }),
  ],
  {
    stdio: "inherit",
  },
);

console.log("");
console.log(`Prepared business ${businessId} for onboarding website QA.`);
printUsage();
