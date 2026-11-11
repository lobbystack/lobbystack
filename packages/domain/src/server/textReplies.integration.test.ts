import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { businessMemberships, businesses, contacts, conversations, createDatabaseClient, messages, operatorNotificationDeliveries, outboxMessages, phoneNumbers, users, type Database, type DatabaseTransaction, defaultAgentIdOf } from "@lobbystack/db";

import { appendMessage } from "./conversations";
import { loadSmsDeliveryTarget, markSmsSent, receiveInboundSms, recordSmsProviderPricing } from "./sms";
import { loadTextReplyContext, saveTextReply, TEXT_REPLY_BUSINESS_DAILY_LIMIT, TEXT_REPLY_CONVERSATION_DAILY_LIMIT, TEXT_REPLY_LOOP_LIMIT } from "./textReplies";

// Explicit opt-in only; never fall back to DATABASE_URL or load an env file.
const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
    throw new Error("Text reply integration tests require a dedicated local test database.");
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

const canadian = "+14165550123";
const american = "+12125550123";

/** A cloud business with its own Canadian number. */
async function seedBusiness(tx: DatabaseTransaction, input: { enabled: boolean }) {
  const businessId = randomUUID();
  await tx.insert(businesses).values({ id: businessId, slug: businessId, name: "Javor", timezone: "UTC", businessType: "test", telemetryEnabled: true, deploymentMode: "cloud", textRepliesEnabled: input.enabled });
  const userId = randomUUID();
  await tx.insert(users).values({ id: userId, email: `${userId}@example.invalid`, normalizedEmail: `${userId}@example.invalid` });
  await tx.insert(businessMemberships).values({ businessId, userId, role: "business_owner" });
  await tx.insert(phoneNumbers).values({ businessId, agentId: defaultAgentIdOf(businessId), e164: `+1416${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`, providerPhoneId: `PN-${businessId}` });
  const receive = (body: string, from = canadian) => asWorker(tx, (db) => receiveInboundSms({ db }, { businessId, providerMessageId: `SM-${randomUUID()}`, from, to: "+14165550100", body, payload: {} }));
  const replyJobs = async () => await tx.select({ id: outboxMessages.id }).from(outboxMessages).where(and(eq(outboxMessages.businessId, businessId), eq(outboxMessages.topic, "sms.aiReply")));
  const alerts = async () => await tx.selectDistinct({ kind: operatorNotificationDeliveries.eventKind }).from(operatorNotificationDeliveries).where(eq(operatorNotificationDeliveries.businessId, businessId));
  const conversationId = async () => (await tx.select({ id: conversations.id }).from(conversations).where(eq(conversations.businessId, businessId)).limit(1))[0]!.id;
  const state = async () => (await tx.select({ state: conversations.automationState }).from(conversations).where(eq(conversations.businessId, businessId)))[0]?.state;
  return { businessId, userId, receive, replyJobs, alerts, conversationId, state };
}

/** `replies` AI replies stamped `at`. */
async function seedReplies(tx: DatabaseTransaction, input: { businessId: string; conversationId: string; replies: number; at: Date }) {
  await tx.insert(messages).values(Array.from({ length: input.replies }, () => ({ businessId: input.businessId, conversationId: input.conversationId, direction: "outbound", channel: "sms", body: "Sure", aiGenerated: true, status: "sent", createdAt: input.at })));
}

