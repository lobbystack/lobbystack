import { eq } from "drizzle-orm";

import { businesses, createDatabaseClient } from "@lobbystack/db";

function printUsage(): void {
  console.log("Usage: pnpm dev:onboarding:website <businessId>");
  console.log("\nPrepares a local PostgreSQL business for manual onboarding website QA.");
  console.log("Next steps:");
  console.log("1. Open /onboarding/website");
  console.log("2. Submit a website URL");
  console.log("3. Verify onboarding advances to /onboarding/number");
  console.log("4. Verify the created website ingestion job stores its workflow ID");
}

async function main(): Promise<void> {
  const [businessId] = process.argv.slice(2);
  if (!businessId || businessId === "--help" || businessId === "-h") {
    printUsage();
    process.exitCode = businessId ? 0 : 1;
    return;
  }

  const migrator = createDatabaseClient("lobbystack_migrator");
  try {
    const [business] = await migrator.db.update(businesses)
      .set({ onboardingStage: "website", updatedAt: new Date() })
      .where(eq(businesses.id, businessId))
      .returning({ id: businesses.id });
    if (!business) throw new Error(`Business ${businessId} was not found.`);
  } finally {
    await migrator.pool.end();
  }

  console.log(`Prepared business ${businessId} for onboarding website QA.`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
