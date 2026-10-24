import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { businesses, conversations, createDatabaseClient, messages, type Database, type DatabaseTransaction } from "@lobbystack/db";

import { INSTAGRAM_AI_REPLY_LIMIT, INSTAGRAM_AI_REPLY_WINDOW_MS, loadInstagramReplyContext, receiveInstagramMessage, saveInstagramReply } from "./instagram";

// Explicit opt-in only; never fall back to DATABASE_URL or load an env file.
const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
    throw new Error("Instagram integration tests require a dedicated local test database.");
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

async function asWorker<T>(tx: DatabaseTransaction, run: (db: Database) => Promise<T>): Promise<T> {
  await tx.execute(sql`set local session authorization lobbystack_worker`);
  try {
    return await run(tx as unknown as Database);
  } finally {
    await tx.execute(sql`reset session authorization`);
  }
}

/** A business whose receptionist has answered `replies` Instagram messages, then gets one more. */
async function seedExchange(tx: DatabaseTransaction, replies: number, at: (index: number) => Date) {
  const businessId = randomUUID();
  await tx.insert(businesses).values({ id: businessId, slug: businessId, name: "Javor", timezone: "UTC", businessType: "test", telemetryEnabled: true, deploymentMode: "self_hosted_standard" });
  // Every row in one transaction gets the same now(), so each message is stamped explicitly to keep their order.
  const stamp = (messageId: string | null | undefined, when: Date) => tx.update(messages).set({ createdAt: when }).where(eq(messages.id, messageId!));
  const receive = (index: number) => asWorker(tx, (db) => receiveInstagramMessage({ db }, { businessId, senderId: "igsid_other_bot", providerMessageId: `mid_${businessId}_${index}`, text: `Hi, can I book? (${index})`, sentAt: at(index) }));
  let conversationId = "";
  for (let index = 0; index < replies; index += 1) {
    const inbound = await receive(index);
    await stamp(inbound.messageId, at(index));
    conversationId ||= (await tx.select({ id: conversations.id }).from(conversations).where(eq(conversations.businessId, businessId)).limit(1))[0]!.id;
    const reply = await asWorker(tx, (db) => saveInstagramReply({ db }, { businessId, conversationId, answeringMessageId: inbound.messageId!, body: `Sure, which day? (${index})` }));
    await stamp(reply, new Date(at(index).getTime() + 500));
  }
  const latest = await receive(replies);
  await stamp(latest.messageId, new Date());
  conversationId ||= (await tx.select({ id: conversations.id }).from(conversations).where(eq(conversations.businessId, businessId)).limit(1))[0]!.id;
  const load = () => asWorker(tx, (db) => loadInstagramReplyContext({ db }, { businessId, conversationId, messageId: latest.messageId! }));
  const save = () => asWorker(tx, (db) => saveInstagramReply({ db }, { businessId, conversationId, answeringMessageId: latest.messageId!, body: "Sure, which day?" }));
  const receiveNewer = async () => {
    const newer = await receive(replies + 1);
    await stamp(newer.messageId, new Date(Date.now() + 1_000));
  };
  const state = async () => (await tx.select({ state: conversations.automationState }).from(conversations).where(eq(conversations.id, conversationId)))[0]?.state;
  return { businessId, conversationId, load, save, receiveNewer, state };
}

/** One round a second, all within the last minute. */
const recently = (index: number) => new Date(Date.now() - 60_000 + index * 1_000);

describe.skipIf(!testUrl)("Instagram reply limit against PostgreSQL under production logins", () => {
  it("hands the conversation to the team once the receptionist has replied too often in the window", async () => {
    await rollbackTest(async (tx) => {
      const exchange = await seedExchange(tx, INSTAGRAM_AI_REPLY_LIMIT, recently);

      expect(await exchange.load()).toBeNull();
      expect(await exchange.state()).toBe("human_handoff");
    });
  });

  it("keeps answering when the earlier replies are older than the window", async () => {
    await rollbackTest(async (tx) => {
      const longAgo = Date.now() - INSTAGRAM_AI_REPLY_WINDOW_MS - 60_000;
      const exchange = await seedExchange(tx, INSTAGRAM_AI_REPLY_LIMIT, (index) => new Date(longAgo + index * 1_000));

      expect(await exchange.load()).not.toBeNull();
      expect(await exchange.state()).toBe("ai_active");
    });
  });

  it("drops a reply when the team took the conversation over while it was written", async () => {
    await rollbackTest(async (tx) => {
      const exchange = await seedExchange(tx, 0, recently);
      expect(await exchange.load()).not.toBeNull();
      await tx.update(conversations).set({ automationState: "human_handoff" }).where(eq(conversations.id, exchange.conversationId));

      expect(await exchange.save()).toBeNull();
    });
  });

  it("drops a reply when a newer message arrived while it was written", async () => {
    await rollbackTest(async (tx) => {
      const exchange = await seedExchange(tx, 0, recently);
      expect(await exchange.load()).not.toBeNull();
      await exchange.receiveNewer();

      expect(await exchange.save()).toBeNull();
    });
  });

  it("keeps answering below the limit", async () => {
    await rollbackTest(async (tx) => {
      const exchange = await seedExchange(tx, INSTAGRAM_AI_REPLY_LIMIT - 1, recently);

      expect(await exchange.load()).not.toBeNull();
      expect(await exchange.state()).toBe("ai_active");
    });
  });
});
