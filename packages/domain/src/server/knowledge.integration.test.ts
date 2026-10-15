import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { businessMemberships, businesses, createDatabaseClient, knowledgeDocuments, users, websiteIngestionJobs, type Database, type DatabaseTransaction } from "@lobbystack/db";

import { deleteWebsiteKnowledge } from "./knowledge";

// Explicit opt-in only; never fall back to DATABASE_URL or load an env file.
const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
    throw new Error("Knowledge integration tests require a dedicated local test database.");
  }
}
const client = testUrl ? createDatabaseClient("lobbystack_migrator", { DATABASE_URL: testUrl }) : undefined;
afterAll(async () => { await client?.pool.end(); });

async function rollbackTest(run: (tx: DatabaseTransaction) => Promise<void>) {
  const rollback = new Error("rollback test fixture");
  try {
    await client!.db.transaction(async (tx) => {
      await run(tx);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
}

describe.skipIf(!client)("deleteWebsiteKnowledge", () => {
  it("deletes a website's pages, cancels the crawls still bringing them in, and answers 404 for a missing page", async () => {
    await rollbackTest(async (tx) => {
      const businessId = randomUUID();
      const userId = randomUUID();
      await tx.insert(businesses).values({ id: businessId, slug: businessId, name: "Studio", timezone: "UTC", businessType: "test", telemetryEnabled: false });
      await tx.insert(users).values({ id: userId, email: `${userId}@example.invalid`, normalizedEmail: `${userId}@example.invalid` });
      await tx.insert(businessMemberships).values({ businessId, userId, role: "business_owner" });
      const page = async (sourceUrl: string, status = "indexed") => (await tx.insert(knowledgeDocuments).values({ businessId, sourceType: "website", title: sourceUrl, sourceUrl, status }).returning({ id: knowledgeDocuments.id, revision: knowledgeDocuments.revision }))[0]!;
      // One crawl started from this website, another from a sister site that links here.
      const root = await page("https://example.com/", "processing");
      const sister = await page("https://shop.example.net/", "processing");
      const pricing = await page("https://www.example.com/pricing");
      const other = await page("https://other.example.org/");
      const [ownCrawl, sisterCrawl] = await tx.insert(websiteIngestionJobs).values([
        { businessId, rootDocumentId: root.id, websiteUrl: "https://example.com/", provider: "firecrawl", status: "indexing" },
        { businessId, rootDocumentId: sister.id, websiteUrl: "https://www.example.com/start", provider: "firecrawl", status: "crawling" },
      ]).returning({ id: websiteIngestionJobs.id });

      const db = tx as unknown as Database;
      await expect(deleteWebsiteKnowledge({ db }, { userId, businessId, documentId: pricing.id })).resolves.toBe(2);
      const left = await tx.select({ id: knowledgeDocuments.id, status: knowledgeDocuments.status, revision: knowledgeDocuments.revision }).from(knowledgeDocuments).where(eq(knowledgeDocuments.businessId, businessId));
      expect(left).toEqual(expect.arrayContaining([{ id: other.id, status: "indexed", revision: other.revision }, { id: sister.id, status: "cancelled", revision: sister.revision + 1 }]));
      expect(left).toHaveLength(2);
      // The deleted import took its crawl with it; the other crawl stops at its next page.
      const crawls = await tx.select({ id: websiteIngestionJobs.id, status: websiteIngestionJobs.status }).from(websiteIngestionJobs).where(eq(websiteIngestionJobs.businessId, businessId));
      expect(crawls).toEqual([{ id: sisterCrawl!.id, status: "cancelled" }]);
      expect(ownCrawl).toBeDefined();

      await expect(deleteWebsiteKnowledge({ db }, { userId, businessId, documentId: pricing.id })).rejects.toMatchObject({ status: 404 });
    });
  });
});
