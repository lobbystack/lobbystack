import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { businesses, businessMemberships, conversations, contacts, createDatabaseClient, firstRealConversations, numberTrials, productEvents, users, type Database, type DatabaseTransaction } from "@lobbystack/db";
import { DASHBOARD_TEST_CALL_WIDGET_ID, PROSPECT_DEMO_WIDGET_ID, WIDGET_VOICE_ID } from "@lobbystack/shared";

import { appendMessage, getOrCreateWidgetConversation } from "./conversations";
import { receiveInstagramMessage, saveInstagramReply } from "./instagram";
import { finishLiveCall, markLiveCallMediaStarted, saveLiveCallTurn, startLivePhoneCall, startLiveWebCall } from "./liveCalls";
import { receiveInboundSms } from "./sms";
import { completeCall } from "./voice";
import { readFirstRealConversationAt } from "./firstRealConversation";

// Explicit opt-in only; never fall back to DATABASE_URL or load an env file.
const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
    throw new Error("First real conversation tests require a dedicated local test database.");
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

const TEAM_PHONE = "+14165550111";
const TRIAL_PHONE = "+14165550122";
const CUSTOMER_PHONE = "+14165550133";
const BUSINESS_NUMBER = "+14165550199";

/** A business with an owner whose phone is verified, on a number trial tied to another verified phone. */
async function seedBusiness(tx: DatabaseTransaction, options: { telemetryEnabled?: boolean } = {}) {
  const businessId = randomUUID();
  const ownerId = randomUUID();
  await tx.insert(businesses).values({ id: businessId, slug: businessId, name: "Javor", timezone: "UTC", businessType: "test", telemetryEnabled: options.telemetryEnabled ?? true, deploymentMode: "self_hosted_standard" });
  await tx.insert(users).values({ id: ownerId, email: `${ownerId}@example.test`, normalizedEmail: `${ownerId}@example.test`, phone: TEAM_PHONE, phoneVerifiedAt: new Date() });
  await tx.insert(businessMemberships).values({ businessId, userId: ownerId, role: "business_owner", status: "active" });
  await tx.insert(numberTrials).values({ businessId, userId: ownerId, verifiedPhone: TRIAL_PHONE, status: "active" });
  return { businessId, ownerId };
}

async function events(tx: DatabaseTransaction, businessId: string) {
  return await tx.select({ distinctId: productEvents.distinctId, properties: productEvents.properties }).from(productEvents).where(and(eq(productEvents.businessId, businessId), eq(productEvents.name, "conversation.first_real_recorded")));
}

const finished = (end: "caller_finished" | "spam" | "setup_failed" = "caller_finished") => ({ seconds: 42, end });

/** A phone call that connected, with what the caller said, ended the usual way. */
async function phoneCall(tx: DatabaseTransaction, businessId: string, from: string | undefined, options: { spoke?: boolean; connected?: boolean; end?: "caller_finished" | "spam" | "setup_failed" } = {}) {
  return await asWorker(tx, async (db) => {
    const call = await startLivePhoneCall({ db }, { businessId, sessionId: `rtc_${randomUUID()}`, from, to: BUSINESS_NUMBER });
    if (options.connected !== false) await markLiveCallMediaStarted({ db }, { businessId, callId: call.callId });
    if (options.spoke !== false) await saveLiveCallTurn({ db }, { businessId, callId: call.callId, sequence: 1, speaker: "caller", text: "Do you have a table tonight?" });
    await finishLiveCall({ db }, { businessId, callId: call.callId, ...finished(options.end) });
    return call;
  });
}

/** A browser call through `widgetId`, connected and spoken in. */
async function webCall(tx: DatabaseTransaction, businessId: string, widgetId: string, extra: { prospectDemoId?: string } = {}) {
  return await asWorker(tx, async (db) => {
    const call = await startLiveWebCall({ db }, { businessId, sessionId: `rtc_${randomUUID()}`, widgetId, billable: false, ...extra });
    await markLiveCallMediaStarted({ db }, { businessId, callId: call.callId });
    await saveLiveCallTurn({ db }, { businessId, callId: call.callId, sequence: 1, speaker: "caller", text: "Hi" });
    await finishLiveCall({ db }, { businessId, callId: call.callId, ...finished(), channel: "web_voice" });
    return call;
  });
}

async function widgetChat(tx: DatabaseTransaction, businessId: string, options: { reply?: boolean } = {}) {
  return await asWorker(tx, async (db) => {
    const { conversationId } = await getOrCreateWidgetConversation({ db }, { businessId, widgetVisitorId: randomUUID() });
    await appendMessage({ db }, { businessId, conversationId, body: "Are you open?", direction: "inbound", channel: "web_chat" });
    if (options.reply !== false) await appendMessage({ db }, { businessId, conversationId, body: "Until nine.", direction: "outbound", channel: "web_chat", aiGenerated: true });
    return conversationId;
  });
}

