import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { businesses, businessMemberships, conversations, createDatabaseClient, operatorNotificationDeliveries, operatorNotificationPreferences, outboxMessages, users, type Database, type DatabaseTransaction } from "@lobbystack/db";
import { DASHBOARD_TEST_CALL_WIDGET_ID } from "@lobbystack/shared";

import { finalizeConversationSession } from "./conversations";
import { finishLiveCall, markLiveCallMediaStarted, saveLiveCallTurn, startLivePhoneCall, startLiveWebCall } from "./liveCalls";
import { defaultOperatorNotificationEventPreferences } from "./notifications";

// Explicit opt-in only; never fall back to DATABASE_URL or load an env file.
const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
    throw new Error("Call summary alert tests require a dedicated local test database.");
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

const CUSTOMER_PHONE = "+14165550133";
const BUSINESS_NUMBER = "+14165550199";

async function seedBusiness(tx: DatabaseTransaction, options: { ownerLocale?: string } = {}) {
  const businessId = randomUUID();
  const ownerId = randomUUID();
  await tx.insert(businesses).values({ id: businessId, slug: businessId, name: "Metroprint", timezone: "America/Toronto", businessType: "test", deploymentMode: "self_hosted_standard" });
  await tx.insert(users).values({ id: ownerId, email: `${ownerId}@example.test`, normalizedEmail: `${ownerId}@example.test`, ...(options.ownerLocale ? { preferredLocale: options.ownerLocale } : {}) });
  await tx.insert(businessMemberships).values({ businessId, userId: ownerId, role: "business_owner", status: "active" });
  return { businessId, ownerId };
}

/** A phone call that connected and ended, then its summary step, as the worker runs it. */
async function answeredCall(tx: DatabaseTransaction, businessId: string, options: { spoke?: boolean; tookMessage?: boolean } = {}) {
  return await asWorker(tx, async (db) => {
    const call = await startLivePhoneCall({ db }, { businessId, sessionId: `rtc_${randomUUID()}`, from: CUSTOMER_PHONE, to: BUSINESS_NUMBER });
    await markLiveCallMediaStarted({ db }, { businessId, callId: call.callId });
    if (options.spoke !== false) await saveLiveCallTurn({ db }, { businessId, callId: call.callId, sequence: 1, speaker: "caller", text: "Hi, this is Sarah Chen. Can you print 500 business cards by Thursday?" });
    if (options.tookMessage) await tx.update(conversations).set({ currentIntent: "message_taking" }).where(eq(conversations.id, call.conversationId!));
    await finishLiveCall({ db }, { businessId, callId: call.callId, seconds: 134, end: "caller_finished" });
    const first = await finalizeConversationSession({ db }, { businessId, callId: call.callId, generated: { summary: "Sarah asked for a quote on 500 business cards for Thursday.", callerName: "Sarah Chen" } });
    // The job can run twice; the second run changes nothing.
    await finalizeConversationSession({ db }, { businessId, callId: call.callId, generated: { summary: "A different summary." } });
    expect(first.finalized).toBe(true);
    return call;
  });
}

async function callAlerts(tx: DatabaseTransaction, businessId: string) {
  return await tx.select({ id: operatorNotificationDeliveries.id, userId: operatorNotificationDeliveries.userId, channel: operatorNotificationDeliveries.channel, subject: operatorNotificationDeliveries.subject, body: operatorNotificationDeliveries.body, details: operatorNotificationDeliveries.details })
    .from(operatorNotificationDeliveries)
    .where(and(eq(operatorNotificationDeliveries.businessId, businessId), eq(operatorNotificationDeliveries.eventKind, "callCompleted")));
}

describe.skipIf(!testUrl)("call summary alerts against PostgreSQL under production logins", () => {
  it("emails the team the caller, time, length and summary of an answered call, once", async () => {
    await rollbackTest(async (tx) => {
      const { businessId, ownerId } = await seedBusiness(tx);
      const call = await answeredCall(tx, businessId);
      const alerts = await callAlerts(tx, businessId);
      expect(alerts).toEqual([{
        id: expect.any(String),
        userId: ownerId,
        channel: "email",
        subject: "New call from Sarah Chen",
        body: "Metroprint: new call from Sarah Chen. Sarah asked for a quote on 500 business cards for Thursday.",
        details: expect.objectContaining({
          locale: "en",
          businessName: "Metroprint",
          callerName: "Sarah Chen",
          callerPhone: CUSTOMER_PHONE,
          timezone: "America/Toronto",
          durationSeconds: "134",
          outcome: "",
          bookedAt: "",
          summary: "Sarah asked for a quote on 500 business cards for Thursday.",
          url: expect.stringMatching(new RegExp(`/calls/${call.callId}$`)),
        }),
      }]);
      const dispatch = await tx.select({ id: outboxMessages.id }).from(outboxMessages).where(and(eq(outboxMessages.topic, "notification.dispatch"), eq(outboxMessages.aggregateId, alerts[0]!.id)));
      expect(dispatch).toHaveLength(1);
    });
  });

  it("writes the email in the recipient's dashboard language", async () => {
    await rollbackTest(async (tx) => {
      const { businessId } = await seedBusiness(tx, { ownerLocale: "fr" });
      await answeredCall(tx, businessId);
      expect((await callAlerts(tx, businessId))[0]?.details).toMatchObject({ locale: "fr" });
    });
  });

  it("sends nothing to someone who turned the alert off", async () => {
    await rollbackTest(async (tx) => {
      const { businessId, ownerId } = await seedBusiness(tx);
      await tx.insert(operatorNotificationPreferences).values({ businessId, userId: ownerId, eventPreferences: { ...defaultOperatorNotificationEventPreferences(), callCompleted: { email: false, sms: false } } });
      await answeredCall(tx, businessId);
      expect(await callAlerts(tx, businessId)).toEqual([]);
    });
  });

  it("skips a call where the caller never spoke", async () => {
    await rollbackTest(async (tx) => {
      const { businessId } = await seedBusiness(tx);
      await answeredCall(tx, businessId, { spoke: false });
      expect(await callAlerts(tx, businessId)).toEqual([]);
    });
  });

  it("skips a call where the caller left a message, which the voice message alert covers", async () => {
    await rollbackTest(async (tx) => {
      const { businessId } = await seedBusiness(tx);
      await answeredCall(tx, businessId, { tookMessage: true });
      expect(await callAlerts(tx, businessId)).toEqual([]);
    });
  });

  it("skips the dashboard's test call", async () => {
    await rollbackTest(async (tx) => {
      const { businessId } = await seedBusiness(tx);
      await asWorker(tx, async (db) => {
        const call = await startLiveWebCall({ db }, { businessId, sessionId: `rtc_${randomUUID()}`, widgetId: DASHBOARD_TEST_CALL_WIDGET_ID, billable: false });
        await markLiveCallMediaStarted({ db }, { businessId, callId: call.callId });
        await saveLiveCallTurn({ db }, { businessId, callId: call.callId, sequence: 1, speaker: "caller", text: "Testing" });
        await finishLiveCall({ db }, { businessId, callId: call.callId, seconds: 20, end: "caller_finished", channel: "web_voice" });
        await finalizeConversationSession({ db }, { businessId, callId: call.callId, generated: { summary: "A test call." } });
      });
      expect(await callAlerts(tx, businessId)).toEqual([]);
    });
  });
});
