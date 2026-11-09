import { expect, test, type TestInfo } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";

import { knowledgeDocuments, websiteIngestionJobs } from "@lobbystack/db";
import onboarding from "../../public/locales/en/onboarding.json" with { type: "json" };

import { migrator, removeFixtures, signUp, type Migrator } from "../fixtures/full-stack";
import { startThirdParties, type ThirdParties } from "../fixtures/third-parties";

// Firecrawl rate-limits the first six crawl starts. That outlasts both the
// provider's quick retries and the queue's five attempts, so the import only
// finishes when the worker puts the job off and crawls again later.

const prefix = "website-rate-limit";
let database: Migrator;
let thirdParties: ThirdParties;

test.beforeAll(async () => { thirdParties = await startThirdParties(); database = migrator(); });
test.afterAll(async () => { await thirdParties.close(); await database.pool.end(); });

test("a website import waits out Firecrawl's rate limit and finishes", async ({ page }, testInfo: TestInfo) => {
  test.setTimeout(180_000);
  const emails: string[] = [];
  const businessIds: string[] = [];
  try {
    const { email } = await signUp(page, testInfo, prefix);
    emails.push(email);
    await page.getByLabel(onboarding.businessName.label).fill(`Rate limited ${randomUUID().slice(0, 6)}`);
    const created = page.waitForResponse((response) => response.url().endsWith("/api/businesses") && response.request().method() === "POST");
    await page.getByRole("button", { name: onboarding.businessName.continue }).click();
    const { businessId } = await (await created).json() as { businessId: string };
    businessIds.push(businessId);

    thirdParties.firecrawl.rateLimitedStarts = 6;
    await expect(page).toHaveURL("/onboarding/website");
    await page.getByLabel(onboarding.website.label).fill("example.com");
    await page.getByRole("button", { name: onboarding.website.continue }).click();
    await expect(page).toHaveURL(/\/onboarding\/reading\?documentId=/);

    const document = async () => (await database.db.select({ status: knowledgeDocuments.status }).from(knowledgeDocuments).where(and(eq(knowledgeDocuments.businessId, businessId), eq(knowledgeDocuments.sourceType, "website"))))[0]?.status;
    await expect.poll(document, { timeout: 120_000, intervals: [1_000] }).toBe("indexed");

    expect(thirdParties.firecrawl.starts.map((start) => start.status)).toEqual([...Array<number>(6).fill(429), 200]);
    const [ingestion] = await database.db.select({ status: websiteIngestionJobs.status, indexedCount: websiteIngestionJobs.indexedCount }).from(websiteIngestionJobs).where(eq(websiteIngestionJobs.businessId, businessId));
    expect(ingestion).toEqual({ status: "completed", indexedCount: 1 });
  } finally {
    await removeFixtures(database, { emails, businessIds });
  }
});