async function inboundText(tx: DatabaseTransaction, businessId: string, from: string, body = "Can I move my booking?") {
  await asWorker(tx, (db) => receiveInboundSms({ db }, { businessId, providerMessageId: `SM${randomUUID()}`, from, to: BUSINESS_NUMBER, body, payload: {} }));
  const contact = (await tx.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.businessId, businessId), eq(contacts.phone, from))).limit(1))[0]!;
  return (await tx.select({ id: conversations.id }).from(conversations).where(and(eq(conversations.businessId, businessId), eq(conversations.contactId, contact.id), eq(conversations.channel, "sms"))).limit(1))[0]!.id;
}

const replyToText = (tx: DatabaseTransaction, businessId: string, conversationId: string) => asWorker(tx, (db) => appendMessage({ db }, { businessId, conversationId, body: "Sure, which day?", direction: "outbound", channel: "sms" }));

describe.skipIf(!testUrl)("first real conversation against PostgreSQL under production logins", () => {
  describe("each channel", () => {
    it("fires for a phone call, attributed to the owner", async () => {
      await rollbackTest(async (tx) => {
        const { businessId, ownerId } = await seedBusiness(tx);
        const call = await phoneCall(tx, businessId, CUSTOMER_PHONE);
        expect(await events(tx, businessId)).toEqual([expect.objectContaining({
          distinctId: `user:${ownerId}`,
          properties: expect.objectContaining({ channel: "voice", conversationId: call.conversationId, businessId }),
        })]);
      });
    });

    it("fires for a call with a withheld number", async () => {
      await rollbackTest(async (tx) => {
        const { businessId } = await seedBusiness(tx);
        await phoneCall(tx, businessId, undefined);
        expect(await events(tx, businessId)).toHaveLength(1);
      });
    });

    it("fires for a call through the website widget", async () => {
      await rollbackTest(async (tx) => {
        const { businessId } = await seedBusiness(tx);
        await webCall(tx, businessId, WIDGET_VOICE_ID);
        expect((await events(tx, businessId))[0]?.properties).toMatchObject({ channel: "web_voice" });
      });
    });

    it("fires for a website chat once the agent answers", async () => {
      await rollbackTest(async (tx) => {
        const { businessId } = await seedBusiness(tx);
        const conversationId = await widgetChat(tx, businessId);
        expect((await events(tx, businessId))[0]?.properties).toMatchObject({ channel: "web_chat", conversationId });
      });
    });

    it("fires for an Instagram chat once the agent answers", async () => {
      await rollbackTest(async (tx) => {
        const { businessId } = await seedBusiness(tx);
        const inbound = await asWorker(tx, (db) => receiveInstagramMessage({ db }, { businessId, senderId: "igsid_1", providerMessageId: `mid_${randomUUID()}`, text: "Hi", sentAt: new Date() }));
        expect(await events(tx, businessId)).toHaveLength(0);
        const conversationId = (await tx.select({ id: conversations.id }).from(conversations).where(eq(conversations.businessId, businessId)).limit(1))[0]!.id;
        await asWorker(tx, (db) => saveInstagramReply({ db }, { businessId, conversationId, answeringMessageId: inbound.messageId!, body: "Hello!" }));
        expect((await events(tx, businessId))[0]?.properties).toMatchObject({ channel: "instagram", conversationId });
      });
    });

    it("fires for a text once it's answered", async () => {
      await rollbackTest(async (tx) => {
        const { businessId } = await seedBusiness(tx);
        const conversationId = await inboundText(tx, businessId, CUSTOMER_PHONE);
        expect(await events(tx, businessId)).toHaveLength(0);
        await replyToText(tx, businessId, conversationId);
        expect((await events(tx, businessId))[0]?.properties).toMatchObject({ channel: "sms", conversationId });
      });
    });
  });

  it("records a dashboard reply under the app login", async () => {
    await rollbackTest(async (tx) => {
      const { businessId, ownerId } = await seedBusiness(tx);
      const conversationId = await widgetChat(tx, businessId, { reply: false });
      await tx.execute(sql`set local session authorization lobbystack_app`);
      await appendMessage({ db: tx as unknown as Database }, { businessId, conversationId, body: "Yes, until nine.", direction: "outbound", channel: "web_chat", userId: ownerId });
      await tx.execute(sql`reset session authorization`);
      expect((await events(tx, businessId))[0]?.properties).toMatchObject({ channel: "web_chat", conversationId });
    });
  });

  describe("once per business", () => {
    it("fires only for the first conversation, on any later channel", async () => {
      await rollbackTest(async (tx) => {
        const { businessId } = await seedBusiness(tx);
        await phoneCall(tx, businessId, CUSTOMER_PHONE);
        await phoneCall(tx, businessId, "+14165550144");
        await widgetChat(tx, businessId);
        const recorded = await events(tx, businessId);
        expect(recorded).toHaveLength(1);
        expect(recorded[0]?.properties).toMatchObject({ channel: "voice" });
      });
    });

    it("doesn't fire when a call's completion is delivered twice", async () => {
      await rollbackTest(async (tx) => {
        const { businessId } = await seedBusiness(tx);
        const call = await phoneCall(tx, businessId, CUSTOMER_PHONE);
        await expect(asWorker(tx, (db) => completeCall({ db }, { businessId, callId: call.callId, status: "completed", endedAt: new Date().toISOString() }))).resolves.toBe(false);
        expect(await events(tx, businessId)).toHaveLength(1);
      });
    });

    it("fires separately for each business", async () => {
      await rollbackTest(async (tx) => {
        const first = await seedBusiness(tx);
        const second = await seedBusiness(tx);
        await phoneCall(tx, first.businessId, CUSTOMER_PHONE);
        await phoneCall(tx, second.businessId, CUSTOMER_PHONE);
        expect(await events(tx, first.businessId)).toHaveLength(1);
        expect(await events(tx, second.businessId)).toHaveLength(1);
      });
    });

    it("keeps the claim and sends nothing when the business has telemetry off", async () => {
      await rollbackTest(async (tx) => {
        const { businessId } = await seedBusiness(tx, { telemetryEnabled: false });
        await phoneCall(tx, businessId, CUSTOMER_PHONE);
        expect(await events(tx, businessId)).toHaveLength(0);
        expect(await tx.select().from(firstRealConversations).where(eq(firstRealConversations.businessId, businessId))).toHaveLength(1);
      });
    });
  });

  describe("what doesn't count", () => {
    const expectNothing = async (tx: DatabaseTransaction, businessId: string) => {
      expect(await events(tx, businessId)).toHaveLength(0);
      expect(await tx.select().from(firstRealConversations).where(eq(firstRealConversations.businessId, businessId))).toHaveLength(0);
    };

    it("ignores the operator's test call", async () => {
      await rollbackTest(async (tx) => {
        const { businessId } = await seedBusiness(tx);
        await webCall(tx, businessId, DASHBOARD_TEST_CALL_WIDGET_ID);
        await expectNothing(tx, businessId);
      });
    });

    it("ignores the landing page's demo call", async () => {
      await rollbackTest(async (tx) => {
        const { businessId } = await seedBusiness(tx);
        await webCall(tx, businessId, "lobbystack-landing");
        await expectNothing(tx, businessId);
      });
    });

    it("ignores a prospect demo call", async () => {
      await rollbackTest(async (tx) => {
        const { businessId } = await seedBusiness(tx);
        const call = await webCall(tx, businessId, PROSPECT_DEMO_WIDGET_ID);
        expect(call.callId).toBeTruthy();
        await expectNothing(tx, businessId);
      });
    });

    it("ignores a call from a team member's verified phone", async () => {
      await rollbackTest(async (tx) => {
        const { businessId } = await seedBusiness(tx);
        await phoneCall(tx, businessId, TEAM_PHONE);
        await expectNothing(tx, businessId);
      });
    });

    it("ignores a call from the number trial's verified phone", async () => {
      await rollbackTest(async (tx) => {
        const { businessId } = await seedBusiness(tx);
        await phoneCall(tx, businessId, TRIAL_PHONE);
        await expectNothing(tx, businessId);
      });
    });

    it("still counts the first customer after a team member's call", async () => {
      await rollbackTest(async (tx) => {
        const { businessId } = await seedBusiness(tx);
        await phoneCall(tx, businessId, TEAM_PHONE);
        await phoneCall(tx, businessId, CUSTOMER_PHONE);
        expect(await events(tx, businessId)).toHaveLength(1);
      });
    });

    it("ignores a member's phone that isn't verified", async () => {
      await rollbackTest(async (tx) => {
        const { businessId, ownerId } = await seedBusiness(tx);
        await tx.update(users).set({ phoneVerifiedAt: null }).where(eq(users.id, ownerId));
        await phoneCall(tx, businessId, TEAM_PHONE);
        expect(await events(tx, businessId)).toHaveLength(1);
      });
    });

    it("ignores a call that never connected", async () => {
      await rollbackTest(async (tx) => {
        const { businessId } = await seedBusiness(tx);
        await phoneCall(tx, businessId, CUSTOMER_PHONE, { connected: false });
        await expectNothing(tx, businessId);
      });
    });

    it("ignores a caller who never spoke", async () => {
      await rollbackTest(async (tx) => {
        const { businessId } = await seedBusiness(tx);
        await phoneCall(tx, businessId, CUSTOMER_PHONE, { spoke: false });
        await expectNothing(tx, businessId);
      });
    });

    it("ignores spam and calls that failed to set up", async () => {
      await rollbackTest(async (tx) => {
        const { businessId } = await seedBusiness(tx);
        await phoneCall(tx, businessId, CUSTOMER_PHONE, { end: "spam" });
        await phoneCall(tx, businessId, "+14165550144", { end: "setup_failed" });
        await expectNothing(tx, businessId);
      });
    });

    it("ignores a chat nobody answered", async () => {
      await rollbackTest(async (tx) => {
        const { businessId } = await seedBusiness(tx);
        await widgetChat(tx, businessId, { reply: false });
        await expectNothing(tx, businessId);
      });
    });

    it("ignores a text from a team member's verified phone", async () => {
      await rollbackTest(async (tx) => {
        const { businessId } = await seedBusiness(tx);
        const conversationId = await inboundText(tx, businessId, TEAM_PHONE);
        await replyToText(tx, businessId, conversationId);
        await expectNothing(tx, businessId);
      });
    });

    it("ignores the automatic reply to HELP", async () => {
      await rollbackTest(async (tx) => {
        const { businessId } = await seedBusiness(tx);
        await inboundText(tx, businessId, CUSTOMER_PHONE, "HELP");
        await expectNothing(tx, businessId);
      });
    });

    it("ignores a message the team sends first", async () => {
      await rollbackTest(async (tx) => {
        const { businessId } = await seedBusiness(tx);
        const contact = (await tx.insert(contacts).values({ businessId, phone: CUSTOMER_PHONE }).returning({ id: contacts.id }))[0]!;
        const conversation = (await tx.insert(conversations).values({ businessId, contactId: contact.id, channel: "sms", status: "open", automationState: "ai_active" }).returning({ id: conversations.id }))[0]!;
        await replyToText(tx, businessId, conversation.id);
        await expectNothing(tx, businessId);
      });
    });
  });

  it("keeps a business's verified phones to itself", async () => {
    await rollbackTest(async (tx) => {
      const { businessId } = await seedBusiness(tx);
      const other = await seedBusiness(tx);
      const facts = await asWorker(tx, async (db) => {
        await db.execute(sql`select set_config('app.business_id', ${other.businessId}, true), set_config('app.actor_type', 'worker', true)`);
        return (await db.execute(sql`select * from app.first_real_conversation_facts(${businessId}::uuid, ${TEAM_PHONE})`)).rows;
      });
      expect(facts).toEqual([]);
    });
  });
});

