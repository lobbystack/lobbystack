import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { agents, businesses, businessNotifications, conversations, createDatabaseClient, instagramAccounts, messages, outboxMessages, users, type Database, type DatabaseTransaction } from "@lobbystack/db";

import { connectInstagramAccount, disconnectInstagramAccount, finishInstagramDelivery, getInstagramAccount, refreshInstagramTokenIfDue, INSTAGRAM_AI_REPLY_LIMIT, INSTAGRAM_AI_REPLY_WINDOW_MS, loadInstagramReplyContext, receiveInstagramMessage, saveInstagramReply } from "./instagram";
import { createBusiness } from "./tenancy";

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

/** A business whose agent has answered `replies` Instagram messages, then gets one more. */
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
  it("hands the conversation to the team once the agent has replied too often in the window", async () => {
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

describe.skipIf(!testUrl)("connecting Instagram for one agent against PostgreSQL", () => {
  /** An owner's business with its default agent and a second one, "Evening", as the app role. */
  async function seedAgents(tx: DatabaseTransaction) {
    const userId = randomUUID();
    await tx.insert(users).values({ id: userId, email: `${userId}@example.invalid`, normalizedEmail: `${userId}@example.invalid`, name: "Owner", emailVerified: true });
    await tx.execute(sql`set local role lobbystack_app`);
    const context = { db: tx as unknown as Database };
    const { businessId } = await createBusiness(context, { userId, name: "Javor", timezone: "UTC", businessType: "test" });
    await tx.execute(sql`reset role`);
    const [frontDesk] = await tx.select().from(agents).where(and(eq(agents.businessId, businessId), eq(agents.isDefault, true)));
    const { id: _id, isDefault: _isDefault, createdAt: _createdAt, updatedAt: _updatedAt, ...settings } = frontDesk!;
    const [evening] = await tx.insert(agents).values({ ...settings, name: "Evening", isDefault: false }).returning({ id: agents.id });
    await tx.execute(sql`set local role lobbystack_app`);
    const connect = async (agentId?: string) => await connectInstagramAccount(context, { userId, businessId, ...(agentId ? { agentId } : {}), instagramUserId: `ig_${businessId}`, username: "javor", encryptedAccessToken: "sealed", tokenExpiresAt: new Date(Date.now() + 86_400_000) });
    const accountAgent = async () => (await getInstagramAccount(context, { userId, businessId }))?.agentId;
    return { businessId, userId, frontDesk: frontDesk!.id, evening: evening!.id, connect, accountAgent };
  }

  it("puts a new account on the agent it started from, and a state without one on the default agent", async () => {
    await rollbackTest(async (tx) => {
      const world = await seedAgents(tx);
      expect(await world.connect(world.evening)).toEqual({ agentId: world.evening });
      expect(await world.accountAgent()).toBe(world.evening);
      // Reconnecting without an agent keeps the one it answers as.
      expect(await world.connect()).toEqual({ agentId: world.evening });
      await tx.execute(sql`reset role`);
      expect((await tx.select({ topic: outboxMessages.topic }).from(outboxMessages).where(and(eq(outboxMessages.businessId, world.businessId), eq(outboxMessages.aggregateId, world.evening)))).map((row) => row.topic)).toContain("snapshot.refresh");
      await tx.delete(instagramAccounts).where(eq(instagramAccounts.businessId, world.businessId));
      await tx.execute(sql`set local role lobbystack_app`);
      expect(await world.connect()).toEqual({ agentId: world.frontDesk });
    });
  });

  it("moves the account and its open conversations to another agent, and leaves it where it is for an archived one", async () => {
    await rollbackTest(async (tx) => {
      const world = await seedAgents(tx);
      await world.connect();
      await tx.execute(sql`reset role`);
      const [open] = await tx.insert(conversations).values({ businessId: world.businessId, agentId: world.frontDesk, channel: "instagram", status: "open" }).returning({ id: conversations.id });
      await tx.execute(sql`set local role lobbystack_app`);
      expect(await world.connect(world.evening)).toEqual({ agentId: world.evening });
      await tx.execute(sql`reset role`);
      expect((await tx.select({ agentId: conversations.agentId }).from(conversations).where(eq(conversations.id, open!.id)))[0]?.agentId).toBe(world.evening);
      const [weekend] = await tx.insert(agents).values({ businessId: world.businessId, name: "Weekend", greeting: "Hi", tone: "warm", bookingPolicy: "Book", transferMode: "never", archivedAt: new Date() }).returning({ id: agents.id });
      await tx.execute(sql`set local role lobbystack_app`);
      expect(await world.connect(weekend!.id)).toEqual({ agentId: world.evening });
    });
  });
  it("posts Instagram needing a reconnect to the bell, from a refused refresh or send, until someone connects or removes it", async () => {
    await rollbackTest(async (tx) => {
      const world = await seedAgents(tx);
      await world.connect();
      await tx.execute(sql`reset role`);
      const bell = async () => await tx.select({ kind: businessNotifications.kind, params: businessNotifications.params, resolvedAt: businessNotifications.resolvedAt }).from(businessNotifications).where(eq(businessNotifications.businessId, world.businessId));
      await tx.update(instagramAccounts).set({ tokenExpiresAt: new Date(Date.now() - 60_000) }).where(eq(instagramAccounts.businessId, world.businessId));
      const refused = Object.assign(new Error("expired"), { reconnectRequired: true });
      expect(await asWorker(tx, (db) => refreshInstagramTokenIfDue({ db }, { businessId: world.businessId, decryptToken: (value) => value, encryptToken: (value) => value, refreshAccessToken: async () => { throw refused; } }))).toBe("reconnect_required");
      expect(await bell()).toEqual([{ kind: "instagram_reconnect", params: { username: "javor" }, resolvedAt: null }]);

      await tx.execute(sql`set local role lobbystack_app`);
      await world.connect();
      await tx.execute(sql`reset role`);
      expect((await bell())[0]?.resolvedAt).toBeInstanceOf(Date);

      // A send Instagram refuses for the token opens it again.
      await asWorker(tx, (db) => finishInstagramDelivery({ db }, { businessId: world.businessId, messageId: randomUUID(), status: "failed", reason: "token", reconnectRequired: true }));
      expect((await bell())[0]?.resolvedAt).toBeNull();
      await tx.execute(sql`set local role lobbystack_app`);
      expect(await disconnectInstagramAccount({ db: tx as unknown as Database }, { userId: world.userId, businessId: world.businessId })).toBe(true);
      await tx.execute(sql`reset role`);
      expect((await bell())[0]?.resolvedAt).toBeInstanceOf(Date);
    });
  });
});
