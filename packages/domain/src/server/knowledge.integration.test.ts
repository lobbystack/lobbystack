import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { agents, businessMemberships, businessNotifications, businesses, createDatabaseClient, withBusinessTransaction, knowledgeDocuments, users, websiteIngestionJobs, type Database, type DatabaseTransaction } from "@lobbystack/db";

import { deleteKnowledgeDocumentInTransaction, deleteWebsiteKnowledge, markKnowledgeDocumentFailed, postWebsiteImportFinishedInTransaction } from "./knowledge";

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

describe.skipIf(!client)("website imports in the bell", () => {
  async function seed(tx: DatabaseTransaction) {
    const businessId = randomUUID();
    const userId = randomUUID();
    await tx.insert(businesses).values({ id: businessId, slug: businessId, name: "Studio", timezone: "UTC", businessType: "test", telemetryEnabled: false });
    await tx.insert(users).values({ id: userId, email: `${userId}@example.invalid`, normalizedEmail: `${userId}@example.invalid` });
    await tx.insert(businessMemberships).values({ businessId, userId, role: "business_owner" });
    const doc = async (sourceType: string, sourceUrl: string | null) => (await tx.insert(knowledgeDocuments).values({ businessId, sourceType, title: sourceUrl ?? "notes.pdf", sourceUrl, status: "processing" }).returning({ id: knowledgeDocuments.id }))[0]!.id;
    const bell = async () => await tx.select({ kind: businessNotifications.kind, key: businessNotifications.dedupeKey, params: businessNotifications.params, resolvedAt: businessNotifications.resolvedAt }).from(businessNotifications).where(eq(businessNotifications.businessId, businessId)).orderBy(businessNotifications.createdAt);
    return { businessId, userId, doc, bell };
  }
  async function asWorker<T>(tx: DatabaseTransaction, run: (db: Database) => Promise<T>): Promise<T> {
    await tx.execute(sql`set local session authorization lobbystack_worker`);
    try { return await run(tx as unknown as Database); } finally { await tx.execute(sql`reset session authorization`); }
  }

  it("posts a failed import with its site, and nothing for a failed file", async () => {
    await rollbackTest(async (tx) => {
      const { businessId, doc, bell } = await seed(tx);
      const site = await doc("website", "https://www.example.com/help/");
      const file = await doc("upload", null);
      await asWorker(tx, (db) => markKnowledgeDocumentFailed({ db }, { businessId, documentId: file, error: "Unreadable" }));
      expect(await bell()).toEqual([]);
      await asWorker(tx, (db) => markKnowledgeDocumentFailed({ db }, { businessId, documentId: site, error: "Website crawling failed.", websiteImport: { url: "https://www.example.com/help/" } }));
      expect(await bell()).toEqual([{ kind: "website_import_failed", key: `website_import_failed:${site}`, params: { site: "example.com" }, resolvedAt: null }]);
    });
  });

  it("posts a finished import with its page count, clearing the document's earlier failure", async () => {
    await rollbackTest(async (tx) => {
      const { businessId, doc, bell } = await seed(tx);
      const site = await doc("website", "https://example.com/");
      await asWorker(tx, (db) => markKnowledgeDocumentFailed({ db }, { businessId, documentId: site, websiteImport: { url: "https://example.com/" } }));
      const jobId = randomUUID();
      await asWorker(tx, (db) => withBusinessTransaction(db, { businessId, actorType: "worker" }, (inner) => postWebsiteImportFinishedInTransaction(inner, { businessId, documentId: site, websiteIngestionJobId: jobId, revision: 2, url: "https://example.com/", pages: 48 })));
      const rows = await bell();
      expect(rows[0]).toMatchObject({ kind: "website_import_failed", resolvedAt: expect.any(Date) });
      expect(rows[1]).toEqual({ kind: "website_import_finished", key: `website_import_finished:${jobId}:2`, params: { site: "example.com", pages: 48 }, resolvedAt: null });
    });
  });

  it("opens an agent's Specific knowledge for a website only that agent uses, and Knowledge for a shared one", async () => {
    await rollbackTest(async (tx) => {
      const { businessId, doc } = await seed(tx);
      const [agent] = await tx.insert(agents).values({ businessId, name: "Weekend line", greeting: "Hello", tone: "warm", summary: "", bookingPolicy: "", transferMode: "never" }).returning({ id: agents.id });
      const owned = await doc("website", "https://weekend.example.com/");
      await tx.update(knowledgeDocuments).set({ agentId: agent!.id }).where(eq(knowledgeDocuments.id, owned));
      const shared = await doc("website", "https://example.com/");
      await asWorker(tx, (db) => markKnowledgeDocumentFailed({ db }, { businessId, documentId: owned, websiteImport: { url: "https://weekend.example.com/" } }));
      await asWorker(tx, (db) => markKnowledgeDocumentFailed({ db }, { businessId, documentId: shared, websiteImport: { url: "https://example.com/" } }));
      await asWorker(tx, (db) => withBusinessTransaction(db, { businessId, actorType: "worker" }, (inner) => postWebsiteImportFinishedInTransaction(inner, { businessId, documentId: owned, websiteIngestionJobId: randomUUID(), revision: 1, url: "https://weekend.example.com/", pages: 3 })));
      const rows = await tx.select({ kind: businessNotifications.kind, key: businessNotifications.dedupeKey, href: businessNotifications.href }).from(businessNotifications).where(eq(businessNotifications.businessId, businessId));
      expect(rows.find((row) => row.key === `website_import_failed:${owned}`)?.href).toBe(`/agents/${agent!.id}/knowledge`);
      expect(rows.find((row) => row.key === `website_import_failed:${shared}`)?.href).toBeNull();
      expect(rows.find((row) => row.kind === "website_import_finished")?.href).toBe(`/agents/${agent!.id}/knowledge`);
    });
  });

  it("clears a failed import when its document is deleted, alone or with its website", async () => {
    await rollbackTest(async (tx) => {
      const { businessId, userId, doc, bell } = await seed(tx);
      const one = await doc("website", "https://example.com/");
      const two = await doc("website", "https://shop.example.net/");
      for (const [id, url] of [[one, "https://example.com/"], [two, "https://shop.example.net/"]] as const) await asWorker(tx, (db) => markKnowledgeDocumentFailed({ db }, { businessId, documentId: id, websiteImport: { url } }));
      await asWorker(tx, (db) => withBusinessTransaction(db, { businessId, actorType: "worker" }, (inner) => deleteKnowledgeDocumentInTransaction(inner, { businessId, documentId: one })));
      await tx.execute(sql`set local role lobbystack_app`);
      await deleteWebsiteKnowledge({ db: tx as unknown as Database }, { userId, businessId, documentId: two });
      await tx.execute(sql`reset role`);
      expect((await bell()).map((row) => row.resolvedAt)).toEqual([expect.any(Date), expect.any(Date)]);
    });
  });
});