describe.skipIf(!testUrl)("the new-account Home's switch", () => {
  it("stays answered after the conversation behind it is gone", async () => {
    await rollbackTest(async (tx) => {
      const [business] = await tx.insert(businesses).values({ name: "Switch", slug: `switch-${randomUUID()}`, timezone: "UTC", businessType: "other" }).returning({ id: businesses.id });
      const [conversation] = await tx.insert(conversations).values({ businessId: business!.id, channel: "voice" }).returning({ id: conversations.id });
      expect(await readFirstRealConversationAt(tx, business!.id)).toBeNull();
      await tx.insert(firstRealConversations).values({ businessId: business!.id, channel: "voice", conversationId: conversation!.id });
      const first = await readFirstRealConversationAt(tx, business!.id);
      expect(first).toBeInstanceOf(Date);
      await tx.delete(conversations).where(eq(conversations.id, conversation!.id));
      expect(await readFirstRealConversationAt(tx, business!.id)).toEqual(first);
    });
  });

  it("gives the app role no way to delete or change the row", async () => {
    await rollbackTest(async (tx) => {
      const [{ del, upd }] = (await tx.execute<{ del: boolean; upd: boolean }>(sql`select has_table_privilege('lobbystack_app', 'public.first_real_conversations', 'DELETE') as del, has_table_privilege('lobbystack_app', 'public.first_real_conversations', 'UPDATE') as upd`)).rows as [{ del: boolean; upd: boolean }];
      expect([del, upd]).toEqual([false, false]);
    });
  });
});