describe.skipIf(!testUrl)("AI text replies against PostgreSQL under production logins", () => {
  it("does nothing different with the flag off", async () => {
    await rollbackTest(async (tx) => {
      const business = await seedBusiness(tx, { enabled: false });
      await business.receive("Are you open Sunday?");

      expect(await business.replyJobs()).toHaveLength(0);
      expect(await business.alerts()).toEqual([{ kind: "pausedSms" }]);
    });
  });

  it("queues a reply to a Canadian customer instead of alerting, with no Business Number or EIN on file", async () => {
    await rollbackTest(async (tx) => {
      const business = await seedBusiness(tx, { enabled: true });
      await business.receive("Are you open Sunday?");

      expect(await business.replyJobs()).toHaveLength(1);
      expect(await business.alerts()).toHaveLength(0);
    });
  });

  it("alerts the team instead of replying to a US customer", async () => {
    await rollbackTest(async (tx) => {
      const business = await seedBusiness(tx, { enabled: true });
      await business.receive("Are you open Sunday?", american);

      expect(await business.replyJobs()).toHaveLength(0);
      expect(await business.alerts()).toEqual([{ kind: "pausedSms" }]);
    });
  });

  it("leaves STOP, START and HELP to their fixed replies", async () => {
    await rollbackTest(async (tx) => {
      const business = await seedBusiness(tx, { enabled: true });
      for (const keyword of ["HELP", "INFO", "AIDE", "STOP", "YES", "START"]) await business.receive(keyword);

      expect(await business.replyJobs()).toHaveLength(0);
    });
  });

  it("records OPT OUT, REVOKE and ARRET as opt-outs, with no reply from the receptionist", async () => {
    await rollbackTest(async (tx) => {
      for (const keyword of ["OPT OUT", "revoke", "ARRÊT"]) {
        const business = await seedBusiness(tx, { enabled: true });
        await business.receive(keyword);

        expect(await business.replyJobs()).toHaveLength(0);
        expect((await tx.select({ status: contacts.smsConsentStatus }).from(contacts).where(eq(contacts.businessId, business.businessId)))[0]?.status).toBe("opted_out");
      }
    });
  });

  it("treats YES as an answer unless the customer opted out", async () => {
    await rollbackTest(async (tx) => {
      const answering = await seedBusiness(tx, { enabled: true });
      await answering.receive("Yes");
      expect(await answering.replyJobs()).toHaveLength(1);
      expect((await tx.select({ status: contacts.smsConsentStatus }).from(contacts).where(eq(contacts.businessId, answering.businessId)))[0]?.status).toBeNull();

      const returning = await seedBusiness(tx, { enabled: true });
      await returning.receive("STOP");
      await returning.receive("YES");
      expect(await returning.replyJobs()).toHaveLength(0);
      expect((await tx.select({ status: contacts.smsConsentStatus }).from(contacts).where(eq(contacts.businessId, returning.businessId)))[0]?.status).toBe("subscribed");
    });
  });

  it("treats a YES Twilio marked START the same way", async () => {
    await rollbackTest(async (tx) => {
      const consent = async (businessId: string) => (await tx.select({ status: contacts.smsConsentStatus }).from(contacts).where(eq(contacts.businessId, businessId)))[0]?.status;
      const yes = (businessId: string) => asWorker(tx, (db) => receiveInboundSms({ db }, { businessId, providerMessageId: `SM-${randomUUID()}`, from: canadian, to: "+14165550100", body: "YES", payload: { OptOutType: "START" } }));

      const answering = await seedBusiness(tx, { enabled: true });
      await answering.receive("Can you do Tuesday at 9?");
      await tx.update(contacts).set({ smsConsentStatus: "subscribed", smsConsentUpdatedAt: new Date(Date.now() - 60_000) }).where(eq(contacts.businessId, answering.businessId));
      await yes(answering.businessId);
      expect(await answering.replyJobs()).toHaveLength(2);
      expect(await tx.select({ id: messages.id }).from(messages).where(and(eq(messages.businessId, answering.businessId), eq(messages.direction, "outbound")))).toEqual([]);
      expect(await consent(answering.businessId)).toBe("subscribed");

      const returning = await seedBusiness(tx, { enabled: true });
      await returning.receive("STOP");
      await yes(returning.businessId);
      expect(await returning.replyJobs()).toHaveLength(0);
      expect(await consent(returning.businessId)).toBe("subscribed");
    });
  });

  it("alerts instead of replying after the customer opted out", async () => {
    await rollbackTest(async (tx) => {
      const business = await seedBusiness(tx, { enabled: true });
      await business.receive("STOP");
      await business.receive("Actually, one question");

      expect(await business.replyJobs()).toHaveLength(0);
      expect(await business.alerts()).toEqual([{ kind: "pausedSms" }]);
    });
  });

  it("stops answering once the team has the conversation", async () => {
    await rollbackTest(async (tx) => {
      const business = await seedBusiness(tx, { enabled: true });
      await business.receive("Are you open Sunday?");
      await tx.update(conversations).set({ automationState: "human_handoff" }).where(eq(conversations.businessId, business.businessId));
      await business.receive("Hello?");

      expect(await business.replyJobs()).toHaveLength(1);
      expect(await business.alerts()).toEqual([{ kind: "pausedSms" }]);
    });
  });

  it("gives the receptionist the customer's number and the conversation", async () => {
    await rollbackTest(async (tx) => {
      const business = await seedBusiness(tx, { enabled: true });
      const { messageId } = await business.receive("Are you open Sunday?");
      const conversationId = await business.conversationId();

      const context = await asWorker(tx, (db) => loadTextReplyContext({ db }, { businessId: business.businessId, conversationId, messageId: messageId! }));

      expect(context).toEqual({ phone: canadian, agentId: expect.any(String), firstReply: true, history: [{ direction: "inbound", body: "Are you open Sunday?" }] });
    });
  });

  it("knows the first reply is past once one went out, however long ago", async () => {
    await rollbackTest(async (tx) => {
      const business = await seedBusiness(tx, { enabled: true });
      const { messageId } = await business.receive("Are you open Sunday?");
      const conversationId = await business.conversationId();
      await seedReplies(tx, { businessId: business.businessId, conversationId, replies: 1, at: new Date(Date.now() - 30 * 24 * 60 * 60_000) });

      expect(await asWorker(tx, (db) => loadTextReplyContext({ db }, { businessId: business.businessId, conversationId, messageId: messageId! }))).toMatchObject({ firstReply: false });
    });
  });

  it("drops a reply when a newer text arrived while it was written", async () => {
    await rollbackTest(async (tx) => {
      const business = await seedBusiness(tx, { enabled: true });
      const first = await business.receive("Are you open Sunday?");
      const newer = await business.receive("And Monday?");
      await tx.update(messages).set({ createdAt: new Date(Date.now() + 1_000) }).where(eq(messages.id, newer.messageId!));
      const conversationId = await business.conversationId();

      expect(await asWorker(tx, (db) => saveTextReply({ db }, { businessId: business.businessId, conversationId, answeringMessageId: first.messageId!, body: "Yes" }))).toBeNull();
    });
  });

  it("still answers a question when HELP follows it before the job runs", async () => {
    await rollbackTest(async (tx) => {
      const business = await seedBusiness(tx, { enabled: true });
      const question = await business.receive("Are you open Sunday?");
      const help = await business.receive("HELP");
      const conversationId = await business.conversationId();
      const [reply] = await tx.select({ id: messages.id }).from(messages).where(and(eq(messages.conversationId, conversationId), eq(messages.direction, "outbound")));
      // The fixed reply goes out first, and delivery overwrites its provider status.
      await asWorker(tx, (db) => markSmsSent({ db }, { businessId: business.businessId, messageId: reply!.id, providerMessageId: "SM-help-reply" }));
      await tx.update(messages).set({ createdAt: new Date(Date.now() + 1_000) }).where(eq(messages.id, help.messageId!));
      await tx.update(messages).set({ createdAt: new Date(Date.now() + 2_000) }).where(eq(messages.id, reply!.id));

      const context = await asWorker(tx, (db) => loadTextReplyContext({ db }, { businessId: business.businessId, conversationId, messageId: question.messageId! }));
      expect(context?.history).toEqual([{ direction: "inbound", body: "Are you open Sunday?" }]);
      expect(await asWorker(tx, (db) => saveTextReply({ db }, { businessId: business.businessId, conversationId, answeringMessageId: question.messageId!, body: "We're closed Sunday." }))).toEqual(expect.any(String));
    });
  });

  it("alerts the team to a question the customer followed with STOP", async () => {
    await rollbackTest(async (tx) => {
      const business = await seedBusiness(tx, { enabled: true });
      const question = await business.receive("Are you open Sunday?");
      const stop = await business.receive("STOP");
      await tx.update(messages).set({ createdAt: new Date(Date.now() + 1_000) }).where(eq(messages.id, stop.messageId!));
      const conversationId = await business.conversationId();

      expect(await asWorker(tx, (db) => loadTextReplyContext({ db }, { businessId: business.businessId, conversationId, messageId: question.messageId! }))).toBeNull();
      expect(await business.alerts()).toEqual([{ kind: "pausedSms" }]);
    });
  });

  it("hands a conversation that replies back too fast to the team", async () => {
    await rollbackTest(async (tx) => {
      const business = await seedBusiness(tx, { enabled: true });
      const { messageId } = await business.receive("Are you open Sunday?");
      const conversationId = await business.conversationId();
      await seedReplies(tx, { businessId: business.businessId, conversationId, replies: TEXT_REPLY_LOOP_LIMIT, at: new Date(Date.now() - 60_000) });
      await tx.update(messages).set({ createdAt: new Date() }).where(eq(messages.id, messageId!));

      expect(await asWorker(tx, (db) => loadTextReplyContext({ db }, { businessId: business.businessId, conversationId, messageId: messageId! }))).toBeNull();
      expect(await business.state()).toBe("human_handoff");
      expect(await business.alerts()).toEqual([{ kind: "aiReplyFailed" }]);
    });
  });

  it("hands a conversation to the team at the daily limit, however slow it was", async () => {
    await rollbackTest(async (tx) => {
      const business = await seedBusiness(tx, { enabled: true });
      const { messageId } = await business.receive("Are you open Sunday?");
      const conversationId = await business.conversationId();
      await seedReplies(tx, { businessId: business.businessId, conversationId, replies: TEXT_REPLY_CONVERSATION_DAILY_LIMIT, at: new Date(Date.now() - 60 * 60_000) });

      expect(await asWorker(tx, (db) => loadTextReplyContext({ db }, { businessId: business.businessId, conversationId, messageId: messageId! }))).toBeNull();
      expect(await business.state()).toBe("human_handoff");
    });
  });

  it("keeps the conversation with the receptionist when only the business's daily limit is reached", async () => {
    await rollbackTest(async (tx) => {
      const business = await seedBusiness(tx, { enabled: true });
      const { messageId } = await business.receive("Are you open Sunday?");
      const conversationId = await business.conversationId();
      const [contact] = await tx.insert(contacts).values({ businessId: business.businessId, phone: "+14165550999" }).returning({ id: contacts.id });
      const [other] = await tx.insert(conversations).values({ businessId: business.businessId, contactId: contact!.id, channel: "sms", status: "open", automationState: "ai_active" }).returning({ id: conversations.id });
      await seedReplies(tx, { businessId: business.businessId, conversationId: other!.id, replies: TEXT_REPLY_BUSINESS_DAILY_LIMIT, at: new Date(Date.now() - 60 * 60_000) });

      expect(await asWorker(tx, (db) => loadTextReplyContext({ db }, { businessId: business.businessId, conversationId, messageId: messageId! }))).toBeNull();
      expect((await tx.select({ state: conversations.automationState }).from(conversations).where(eq(conversations.id, conversationId)))[0]?.state).toBe("ai_active");
      expect(await business.alerts()).toEqual([{ kind: "pausedSms" }]);
    });
  });

  it("fails a queued reply once replies are off, and leaves a team member's reply alone", async () => {
    await rollbackTest(async (tx) => {
      const business = await seedBusiness(tx, { enabled: true });
      const { messageId } = await business.receive("Are you open Sunday?");
      const conversationId = await business.conversationId();
      const saved = await asWorker(tx, (db) => saveTextReply({ db }, { businessId: business.businessId, conversationId, answeringMessageId: messageId!, body: "Yes" }));
      const manual = await asWorker(tx, (db) => appendMessage({ db }, { businessId: business.businessId, conversationId, direction: "outbound", channel: "sms", body: "From the team" }));
      await tx.update(businesses).set({ textRepliesEnabled: false }).where(eq(businesses.id, business.businessId));

      await expect(asWorker(tx, (db) => loadSmsDeliveryTarget(db, { businessId: business.businessId, messageId: saved! }))).resolves.toEqual({ blocked: "text_replies_off" });
      await expect(asWorker(tx, (db) => loadSmsDeliveryTarget(db, { businessId: business.businessId, messageId: manual }))).resolves.toMatchObject({ to: canadian, body: "From the team" });
    });
  });

  it("hands a text conversation to the team member who replies in it", async () => {
    await rollbackTest(async (tx) => {
      const business = await seedBusiness(tx, { enabled: true });
      await business.receive("Are you open Sunday?");
      const conversationId = await business.conversationId();

      await appendMessage({ db: tx as unknown as Database }, { businessId: business.businessId, conversationId, direction: "outbound", channel: "sms", body: "From the team", userId: business.userId });

      expect(await business.state()).toBe("human_handoff");
    });
  });

  it("leaves automation alone when a team member replies with the flag off", async () => {
    await rollbackTest(async (tx) => {
      const business = await seedBusiness(tx, { enabled: false });
      await business.receive("Are you open Sunday?");
      const conversationId = await business.conversationId();

      await appendMessage({ db: tx as unknown as Database }, { businessId: business.businessId, conversationId, direction: "outbound", channel: "sms", body: "From the team", userId: business.userId });

      expect(await business.state()).toBe("ai_active");
    });
  });

  it("records the carrier's cost of a reply", async () => {
    await rollbackTest(async (tx) => {
      const business = await seedBusiness(tx, { enabled: true });
      const { messageId } = await business.receive("Are you open Sunday?");
      const conversationId = await business.conversationId();
      const saved = await asWorker(tx, (db) => saveTextReply({ db }, { businessId: business.businessId, conversationId, answeringMessageId: messageId!, body: "Yes" }));
      await tx.update(messages).set({ providerMessageId: `SM-${saved}` }).where(eq(messages.id, saved!));

      await asWorker(tx, (db) => recordSmsProviderPricing({ db }, { businessId: business.businessId, providerMessageId: `SM-${saved}`, providerCostUsd: 0.0079, providerNumSegments: 1 }));

      const rows = await tx.execute<{ event_kind: string }>(sql`select event_kind from unit_economics_events where business_id = ${business.businessId}`);
      expect(rows.rows).toEqual([{ event_kind: "sms_provider" }]);
    });
  });
});
