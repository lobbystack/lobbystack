import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { agentKnowledgeExclusions, agents, billingAccounts, businessContextSnapshots, createDatabaseClient, knowledgeChunks, knowledgeDocuments, knowledgeSnippets, users, websiteIngestionJobs, withBusinessTransaction, type Database, type DatabaseTransaction } from "@lobbystack/db";
import type { SnapshotAgent } from "@lobbystack/shared";
import { snapshotForAgent } from "../snapshot";

import { applyKnowledgeAction, listKnowledgeSources, listWebsitePages } from "./agentKnowledge";
import { archiveAgent } from "./agents";
import { createKnowledgeDocumentInTransaction, createKnowledgeSnippet, loadLatestBusinessSnapshot, loadSnapshotAgent, refreshBusinessSnapshot, searchKnowledgeEvidence } from "./knowledge";
import { getBusinessSnapshotForAgent } from "./snapshotCache";
import { createBusiness } from "./tenancy";

// Which knowledge each agent answers from, against PostgreSQL under RLS. Each
// test runs in a transaction that rolls back.

// Explicit opt-in only; never fall back to DATABASE_URL or load an env file.
const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
    throw new Error("Agent knowledge integration tests require a dedicated local test database.");
  }
}
const client = testUrl ? createDatabaseClient("lobbystack_migrator", { DATABASE_URL: testUrl }) : undefined;
afterAll(async () => { await client?.pool.end(); });

async function rollbackTest(run: (tx: DatabaseTransaction) => Promise<void>) {
  const rollback = new Error("rollback test fixture");
  await expect(client!.db.transaction(async (tx) => {
    await run(tx);
    throw rollback;
  })).rejects.toBe(rollback);
}

async function as(tx: DatabaseTransaction, role: "lobbystack_app" | "lobbystack_worker" | null) {
  await tx.execute(sql`reset role`);
  if (role) await tx.execute(sql.raw(`set local role ${role}`));
}

async function seed(tx: DatabaseTransaction) {
  const userId = randomUUID();
  await tx.insert(users).values({ id: userId, email: `${userId}@example.invalid`, normalizedEmail: `${userId}@example.invalid`, name: "Sam Owner" });
  await as(tx, "lobbystack_app");
  const context = { db: tx as unknown as Database };
  const { businessId } = await createBusiness(context, { userId, name: "Harbor Dental", timezone: "UTC", businessType: "dental" });
  await as(tx, null);
  // A paid plan, so the second agent answers as itself and isn't paused.
  await tx.insert(billingAccounts).values({ businessId, billingKey: `business:${businessId}`, plan: "starter", subscriptionState: "active" }).onConflictDoUpdate({ target: billingAccounts.businessId, set: { plan: "starter", subscriptionState: "active" } });
  const [front] = await tx.select({ id: agents.id }).from(agents).where(eq(agents.businessId, businessId));
  const [evening] = await tx.insert(agents).values({ businessId, isDefault: false, name: "Evening", greeting: "Evening desk", tone: "warm", summary: "", bookingPolicy: "Book", transferMode: "on_request" }).returning({ id: agents.id });
  const document = async (input: { title: string; text: string; sourceType?: string; sourceUrl?: string; agentId?: string; websiteDocumentId?: string }) => {
    const [row] = await tx.insert(knowledgeDocuments).values({ businessId, title: input.title, sourceType: input.sourceType ?? "upload", sourceUrl: input.sourceUrl ?? null, status: "indexed", agentId: input.agentId ?? null, websiteDocumentId: input.websiteDocumentId ?? null }).returning({ id: knowledgeDocuments.id });
    await tx.insert(knowledgeChunks).values({ businessId, documentId: row!.id, sequence: 0, content: input.text, contentHash: randomUUID() });
    return row!.id;
  };
  return { context, userId, businessId, front: front!.id, evening: evening!.id, document };
}

async function found(context: { db: Database }, businessId: string, query: string, agentId?: string): Promise<string[]> {
  const result = await searchKnowledgeEvidence(context, { businessId, query, ...(agentId ? { agentId } : {}) });
  return result.matches.map((match) => match.title).sort();
}

