import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { agentRules, agents, businesses, createDatabaseClient, instagramAccounts, outboxMessages, type DatabaseTransaction } from "@lobbystack/db";

import { saveReceptionistProfileInTransaction } from "./receptionistProfile";

// Migration 0203 and the old instruction fields, against a dedicated test database. Every test rolls back.

const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
    throw new Error("Rule channel integration tests require a dedicated local test database.");
  }
}
const client = testUrl ? createDatabaseClient("lobbystack_migrator", { DATABASE_URL: testUrl }) : undefined;
afterAll(async () => { await client?.pool.end(); });

async function rollbackTest(run: (tx: DatabaseTransaction) => Promise<void>) {
  const rollback = new Error("rollback test fixture");
  try {
    await client!.db.transaction(async (tx) => {
      await run(tx);
      await tx.execute(sql`set constraints all immediate`);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
}

const migration = readFileSync(new URL("../../../db/migrations/0203_rule_channels.sql", import.meta.url), "utf8");
const agentFields = { tone: "warm", summary: "A clinic", bookingPolicy: "Book", transferMode: "on_request", greeting: "Hello" };

async function business(tx: DatabaseTransaction, defaultLocale: string): Promise<string> {
  const id = randomUUID();
  await tx.insert(businesses).values({ id, slug: `rule-channels-${id}`, name: "Harbor Dental", timezone: "UTC", businessType: "test", defaultLocale });
  return id;
}

const rulesOf = async (tx: DatabaseTransaction, agentId: string) => await tx
  .select({ title: agentRules.title, content: agentRules.content, channel: agentRules.channel, active: agentRules.active, sortOrder: agentRules.sortOrder })
  .from(agentRules).where(eq(agentRules.agentId, agentId)).orderBy(asc(agentRules.sortOrder));

describe.skipIf(!testUrl)("migration 0203 on sample rows", () => {
  it("turns each agent's instructions into rules for their channel, titled in its business's language, and refreshes its snapshot", async () => {
    // The French business has Instagram linked, so its chat instructions also become an Instagram rule. The others have none.
    await rollbackTest(async (tx) => {
      const french = await business(tx, "fr");
      const filipino = await business(tx, "fil-PH");
      const unknown = await business(tx, "xx");
      const [full] = await tx.insert(agents).values({ ...agentFields, businessId: french, isDefault: true, voiceInstructions: "  Parlez lentement.  ", smsInstructions: "Signez Harbor.", chatInstructions: "Soyez bref." }).returning({ id: agents.id });
      const [blank] = await tx.insert(agents).values({ ...agentFields, businessId: french, name: "Vide", voiceInstructions: "   ", smsInstructions: null, chatInstructions: "" }).returning({ id: agents.id });
      const [tagalog] = await tx.insert(agents).values({ ...agentFields, businessId: filipino, isDefault: true, smsInstructions: "Text back soon." }).returning({ id: agents.id });
      const [fallback] = await tx.insert(agents).values({ ...agentFields, businessId: unknown, isDefault: true, voiceInstructions: "Speak slowly.", chatInstructions: "Be brief." }).returning({ id: agents.id });
      // Linked after its agents exist, so the account's trigger finds the default agent.
      await tx.insert(instagramAccounts).values({ businessId: french, instagramUserId: `ig-${french}`, encryptedAccessToken: "sealed", tokenExpiresAt: new Date(Date.now() + 86_400_000), status: "reconnect_required" });
      // An agent with a call rule already keeps it, and gets the others after its last rule.
      await tx.insert(agentRules).values([
        { businessId: unknown, agentId: fallback!.id, title: "Parking", content: "Rear lot", sortOrder: 4 },
        { businessId: unknown, agentId: fallback!.id, title: "Mine", content: "My call rule", sortOrder: 5, channel: "voice" },
      ]);

      // The migration alters the table, which PostgreSQL refuses while deferred checks from these inserts wait.
      await tx.execute(sql`set constraints all immediate`);
      await tx.execute(sql.raw(migration));

      expect(await rulesOf(tx, full!.id)).toEqual([
        { title: "Pendant les appels", content: "Parlez lentement.", channel: "voice", active: true, sortOrder: 0 },
        { title: "Par texto", content: "Signez Harbor.", channel: "sms", active: true, sortOrder: 1 },
        { title: "Dans le chat du site", content: "Soyez bref.", channel: "web_chat", active: true, sortOrder: 2 },
        { title: "Sur Instagram", content: "Soyez bref.", channel: "instagram", active: true, sortOrder: 3 },
      ]);
      expect(await rulesOf(tx, blank!.id)).toEqual([]);
      expect(await rulesOf(tx, tagalog!.id)).toEqual([{ title: "Sa mga text", content: "Text back soon.", channel: "sms", active: true, sortOrder: 0 }]);
      expect(await rulesOf(tx, fallback!.id)).toEqual([
        { title: "Parking", content: "Rear lot", channel: null, active: true, sortOrder: 4 },
        { title: "Mine", content: "My call rule", channel: "voice", active: true, sortOrder: 5 },
        { title: "In website chat", content: "Be brief.", channel: "web_chat", active: true, sortOrder: 6 },
      ]);
      const refreshes = await tx.select({ aggregateId: outboxMessages.aggregateId, payload: outboxMessages.payload }).from(outboxMessages)
        .where(and(eq(outboxMessages.topic, "snapshot.refresh"), inArray(outboxMessages.businessId, [french, filipino, unknown])));
      expect(refreshes.map((row) => row.aggregateId).sort()).toEqual([full!.id, tagalog!.id, fallback!.id].sort());
      expect(refreshes.find((row) => row.aggregateId === full!.id)?.payload).toEqual({ businessId: french, reason: "agent_updated" });

      // A second run adds nothing.
      await tx.execute(sql.raw(migration));
      expect(await rulesOf(tx, full!.id)).toHaveLength(4);
      expect(await rulesOf(tx, fallback!.id)).toHaveLength(3);
      // A savepoint keeps the refused insert from aborting the test's transaction.
      await expect(tx.transaction(async (inner) => { await inner.execute(sql`insert into public.agent_rules (business_id, agent_id, title, content, channel) values (${french}::uuid, ${full!.id}::uuid, 'Bad', 'Bad', 'email')`); })).rejects.toThrow();
    });
  });
});

describe.skipIf(!testUrl)("the old instruction fields", () => {
  it("write the agent's channel rules, in the business's language, and read them back", async () => {
    await rollbackTest(async (tx) => {
      const businessId = await business(tx, "fr");
      const [agent] = await tx.insert(agents).values({ ...agentFields, businessId, isDefault: true }).returning({ id: agents.id });
      const save = async (patch: Parameters<typeof saveReceptionistProfileInTransaction>[1]["patch"]) => await saveReceptionistProfileInTransaction(tx, { businessId, businessName: "Harbor Dental", patch });

      expect(await save({ voiceInstructions: "Parlez lentement.", chatInstructions: "Soyez bref." })).toMatchObject({ voiceInstructions: "Parlez lentement.", smsInstructions: null, chatInstructions: "Soyez bref." });
      expect(await rulesOf(tx, agent!.id)).toEqual([
        { title: "Pendant les appels", content: "Parlez lentement.", channel: "voice", active: true, sortOrder: 0 },
        { title: "Dans le chat du site", content: "Soyez bref.", channel: "web_chat", active: true, sortOrder: 1 },
        { title: "Sur Instagram", content: "Soyez bref.", channel: "instagram", active: true, sortOrder: 2 },
      ]);
      // The columns stay as they were.
      expect((await tx.select({ voiceInstructions: agents.voiceInstructions, chatInstructions: agents.chatInstructions }).from(agents).where(eq(agents.id, agent!.id)))[0]).toEqual({ voiceInstructions: null, chatInstructions: null });

      // A rule someone turned off reads as none, and writing the field turns it back on.
      await tx.update(agentRules).set({ active: false }).where(and(eq(agentRules.agentId, agent!.id), eq(agentRules.channel, "voice")));
      expect(await save({ tone: "calm" })).toMatchObject({ voiceInstructions: null });
      expect(await save({ voiceInstructions: "Parlez lentement." })).toMatchObject({ voiceInstructions: "Parlez lentement." });
      expect((await rulesOf(tx, agent!.id))[0]).toMatchObject({ channel: "voice", active: true });

      // null deletes the channel's rule, both of them for chat.
      expect(await save({ chatInstructions: null })).toMatchObject({ voiceInstructions: "Parlez lentement.", chatInstructions: null });
      expect((await rulesOf(tx, agent!.id)).map((rule) => rule.channel)).toEqual(["voice"]);
      const refreshes = await tx.select({ id: outboxMessages.id }).from(outboxMessages).where(and(eq(outboxMessages.businessId, businessId), eq(outboxMessages.topic, "snapshot.refresh"), eq(outboxMessages.aggregateType, "agent_rule")));
      expect(refreshes.length).toBeGreaterThan(0);
    });
  });
});
