import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { agentRules, agents, billingAccounts, businessContextSnapshots, businesses, contacts, conversations, createDatabaseClient, outboxMessages, phoneNumbers, widgetKeys, type Database, type DatabaseTransaction } from "@lobbystack/db";
import type { BusinessContextSnapshot } from "@lobbystack/shared";

import { snapshotForAgent } from "../snapshot";
import { archiveAgentInTransaction, createAgentInTransaction, moveChannelInTransaction, pausedAgentIds, setDefaultAgentInTransaction } from "./agents";
import { loadEntitlement } from "./entitlement";
import { refreshBusinessSnapshot } from "./knowledge";

// Creating, archiving and re-pointing agents against PostgreSQL, each test as
// the migrator inside a transaction that always rolls back.

// Explicit opt-in only; never fall back to DATABASE_URL or load an env file.
const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
    throw new Error("Reliability integration tests require a dedicated local test database.");
  }
}
const client = testUrl ? createDatabaseClient("lobbystack_migrator", { DATABASE_URL: testUrl }) : undefined;
afterAll(async () => { await client?.pool.end(); });

type World = { tx: DatabaseTransaction; businessId: string; defaultAgent: string; numberId: string; widgetId: string };

/** A cloud business on `plan` with its default agent, a number, a widget and one rule. */
async function withBusiness(plan: "free_cloud" | "starter", run: (world: World) => Promise<void>) {
  const rollback = new Error("rollback test fixture");
  try {
    await client!.db.transaction(async (tx) => {
      const businessId = randomUUID();
      await tx.insert(businesses).values({ id: businessId, slug: `agents-${businessId}`, name: "Harbor Dental", timezone: "UTC", businessType: "test", deploymentMode: "cloud" });
      await tx.insert(billingAccounts).values({ businessId, billingKey: `business:${businessId}`, plan, subscriptionState: plan === "starter" ? "active" : "none" }).onConflictDoUpdate({ target: billingAccounts.businessId, set: { plan, subscriptionState: plan === "starter" ? "active" : "none" } });
      const [agent] = await tx.insert(agents).values({ businessId, isDefault: true, name: "Front desk", greeting: "Front desk here", tone: "warm", bookingPolicy: "Book", transferMode: "on_request", voice: "cedar", voiceInstructions: "Day voice" }).returning({ id: agents.id });
      const [number] = await tx.insert(phoneNumbers).values({ businessId, agentId: agent!.id, e164: "+15145550111", providerPhoneId: `PN${randomUUID()}`, status: "active", carrier: "twilio" }).returning({ id: phoneNumbers.id });
      const [widget] = await tx.insert(widgetKeys).values({ businessId, agentId: agent!.id, keyHash: randomUUID() }).returning({ id: widgetKeys.id });
      await tx.insert(agentRules).values([{ businessId, agentId: agent!.id, title: "Day rule", content: "Offer mornings", sortOrder: 0 }, { businessId, agentId: agent!.id, title: "On calls", content: "Day voice", sortOrder: 1, channel: "voice" }]);
      await run({ tx, businessId, defaultAgent: agent!.id, numberId: number!.id, widgetId: widget!.id });
      await tx.execute(sql`set constraints all immediate`);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
}

const outbox = async (tx: DatabaseTransaction, businessId: string, topic: string) => await tx.select({ aggregateId: outboxMessages.aggregateId }).from(outboxMessages).where(and(eq(outboxMessages.businessId, businessId), eq(outboxMessages.topic, topic)));

async function openConversation(tx: DatabaseTransaction, businessId: string, agentId: string, channel: string) {
  const [contact] = await tx.insert(contacts).values({ businessId, phone: `+1416555${Math.floor(1000 + Math.random() * 8999)}` }).returning({ id: contacts.id });
  const [conversation] = await tx.insert(conversations).values({ businessId, contactId: contact!.id, agentId, channel, status: "open", automationState: "ai_active" }).returning({ id: conversations.id });
  return conversation!.id;
}
const agentOf = async (tx: DatabaseTransaction, conversationId: string) => (await tx.select({ agentId: conversations.agentId }).from(conversations).where(eq(conversations.id, conversationId)))[0]?.agentId;

describe.skipIf(!testUrl)("managing a business's agents", () => {
  it("copies the agent it starts from, with its rules and none of its channels", async () => {
    await withBusiness("starter", async ({ tx, businessId, defaultAgent }) => {
      const evening = await createAgentInTransaction(tx, { businessId, name: "  Evening  " });
      // The deprecated instruction column stays behind; the call rule carries its text.
      expect(evening).toMatchObject({ name: "Evening", isDefault: false, greeting: "Front desk here", voice: "cedar", voiceInstructions: null, archivedAt: null });
      expect(evening.id).not.toBe(defaultAgent);
      expect((await tx.select({ title: agentRules.title, channel: agentRules.channel }).from(agentRules).where(eq(agentRules.agentId, evening.id)).orderBy(agentRules.sortOrder))).toEqual([{ title: "Day rule", channel: null }, { title: "On calls", channel: "voice" }]);
      expect(await tx.select({ id: phoneNumbers.id }).from(phoneNumbers).where(eq(phoneNumbers.agentId, evening.id))).toEqual([]);
      expect((await outbox(tx, businessId, "snapshot.refresh")).map((row) => row.aggregateId)).toContain(evening.id);
    });
  });

  it("keeps Free to one agent", async () => {
    await withBusiness("free_cloud", async ({ tx, businessId }) => {
      expect((await loadEntitlement(tx, businessId)).includedAgents).toBe(1);
      await expect(createAgentInTransaction(tx, { businessId, name: "Evening" })).rejects.toMatchObject({ status: 402, code: "agent_limit_reached" });
    });
  });

  it("refuses a name that's empty or too long", async () => {
    await withBusiness("starter", async ({ tx, businessId }) => {
      await expect(createAgentInTransaction(tx, { businessId, name: "   " })).rejects.toMatchObject({ status: 400, code: "agent_name_invalid" });
      await expect(createAgentInTransaction(tx, { businessId, name: "x".repeat(81) })).rejects.toMatchObject({ status: 400 });
    });
  });

  it("moves a number with its open text conversations, and leaves a call's conversation", async () => {
    await withBusiness("starter", async ({ tx, businessId, defaultAgent, numberId }) => {
      const evening = await createAgentInTransaction(tx, { businessId, name: "Evening" });
      const text = await openConversation(tx, businessId, defaultAgent, "sms");
      const call = await openConversation(tx, businessId, defaultAgent, "voice");
      const chat = await openConversation(tx, businessId, defaultAgent, "web_chat");
      await moveChannelInTransaction(tx, { businessId, kind: "phone_number", channelId: numberId, agentId: evening.id });
      expect((await tx.select({ agentId: phoneNumbers.agentId }).from(phoneNumbers).where(eq(phoneNumbers.id, numberId)))[0]?.agentId).toBe(evening.id);
      expect([await agentOf(tx, text), await agentOf(tx, call), await agentOf(tx, chat)]).toEqual([evening.id, defaultAgent, defaultAgent]);
      expect((await outbox(tx, businessId, "phoneNumber.route")).map((row) => row.aggregateId)).toEqual([numberId]);
    });
  });

  it("refuses to move a channel to an agent the business doesn't have", async () => {
    await withBusiness("starter", async ({ tx, businessId, widgetId }) => {
      await expect(moveChannelInTransaction(tx, { businessId, kind: "widget_key", channelId: widgetId, agentId: randomUUID() })).rejects.toMatchObject({ status: 404, code: "agent_not_found" });
    });
  });

  it("won't archive the default agent", async () => {
    await withBusiness("starter", async ({ tx, businessId, defaultAgent }) => {
      await expect(archiveAgentInTransaction(tx, { businessId, agentId: defaultAgent })).rejects.toMatchObject({ status: 409, code: "agent_is_default" });
    });
  });

  it("archives an agent after handing its channels and open conversations to the default agent", async () => {
    await withBusiness("starter", async ({ tx, businessId, defaultAgent, numberId, widgetId }) => {
      const evening = await createAgentInTransaction(tx, { businessId, name: "Evening" });
      await moveChannelInTransaction(tx, { businessId, kind: "phone_number", channelId: numberId, agentId: evening.id });
      await moveChannelInTransaction(tx, { businessId, kind: "widget_key", channelId: widgetId, agentId: evening.id });
      const text = await openConversation(tx, businessId, evening.id, "sms");
      expect(await archiveAgentInTransaction(tx, { businessId, agentId: evening.id })).toEqual({ moved: 2 });
      expect((await tx.select({ archivedAt: agents.archivedAt }).from(agents).where(eq(agents.id, evening.id)))[0]?.archivedAt).toBeInstanceOf(Date);
      expect((await tx.select({ agentId: widgetKeys.agentId }).from(widgetKeys).where(eq(widgetKeys.id, widgetId)))[0]?.agentId).toBe(defaultAgent);
      expect(await agentOf(tx, text)).toBe(defaultAgent);
    });
  });

  it("pauses an extra agent on Free, so the default agent answers its channels", async () => {
    await withBusiness("free_cloud", async ({ tx, businessId, defaultAgent, widgetId }) => {
      // A business that had two agents on a paid plan, now on Free.
      const [evening] = await tx.insert(agents).values({ businessId, name: "Evening", greeting: "Evening desk here", tone: "calm", bookingPolicy: "Book", transferMode: "never" }).returning({ id: agents.id });
      await tx.update(widgetKeys).set({ agentId: evening!.id }).where(eq(widgetKeys.id, widgetId));
      await refreshBusinessSnapshot({ db: tx as unknown as Database }, { businessId });
      const [stored] = await tx.select({ snapshot: businessContextSnapshots.snapshot }).from(businessContextSnapshots).where(eq(businessContextSnapshots.businessId, businessId));
      const snapshot = stored!.snapshot as unknown as BusinessContextSnapshot;
      expect(snapshot.agents?.find((agent) => agent.id === evening!.id)?.paused).toBe(true);
      expect(snapshotForAgent(snapshot, evening!.id)).toMatchObject({ agentId: defaultAgent, greeting: "Front desk here" });
    });
  });

  it("makes another agent the default, with one default throughout", async () => {
    await withBusiness("starter", async ({ tx, businessId, defaultAgent }) => {
      const evening = await createAgentInTransaction(tx, { businessId, name: "Evening" });
      await setDefaultAgentInTransaction(tx, { businessId, agentId: evening.id });
      const rows = await tx.select({ id: agents.id, isDefault: agents.isDefault }).from(agents).where(eq(agents.businessId, businessId));
      expect(rows.filter((row) => row.isDefault).map((row) => row.id)).toEqual([evening.id]);
      // The old default can be archived now.
      await archiveAgentInTransaction(tx, { businessId, agentId: defaultAgent });
    });
  });
});

describe("agents a plan pauses", () => {
  const at = (minute: number) => new Date(Date.UTC(2026, 10, 1, 12, minute));
  const active = [{ id: "evening", isDefault: false, createdAt: at(1) }, { id: "front", isDefault: true, createdAt: at(5) }, { id: "weekend", isDefault: false, createdAt: at(2) }];

  it("pauses every agent but the default on a plan with one", () => {
    expect(pausedAgentIds({ includedAgents: 1 }, active)).toEqual(new Set(["evening", "weekend"]));
  });

  it("pauses none without a limit, or within it", () => {
    expect(pausedAgentIds({ includedAgents: null }, active).size).toBe(0);
    expect(pausedAgentIds({ includedAgents: 3 }, active).size).toBe(0);
  });

  it("keeps the default and then the oldest", () => {
    expect(pausedAgentIds({ includedAgents: 2 }, active)).toEqual(new Set(["weekend"]));
  });
});