describe.skipIf(!testUrl)("knowledge scoped to agents", () => {
  it("keeps an agent's own sources from every other agent", async () => {
    await rollbackTest(async (tx) => {
      const { context, businessId, front, evening, document } = await seed(tx);
      await document({ title: "Parking", text: "Free parking behind the clinic." });
      await document({ title: "Night parking", text: "After hours, parking is on Elm Street.", agentId: evening });

      await as(tx, "lobbystack_worker");
      expect(await found(context, businessId, "parking", evening)).toEqual(["Night parking", "Parking"]);
      expect(await found(context, businessId, "parking", front)).toEqual(["Parking"]);
      // No agent reads as the default agent.
      expect(await found(context, businessId, "parking")).toEqual(["Parking"]);
    });
  });

  it("turns a shared file off for one agent only", async () => {
    await rollbackTest(async (tx) => {
      const { context, userId, businessId, front, evening, document } = await seed(tx);
      const prices = await document({ title: "Prices", text: "A cleaning costs 120 dollars." });

      await as(tx, "lobbystack_app");
      await applyKnowledgeAction(context, { userId, businessId, action: "agent_disable", agentId: evening, items: [{ type: "file", id: prices }] });
      await as(tx, "lobbystack_worker");
      expect(await found(context, businessId, "cleaning", evening)).toEqual([]);
      expect(await found(context, businessId, "cleaning", front)).toEqual(["Prices"]);

      await as(tx, "lobbystack_app");
      const listed = await listKnowledgeSources(context, { userId, businessId, agentId: evening });
      expect(listed.shared.find((source) => source.id === prices)).toMatchObject({ kind: "file", agentActive: false, active: true });
      await applyKnowledgeAction(context, { userId, businessId, action: "agent_enable", agentId: evening, items: [{ type: "file", id: prices }] });
      await as(tx, "lobbystack_worker");
      expect(await found(context, businessId, "cleaning", evening)).toEqual(["Prices"]);
    });
  });

  it("turns one page of a shared website off for one agent, then the whole website, pages added later included", async () => {
    await rollbackTest(async (tx) => {
      const { context, userId, businessId, front, evening, document } = await seed(tx);
      const home = await document({ title: "Home", text: "Welcome to the harbor clinic.", sourceType: "website", sourceUrl: "https://harbor.example/" });
      await tx.insert(websiteIngestionJobs).values({ businessId, rootDocumentId: home, websiteUrl: "https://harbor.example/", provider: "firecrawl", status: "completed" });
      const team = await document({ title: "Team", text: "Our harbor dentists.", sourceType: "website", sourceUrl: "https://harbor.example/team", websiteDocumentId: home });
      await document({ title: "Hours", text: "The harbor clinic opens at nine.", sourceType: "website", sourceUrl: "https://www.harbor.example/hours", websiteDocumentId: home });

      await as(tx, "lobbystack_app");
      // The business page lists the website as one row.
      const business = await listKnowledgeSources(context, { userId, businessId });
      expect(business.shared).toHaveLength(1);
      expect(business.shared[0]).toMatchObject({ kind: "website", id: home, pageCount: 3, pagesOff: 0, active: true });
      expect((await listWebsitePages(context, { userId, businessId, documentId: team })).pages.map((page) => [page.title, page.removable])).toEqual([["Home", false], ["Team", true], ["Hours", true]]);

      await applyKnowledgeAction(context, { userId, businessId, action: "agent_disable", agentId: evening, items: [{ type: "page", id: team }] });
      await as(tx, "lobbystack_worker");
      expect(await found(context, businessId, "harbor", evening)).toEqual(["Home", "Hours"]);
      expect(await found(context, businessId, "harbor", front)).toEqual(["Home", "Hours", "Team"]);

      await as(tx, "lobbystack_app");
      await applyKnowledgeAction(context, { userId, businessId, action: "agent_disable", agentId: evening, items: [{ type: "website", id: home }] });
      await as(tx, null);
      await document({ title: "Insurance", text: "The harbor clinic takes most insurance.", sourceType: "website", sourceUrl: "https://harbor.example/insurance", websiteDocumentId: home });
      await as(tx, "lobbystack_worker");
      expect(await found(context, businessId, "harbor", evening)).toEqual([]);
      expect(await found(context, businessId, "harbor", front)).toEqual(["Home", "Hours", "Insurance", "Team"]);

      // Turning the website back on keeps the page it turned off.
      await as(tx, "lobbystack_app");
      await applyKnowledgeAction(context, { userId, businessId, action: "agent_enable", agentId: evening, items: [{ type: "website", id: home }] });
      const pages = await listWebsitePages(context, { userId, businessId, documentId: home, agentId: evening });
      expect(pages.source.agentActive).toBe(true);
      expect(pages.pages.find((page) => page.id === team)?.agentActive).toBe(false);
      await as(tx, "lobbystack_worker");
      expect(await found(context, businessId, "harbor", evening)).toEqual(["Home", "Hours", "Insurance"]);
    });
  });

  it("turns a website off for the business, and a page of it, for every agent", async () => {
    await rollbackTest(async (tx) => {
      const { context, userId, businessId, front, evening, document } = await seed(tx);
      const home = await document({ title: "Home", text: "Welcome to the harbor clinic.", sourceType: "website", sourceUrl: "https://harbor.example/" });
      await tx.insert(websiteIngestionJobs).values({ businessId, rootDocumentId: home, websiteUrl: "https://harbor.example/", provider: "firecrawl", status: "completed" });
      const team = await document({ title: "Team", text: "Our harbor dentists.", sourceType: "website", sourceUrl: "https://harbor.example/team", websiteDocumentId: home });

      await as(tx, "lobbystack_app");
      await applyKnowledgeAction(context, { userId, businessId, action: "disable", items: [{ type: "page", id: team }] });
      expect((await listKnowledgeSources(context, { userId, businessId })).shared[0]).toMatchObject({ pagesOff: 1, active: true });
      await as(tx, "lobbystack_worker");
      expect(await found(context, businessId, "harbor", evening)).toEqual(["Home"]);

      await as(tx, "lobbystack_app");
      await applyKnowledgeAction(context, { userId, businessId, action: "disable", items: [{ type: "website", id: home }] });
      await as(tx, "lobbystack_worker");
      expect(await found(context, businessId, "harbor", front)).toEqual([]);
      await as(tx, "lobbystack_app");
      await applyKnowledgeAction(context, { userId, businessId, action: "enable", items: [{ type: "website", id: home }] });
      await as(tx, "lobbystack_worker");
      expect(await found(context, businessId, "harbor", front)).toEqual(["Home"]);
    });
  });

  it("deletes several sources at once, and keeps another scope's out of reach", async () => {
    await rollbackTest(async (tx) => {
      const { context, userId, businessId, evening, document } = await seed(tx);
      const prices = await document({ title: "Prices", text: "A cleaning costs 120 dollars." });
      const night = await document({ title: "Night", text: "Night hours.", agentId: evening });
      await as(tx, "lobbystack_app");
      const faq = await createKnowledgeSnippet(context, { userId, businessId, title: "Parking", content: "Behind the clinic." });

      await expect(applyKnowledgeAction(context, { userId, businessId, action: "delete", items: [{ type: "file", id: night }] })).rejects.toMatchObject({ status: 404 });
      await expect(applyKnowledgeAction(context, { userId, businessId, action: "agent_disable", agentId: evening, items: [{ type: "file", id: night }] })).rejects.toMatchObject({ status: 404 });
      await expect(applyKnowledgeAction(context, { userId, businessId, action: "delete", items: [{ type: "file", id: prices }, { type: "snippet", id: faq }] })).resolves.toEqual({ changed: 2 });
      expect((await listKnowledgeSources(context, { userId, businessId, agentId: evening })).own.map((source) => source.id)).toEqual([night]);
      expect((await listKnowledgeSources(context, { userId, businessId })).shared).toEqual([]);
    });
  });

  it("refuses a website already in another scope, and says where it is", async () => {
    await rollbackTest(async (tx) => {
      const { businessId, evening } = await seed(tx);
      await createKnowledgeDocumentInTransaction(tx, { businessId, title: "Harbor", sourceUrl: "https://harbor.example/" });
      await expect(createKnowledgeDocumentInTransaction(tx, { businessId, title: "Harbor", sourceUrl: "https://www.harbor.example/evening", agentId: evening })).rejects.toMatchObject({ status: 409, code: "knowledge_website_in_shared", message: "This website is already in your shared knowledge. Turn it off for the agents that shouldn't use it." });
      const own = await createKnowledgeDocumentInTransaction(tx, { businessId, title: "Night", sourceUrl: "https://night.example/", agentId: evening });
      expect((await tx.select({ agentId: knowledgeDocuments.agentId }).from(knowledgeDocuments).where(eq(knowledgeDocuments.id, own)))[0]?.agentId).toBe(evening);
      // The reverse: a shared add of the agent's website, by the same URL or another page of it.
      for (const sourceUrl of ["https://night.example/", "https://night.example/menu"]) {
        await expect(createKnowledgeDocumentInTransaction(tx, { businessId, title: "Night", sourceUrl })).rejects.toMatchObject({ status: 409, code: "knowledge_website_in_agent", agentId: evening, message: "This website is already in Evening's knowledge." });
      }
    });
  });

  it("deletes an agent's own knowledge when the agent is removed, and leaves shared knowledge and other agents alone", async () => {
    await rollbackTest(async (tx) => {
      const { context, userId, businessId, front, evening, document } = await seed(tx);
      const shared = await document({ title: "Prices", text: "A cleaning costs 120 dollars." });
      const night = await document({ title: "Night", text: "Night door code.", agentId: evening });
      const frontOwn = await document({ title: "Desk", text: "Front desk notes.", agentId: front });
      await tx.insert(websiteIngestionJobs).values({ businessId, rootDocumentId: night, websiteUrl: "https://night.example/", provider: "firecrawl", status: "completed" });
      await as(tx, "lobbystack_app");
      const nightFaq = await createKnowledgeSnippet(context, { userId, businessId, title: "Night door", content: "Ring the bell.", agentId: evening });
      const sharedFaq = await createKnowledgeSnippet(context, { userId, businessId, title: "Parking", content: "Behind the clinic." });
      await applyKnowledgeAction(context, { userId, businessId, action: "agent_disable", agentId: evening, items: [{ type: "file", id: shared }] });
      await applyKnowledgeAction(context, { userId, businessId, action: "agent_disable", agentId: front, items: [{ type: "snippet", id: sharedFaq }] });

      await archiveAgent(context, { userId, businessId, agentId: evening });
      await as(tx, null);
      const documents = (await tx.select({ id: knowledgeDocuments.id }).from(knowledgeDocuments).where(eq(knowledgeDocuments.businessId, businessId))).map((row) => row.id).sort();
      expect(documents).toEqual([shared, frontOwn].sort());
      expect(await tx.select({ id: knowledgeChunks.id }).from(knowledgeChunks).where(eq(knowledgeChunks.documentId, night))).toEqual([]);
      expect(await tx.select({ id: websiteIngestionJobs.id }).from(websiteIngestionJobs).where(eq(websiteIngestionJobs.businessId, businessId))).toEqual([]);
      expect((await tx.select({ id: knowledgeSnippets.id }).from(knowledgeSnippets).where(eq(knowledgeSnippets.businessId, businessId))).map((row) => row.id)).toEqual([sharedFaq]);
      expect(nightFaq).toBeDefined();
      // Only the other agent's opt-out stays.
      expect(await tx.select({ agentId: agentKnowledgeExclusions.agentId, snippetId: agentKnowledgeExclusions.snippetId }).from(agentKnowledgeExclusions).where(eq(agentKnowledgeExclusions.businessId, businessId))).toEqual([{ agentId: front, snippetId: sharedFaq }]);
    });
  });

  it("gives each agent its own FAQs in the snapshot, and none to an agent whose knowledge matches the default agent's", async () => {
    await rollbackTest(async (tx) => {
      const { context, userId, businessId, front, evening } = await seed(tx);
      await as(tx, "lobbystack_app");
      const shared = await createKnowledgeSnippet(context, { userId, businessId, title: "Parking", content: "Behind the clinic." });
      await as(tx, "lobbystack_worker");
      await refreshBusinessSnapshot(context, { businessId });
      let snapshot = (await loadLatestBusinessSnapshot(context, { businessId }))!;
      expect(snapshot.knowledgeSnippets?.map((snippet) => snippet.title)).toEqual(["Parking"]);
      expect(snapshot.agents?.every((agent) => agent.knowledgeSnippets === undefined)).toBe(true);

      await as(tx, "lobbystack_app");
      await createKnowledgeSnippet(context, { userId, businessId, title: "Night door", content: "Ring the side bell.", agentId: evening });
      await applyKnowledgeAction(context, { userId, businessId, action: "agent_disable", agentId: evening, items: [{ type: "snippet", id: shared }] });
      // One transaction shares one now(), so the earlier snapshot would tie with the next.
      await as(tx, null);
      await tx.delete(businessContextSnapshots).where(eq(businessContextSnapshots.businessId, businessId));
      await as(tx, "lobbystack_worker");
      await refreshBusinessSnapshot(context, { businessId });
      snapshot = (await loadLatestBusinessSnapshot(context, { businessId }))!;
      expect(snapshot.knowledgeSnippets?.map((snippet) => snippet.title)).toEqual(["Parking"]);
      expect(snapshotForAgent(snapshot, evening)?.knowledgeSnippets?.map((snippet) => snippet.title)).toEqual(["Night door"]);
      expect(snapshotForAgent(snapshot, front)?.knowledgeSnippets?.map((snippet) => snippet.title)).toEqual(["Parking"]);
    });
  });

  it("reads an agent the snapshot doesn't list with its own FAQs, never the default agent's", async () => {
    await rollbackTest(async (tx) => {
      const { context, userId, businessId, front, evening } = await seed(tx);
      await as(tx, "lobbystack_app");
      const shared = await createKnowledgeSnippet(context, { userId, businessId, title: "Parking", content: "Behind the clinic." });
      await createKnowledgeSnippet(context, { userId, businessId, title: "Hours", content: "Open nine to five." });
      await createKnowledgeSnippet(context, { userId, businessId, title: "Desk", content: "Ask for Mira.", agentId: front });
      await createKnowledgeSnippet(context, { userId, businessId, title: "Night door", content: "Ring the side bell.", agentId: evening });
      await applyKnowledgeAction(context, { userId, businessId, action: "agent_disable", agentId: evening, items: [{ type: "snippet", id: shared }] });
      await as(tx, "lobbystack_worker");
      await refreshBusinessSnapshot(context, { businessId });
      const snapshot = (await loadLatestBusinessSnapshot(context, { businessId }))!;
      const titles = (agentId: string, agent: SnapshotAgent | null) => snapshotForAgent({ ...snapshot, agents: [...(snapshot.agents ?? []).filter((listed) => listed.id !== agentId), agent!] }, agentId)?.knowledgeSnippets?.map((snippet) => snippet.title).sort();

      // Shared FAQs it didn't turn off, and its own.
      expect(titles(evening, await loadSnapshotAgent(context, { businessId, agentId: evening, business: snapshot }))).toEqual(["Hours", "Night door"]);
      // The default agent's own FAQ stays the default agent's.
      expect(titles(front, await loadSnapshotAgent(context, { businessId, agentId: front, business: snapshot }))).toEqual(["Desk", "Hours", "Parking"]);

      // A call that started on an agent archived since reads it from its row: shared knowledge only, since its own went with it.
      await as(tx, "lobbystack_app");
      await archiveAgent(context, { userId, businessId, agentId: evening });
      // One transaction shares one now(), so the snapshot that still lists the agent would tie with the next.
      await as(tx, null);
      await tx.delete(businessContextSnapshots).where(eq(businessContextSnapshots.businessId, businessId));
      await as(tx, "lobbystack_worker");
      const call = await getBusinessSnapshotForAgent(context, { businessId, agentId: evening, underWay: true });
      expect(call?.agentId).toBe(evening);
      expect(call?.knowledgeSnippets?.map((snippet) => snippet.title).sort()).toEqual(["Hours", "Parking"]);
      await as(tx, null);
    });
  });

  it("gives a page the previous worker crawls for an agent's website that agent and website", async () => {
    await rollbackTest(async (tx) => {
      const { context, businessId, evening } = await seed(tx);
      const [night] = await tx.insert(knowledgeDocuments).values({ businessId, title: "Night", sourceType: "website", sourceUrl: "https://night.example/", status: "processing", agentId: evening }).returning({ id: knowledgeDocuments.id });
      await tx.insert(websiteIngestionJobs).values({ businessId, rootDocumentId: night!.id, websiteUrl: "https://night.example/", provider: "firecrawl", status: "running" });
      const [shared] = await tx.insert(knowledgeDocuments).values({ businessId, title: "Harbor", sourceType: "website", sourceUrl: "https://harbor.example/", status: "processing" }).returning({ id: knowledgeDocuments.id });
      await tx.insert(websiteIngestionJobs).values({ businessId, rootDocumentId: shared!.id, websiteUrl: "https://harbor.example/", provider: "firecrawl", status: "running" });
      // The previous worker's insert: no agent and no website.
      const oldWorkerSaves = async (sourceUrl: string) => await withBusinessTransaction(context.db, { businessId, actorType: "worker" }, async (inner) => {
        await inner.execute(sql`set local role lobbystack_worker`);
        const [page] = await inner.insert(knowledgeDocuments).values({ businessId, sourceType: "website", title: sourceUrl, sourceUrl, status: "processing" }).returning({ agentId: knowledgeDocuments.agentId, websiteDocumentId: knowledgeDocuments.websiteDocumentId });
        return page;
      });

      expect(await oldWorkerSaves("https://www.night.example/menu")).toEqual({ agentId: evening, websiteDocumentId: night!.id });
      // A shared website's pages stay shared.
      expect(await oldWorkerSaves("https://harbor.example/team")).toEqual({ agentId: null, websiteDocumentId: null });
      // Once the agent's import is done, a page on its host is someone adding it, not its crawl.
      await tx.update(knowledgeDocuments).set({ status: "indexed" }).where(eq(knowledgeDocuments.id, night!.id));
      expect(await oldWorkerSaves("https://night.example/later")).toEqual({ agentId: null, websiteDocumentId: null });
    });
  });

  it("shows an agent's exclusions to its business's team alone", async () => {
    await rollbackTest(async (tx) => {
      const { context, userId, businessId, evening, document } = await seed(tx);
      const prices = await document({ title: "Prices", text: "A cleaning costs 120 dollars." });
      await as(tx, "lobbystack_app");
      await applyKnowledgeAction(context, { userId, businessId, action: "agent_disable", agentId: evening, items: [{ type: "file", id: prices }] });
      const outsider = randomUUID();
      const other = await (async () => {
        await as(tx, null);
        await tx.insert(users).values({ id: outsider, email: `${outsider}@example.invalid`, normalizedEmail: `${outsider}@example.invalid`, name: "Outsider" });
        await as(tx, "lobbystack_app");
        return (await createBusiness(context, { userId: outsider, name: "Other Clinic", timezone: "UTC", businessType: "dental" })).businessId;
      })();

      const own = await withBusinessTransaction(context.db, { userId, businessId, actorType: "operator" }, async (inner) => await inner.select({ id: agentKnowledgeExclusions.id }).from(agentKnowledgeExclusions));
      expect(own).toHaveLength(1);
      // Someone outside the team sees nothing, from its own business or by naming this one.
      for (const actor of [{ userId: outsider, businessId }, { userId: outsider, businessId: other }]) {
        const leaked = await withBusinessTransaction(context.db, { ...actor, actorType: "operator" }, async (inner) => await inner.select({ id: agentKnowledgeExclusions.id }).from(agentKnowledgeExclusions));
        expect(leaked).toEqual([]);
      }
      await expect(listKnowledgeSources(context, { userId: outsider, businessId, agentId: evening })).rejects.toThrow();
      // Another business's context can't write one here.
      await expect(withBusinessTransaction(context.db, { userId: outsider, businessId: other, actorType: "operator" }, async (inner) => {
        await inner.insert(agentKnowledgeExclusions).values({ businessId, agentId: evening, documentId: prices });
      })).rejects.toThrow();
      expect(await tx.select({ id: knowledgeSnippets.id }).from(knowledgeSnippets).where(eq(knowledgeSnippets.businessId, other))).toEqual([]);
    });
  });

  it("links existing pages to the oldest website import on their host, as migration 0208 does", async () => {
    await rollbackTest(async (tx) => {
      const { businessId, document } = await seed(tx);
      const home = await document({ title: "Home", text: "Welcome.", sourceType: "website", sourceUrl: "https://harbor.example/" });
      await tx.insert(websiteIngestionJobs).values({ businessId, rootDocumentId: home, websiteUrl: "https://harbor.example/", provider: "firecrawl", status: "completed" });
      const team = await document({ title: "Team", text: "Dentists.", sourceType: "website", sourceUrl: "https://WWW.Harbor.example/team" });
      const stray = await document({ title: "Elsewhere", text: "Other.", sourceType: "website", sourceUrl: "https://other.example/" });
      const migration = readFileSync(new URL("../../../db/migrations/0208_agent_knowledge.sql", import.meta.url), "utf8");
      const backfill = migration.slice(migration.indexOf("WITH website_hosts"), migration.indexOf("page.website_document_id IS NULL;") + "page.website_document_id IS NULL".length);
      await tx.execute(sql.raw(backfill));
      const rows = await tx.select({ id: knowledgeDocuments.id, websiteDocumentId: knowledgeDocuments.websiteDocumentId }).from(knowledgeDocuments).where(eq(knowledgeDocuments.businessId, businessId));
      expect(Object.fromEntries(rows.map((row) => [row.id, row.websiteDocumentId]))).toEqual({ [home]: null, [team]: home, [stray]: null });
    });
  });
});
