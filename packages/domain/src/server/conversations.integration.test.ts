import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { businesses, calls, contacts, conversations, conversationSessions, createDatabaseClient, transcripts, withBusinessTransaction, type Database, type DatabaseTransaction } from "@lobbystack/db";

import { recordCallOutcomeInTransaction } from "./callOutcome";
import { finalizeConversationSession, loadCallSummaryInput } from "./conversations";

// Explicit opt-in only; never fall back to DATABASE_URL or load an env file.
const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
    throw new Error("Conversation integration tests require a dedicated local test database.");
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

type Fixture = { db: Database; businessId: string; callId: string; contactId: string; conversationId: string };

async function seedCall(tx: DatabaseTransaction, input: { locale?: string; contactName?: string; turns: Array<[string, string]> }): Promise<Fixture> {
  const businessId = randomUUID();
  const contactId = randomUUID();
  const conversationId = randomUUID();
  const callId = randomUUID();
  await tx.insert(businesses).values({ id: businessId, slug: businessId, name: "Call summary test", timezone: "UTC", businessType: "test", defaultLocale: input.locale ?? "en", telemetryEnabled: false });
  await tx.insert(contacts).values({ id: contactId, businessId, phone: "+15145550100", ...(input.contactName ? { name: input.contactName } : {}) });
  await tx.insert(conversations).values({ id: conversationId, businessId, contactId, channel: "voice" });
  await tx.insert(calls).values({ id: callId, businessId, conversationId, contactId, providerCallId: `rtc_${callId}`, transport: "phone", status: "completed", startedAt: new Date(Date.now() - 60_000), endedAt: new Date(), disposition: "caller_finished" });
  await tx.insert(transcripts).values(input.turns.map(([speaker, text], index) => ({ businessId, callId, sequence: index + 1, speaker, text, final: true })));
  await tx.execute(sql`set local role lobbystack_worker`);
  return { db: tx as unknown as Database, businessId, callId, contactId, conversationId };
}

async function readBack(fixture: Fixture) {
  return await withBusinessTransaction(fixture.db, { businessId: fixture.businessId, actorType: "worker" }, async (tx) => ({
    session: (await tx.select({ summaryKind: conversationSessions.summaryKind, summary: conversationSessions.summary }).from(conversationSessions).where(eq(conversationSessions.callId, fixture.callId)))[0],
    conversation: (await tx.select({ summary: conversations.summary }).from(conversations).where(eq(conversations.id, fixture.conversationId)))[0],
    contact: (await tx.select({ name: contacts.name }).from(contacts).where(eq(contacts.id, fixture.contactId)))[0],
  }));
}

const fridayCall: Array<[string, string]> = [
  ["assistant", "Thanks for calling, how can I help?"],
  ["caller", "Hi, this is Marie. Are you open on Friday?"],
  ["assistant", "Yes, we're open 9 to 5."],
];

describe.skipIf(!testUrl)("call summaries against PostgreSQL under worker RLS", () => {
  it("stores the generated summary and a spoken caller name once", async () => {
    await rollbackTest(async (tx) => {
      const fixture = await seedCall(tx, { turns: fridayCall });
      const input = await loadCallSummaryInput({ db: fixture.db }, fixture);
      expect(input).toMatchObject({ conversationId: fixture.conversationId, locale: "en", disposition: "caller_finished", needsSummary: true, needsCallerName: true });
      expect(input?.transcript).toHaveLength(3);

      const generated = { summary: "Asked about Friday hours; told the office is open 9 to 5.", callerName: "Marie" };
      expect(await finalizeConversationSession({ db: fixture.db }, { ...fixture, generated })).toMatchObject({ finalized: true });
      expect(await readBack(fixture)).toEqual({
        session: { summaryKind: "summary", summary: { kind: "summary", summary: generated.summary } },
        conversation: { summary: generated.summary },
        contact: { name: "Marie" },
      });

      // A retried job neither calls the model again nor rewrites the summary.
      expect(await loadCallSummaryInput({ db: fixture.db }, fixture)).toBeUndefined();
      expect(await finalizeConversationSession({ db: fixture.db }, { ...fixture, generated: { summary: "Different" } })).toMatchObject({ finalized: false });
      expect((await readBack(fixture)).conversation?.summary).toBe(generated.summary);
    });
  });

  it("never replaces an existing contact name or stores an invented one", async () => {
    await rollbackTest(async (tx) => {
      const named = await seedCall(tx, { contactName: "Marie-Claude Roy", turns: fridayCall });
      expect(await loadCallSummaryInput({ db: named.db }, named)).toMatchObject({ needsCallerName: false });
      await finalizeConversationSession({ db: named.db }, { ...named, generated: { summary: "Asked about Friday hours.", callerName: "Marie" } });
      expect((await readBack(named)).contact?.name).toBe("Marie-Claude Roy");
    });
    await rollbackTest(async (tx) => {
      const anonymous = await seedCall(tx, { turns: [["caller", "Are you open on Friday afternoon?"]] });
      await finalizeConversationSession({ db: anonymous.db }, { ...anonymous, generated: { summary: "Asked about Friday hours.", callerName: "John Smith" } });
      expect((await readBack(anonymous)).contact?.name).toBeNull();
    });
  });

  it("keeps a recorded booking over the generated summary", async () => {
    await rollbackTest(async (tx) => {
      const fixture = await seedCall(tx, { turns: fridayCall });
      const booked = { kind: "booked" as const, serviceName: "Cleaning", startsAt: "2027-01-08T15:00:00.000Z" };
      await withBusinessTransaction(fixture.db, { businessId: fixture.businessId, actorType: "worker" }, async (workerTx) => {
        await recordCallOutcomeInTransaction(workerTx, { businessId: fixture.businessId, callId: fixture.callId, outcome: booked });
      });
      expect(await loadCallSummaryInput({ db: fixture.db }, fixture)).toMatchObject({ needsSummary: false, needsCallerName: true });
      await finalizeConversationSession({ db: fixture.db }, { ...fixture, generated: { callerName: "Marie" } });
      expect(await readBack(fixture)).toMatchObject({ session: { summaryKind: "booked", summary: booked }, contact: { name: "Marie" } });
    });
  });

  it("falls back to the French heuristic when no summary was generated", async () => {
    await rollbackTest(async (tx) => {
      const fixture = await seedCall(tx, { locale: "fr", turns: [["assistant", "Bonjour, comment puis-je vous aider?"], ["caller", "Oui"]] });
      expect(await loadCallSummaryInput({ db: fixture.db }, fixture)).toMatchObject({ locale: "fr" });
      await tx.execute(sql`reset role`);
      await tx.update(calls).set({ disposition: null }).where(eq(calls.id, fixture.callId));
      await tx.execute(sql`set local role lobbystack_worker`);
      await finalizeConversationSession({ db: fixture.db }, fixture);
      expect((await readBack(fixture)).session).toEqual({ summaryKind: "summary", summary: { kind: "summary", summary: "Résumé de l'appel : Bonjour, comment puis-je vous aider? Oui" } });
    });
  });
});
