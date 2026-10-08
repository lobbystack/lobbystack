import { randomUUID } from "node:crypto";

import { and, eq, inArray, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { billingAccounts, billingUsageEvents, businesses, calls, contacts, createDatabaseClient, outboxMessages, transcripts, type Database, type DatabaseTransaction } from "@lobbystack/db";

import { blockLiveCaller, finishLiveCall, lastLiveCallSequence, listOpenLiveCalls, liveCallHasRecording, markLiveCallMediaStarted, retryLiveCallRecording, saveLiveCallTurn, startLivePhoneCall, startLiveWebCall } from "./liveCalls";
import { periodKeyFor } from "./usage";
import { loadLiveCallForPricing } from "./voice";

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

// Creates a cloud business on a plan as the fixture owner. `usedSeconds` is
// voice usage already final this month.
async function business(tx: DatabaseTransaction, input: { plan: "free_cloud" | "starter" | "pro"; capCents?: number; usedSeconds?: number }) {
  const businessId = randomUUID();
  await tx.insert(businesses).values({ id: businessId, slug: businessId, name: "Live call test", timezone: "UTC", businessType: "test", telemetryEnabled: false });
  if (input.plan !== "free_cloud") await tx.insert(billingAccounts).values({ businessId, billingKey: `test:${businessId}`, plan: input.plan, subscriptionState: "active", billingInterval: "month", overageSpendingCapCents: input.capCents ?? null });
  if (input.usedSeconds) await tx.insert(billingUsageEvents).values({ businessId, periodKey: periodKeyFor(), sourceKey: `voice:seed:${businessId}`, usageKind: "voice_seconds", quantity: input.usedSeconds, planAtRecordTime: input.plan, isFinal: true, syncStatus: "skipped", createdAt: new Date(Date.now() - 60_000) });
  return businessId;
}

// Runs the call path as the worker runtime role, the way the admin webhook does.
async function asWorker<T>(tx: DatabaseTransaction, run: (context: { db: Database }) => Promise<T>): Promise<T> {
  await tx.execute(sql`set local role lobbystack_worker`);
  const result = await run({ db: tx as unknown as Database });
  await tx.execute(sql`reset role`);
  return result;
}

const call = (businessId: string, from?: string) => ({ businessId, sessionId: `live_${randomUUID()}`, ...(from ? { from } : {}), to: "+15815550100" });

describe.skipIf(!testUrl)("GPT-Live phone calls against PostgreSQL", () => {
  it("gives each withheld caller ID its own contact and never blocks it", async () => {
    await rollbackTest(async (tx) => {
      const businessId = await business(tx, { plan: "pro" });
      const [first, second] = await asWorker(tx, async (context) => [await startLivePhoneCall(context, call(businessId)), await startLivePhoneCall(context, call(businessId))]);
      const callerContacts = await tx.select({ id: contacts.id, phone: contacts.phone }).from(contacts).where(eq(contacts.businessId, businessId));
      expect(callerContacts).toHaveLength(2);
      expect(callerContacts.every((contact) => contact.phone === null)).toBe(true);

      // The agent ends the first anonymous call as abuse.
      await asWorker(tx, (context) => blockLiveCaller(context, { businessId, callId: first!.callId }));
      const blocked = await tx.select({ id: contacts.id }).from(contacts).where(sql`${contacts.businessId} = ${businessId} and ${contacts.operatorBlockedAt} is not null`);
      expect(blocked).toHaveLength(0);
      const next = await asWorker(tx, (context) => startLivePhoneCall(context, call(businessId)));
      expect(next.blocked).toBe(false);
      // The trunk is shared, so a call with no caller number isn't priced by start time alone.
      await expect(asWorker(tx, (context) => loadLiveCallForPricing(context, { businessId, callId: second!.callId }))).resolves.toBeNull();
    });
  });

  it("still blocks a caller with a number", async () => {
    await rollbackTest(async (tx) => {
      const businessId = await business(tx, { plan: "pro" });
      const first = await asWorker(tx, (context) => startLivePhoneCall(context, call(businessId, "+14165550134")));
      await expect(asWorker(tx, (context) => loadLiveCallForPricing(context, { businessId, callId: first.callId }))).resolves.toMatchObject({ callerPhone: "+14165550134" });
      await asWorker(tx, (context) => blockLiveCaller(context, { businessId, callId: first.callId }));
      await expect(asWorker(tx, (context) => startLivePhoneCall(context, call(businessId, "+14165550134")))).resolves.toMatchObject({ blocked: true });
      await expect(asWorker(tx, (context) => startLivePhoneCall(context, call(businessId)))).resolves.toMatchObject({ blocked: false });
    });
  });

  it("lets a second call in on a capped plan and bounds each reservation", async () => {
    await rollbackTest(async (tx) => {
      // 2,000 included seconds left, plus 300 seconds the $1 cap allows at $0.20 a minute.
      const businessId = await business(tx, { plan: "starter", capCents: 100, usedSeconds: 7_000 });
      const first = call(businessId, "+14165550134");
      const second = call(businessId, "+14165550135");
      const started = await asWorker(tx, async (context) => [await startLivePhoneCall(context, first), await startLivePhoneCall(context, second)]);
      expect(started.map((row) => row.maxDurationMs)).toEqual([1_800_000, 500_000]);
      const reservations = await tx.select({ sourceKey: billingUsageEvents.sourceKey, quantity: billingUsageEvents.quantity }).from(billingUsageEvents).where(inArray(billingUsageEvents.sourceKey, started.map((row) => `voice:${row.callId}`)));
      expect(reservations.map((row) => row.quantity).sort((a, b) => b - a)).toEqual([1_800, 500]);
      // Nothing is left for a third.
      await expect(asWorker(tx, (context) => startLivePhoneCall(context, call(businessId, "+14165550136")))).rejects.toMatchObject({ code: "voice_limit_reached" });

      // A retried delivery attaches with the limit its first delivery reserved.
      const retried = await asWorker(tx, async (context) => [await startLivePhoneCall(context, first), await startLivePhoneCall(context, second)]);
      expect(retried.map((row) => [row.duplicate, row.maxDurationMs])).toEqual([[true, 1_800_000], [true, 500_000]]);
    });
  });

  it("limits a call on a free plan to the minutes left", async () => {
    await rollbackTest(async (tx) => {
      // Free plans include 1,800 seconds, one call's longest length, so a call
      // in progress always holds everything left and a second caller hears busy.
      const businessId = await business(tx, { plan: "free_cloud", usedSeconds: 600 });
      const first = await asWorker(tx, (context) => startLivePhoneCall(context, call(businessId, "+14165550134")));
      expect(first.maxDurationMs).toBe(1_200_000);
      await expect(asWorker(tx, (context) => startLivePhoneCall(context, call(businessId, "+14165550135")))).rejects.toMatchObject({ code: "voice_limit_reached" });
    });
  });

  it("leaves an unlimited plan without a reservation or a limit, also on a retried delivery", async () => {
    await rollbackTest(async (tx) => {
      const businessId = await business(tx, { plan: "pro" });
      const input = call(businessId, "+14165550134");
      const started = await asWorker(tx, async (context) => [await startLivePhoneCall(context, input), await startLivePhoneCall(context, input)]);
      expect(started.map((row) => [row.duplicate, row.maxDurationMs])).toEqual([[false, undefined], [true, undefined]]);
      expect(await tx.select({ id: billingUsageEvents.id }).from(billingUsageEvents).where(eq(billingUsageEvents.businessId, businessId))).toHaveLength(0);
    });
  });

  it("lists the open calls a new worker can take over, with what it needs to re-attach", async () => {
    await rollbackTest(async (tx) => {
      // 1,200 seconds left, so the phone call reserves 1,200.
      const businessId = await business(tx, { plan: "free_cloud", usedSeconds: 600 });
      const phone = call(businessId, "+14165550134");
      const demo = { businessId, sessionId: `live_${randomUUID()}`, widgetId: "prospect-demo", billable: false, maxDurationMs: 120_000, sessionPurpose: "prospect_demo" };
      const [phoneCall, demoCall, endedCall, recentCall] = await asWorker(tx, async (context) => [
        await startLivePhoneCall(context, phone),
        await startLiveWebCall(context, demo),
        await startLiveWebCall(context, { businessId, sessionId: `live_${randomUUID()}`, widgetId: "dashboard", billable: false }),
        await startLiveWebCall(context, { businessId, sessionId: `live_${randomUUID()}`, widgetId: "dashboard", billable: false }),
      ]);
      const startedAt = new Date(Date.now() - 5 * 60_000);
      await tx.update(calls).set({ startedAt }).where(inArray(calls.id, [phoneCall!.callId, demoCall!.callId, endedCall!.callId]));
      await asWorker(tx, async (context) => {
        await markLiveCallMediaStarted(context, { businessId, callId: phoneCall!.callId, at: new Date(startedAt.getTime() + 2_000) });
        await saveLiveCallTurn(context, { businessId, callId: phoneCall!.callId, sequence: 1, speaker: "assistant", text: "Thanks for calling." });
        await saveLiveCallTurn(context, { businessId, callId: phoneCall!.callId, sequence: 2, speaker: "caller", text: "Do you open Saturdays?" });
        await markLiveCallMediaStarted(context, { businessId, callId: demoCall!.callId, at: new Date(startedAt.getTime() + 3_000) });
        await finishLiveCall(context, { businessId, callId: endedCall!.callId, seconds: 15, end: "caller_finished", channel: "web_voice" });
      });
      await tx.update(transcripts).set({ updatedAt: new Date(startedAt.getTime() + 90_000) }).where(eq(transcripts.callId, phoneCall!.callId));

      const open = await asWorker(tx, (context) => listOpenLiveCalls(context, { businessId, startedBefore: new Date(Date.now() - 60_000) }));
      expect(open.map((row) => row.callId).sort()).toEqual([phoneCall!.callId, demoCall!.callId].sort());
      expect(open.find((row) => row.callId === phoneCall!.callId)).toEqual({
        businessId, callId: phoneCall!.callId, sessionId: phone.sessionId, channel: "voice", conversationId: phoneCall!.conversationId, callerPhone: "+14165550134", intakeOnly: false,
        startedAt, reservedSeconds: 1_200, lastActivityAt: new Date(startedAt.getTime() + 90_000), lastSequence: 2,
      });
      expect(open.find((row) => row.callId === demoCall!.callId)).toEqual({
        businessId, callId: demoCall!.callId, sessionId: demo.sessionId, channel: "web_voice", conversationId: demoCall!.conversationId, intakeOnly: true,
        startedAt, reservedSeconds: 120, lastActivityAt: new Date(startedAt.getTime() + 3_000), lastSequence: 0,
      });
      expect(open.map((row) => row.callId)).not.toContain(recentCall!.callId);
    });
  });

  it("leaves open calls older than two hours to the operator tooling, so they aren't billed in this period", async () => {
    await rollbackTest(async (tx) => {
      const businessId = await business(tx, { plan: "pro" });
      const [recent, historical] = await asWorker(tx, async (context) => [await startLivePhoneCall(context, call(businessId)), await startLivePhoneCall(context, call(businessId))]);
      await tx.update(calls).set({ startedAt: new Date(Date.now() - 110 * 60_000) }).where(eq(calls.id, recent!.callId));
      await tx.update(calls).set({ startedAt: new Date(Date.now() - 2 * 365 * 24 * 60 * 60_000) }).where(eq(calls.id, historical!.callId));
      const open = await asWorker(tx, (context) => listOpenLiveCalls(context, { businessId, startedBefore: new Date(Date.now() - 60_000) }));
      expect(open.map((row) => row.callId)).toEqual([recent!.callId]);
    });
  });

  it("reads a call's last saved turn, so a re-attach numbers its turns after it", async () => {
    await rollbackTest(async (tx) => {
      const businessId = await business(tx, { plan: "pro" });
      const [talked, silent] = await asWorker(tx, async (context) => [await startLivePhoneCall(context, call(businessId)), await startLivePhoneCall(context, call(businessId))]);
      await asWorker(tx, async (context) => {
        await saveLiveCallTurn(context, { businessId, callId: talked!.callId, sequence: 1, speaker: "assistant", text: "Thanks for calling." });
        await saveLiveCallTurn(context, { businessId, callId: talked!.callId, sequence: 2, speaker: "caller", text: "Do you open Saturdays?" });
      });
      await expect(asWorker(tx, (context) => lastLiveCallSequence(context, { businessId, callId: talked!.callId }))).resolves.toBe(2);
      await expect(asWorker(tx, (context) => lastLiveCallSequence(context, { businessId, callId: silent!.callId }))).resolves.toBe(0);
      // Another business's call reads as empty.
      const otherBusinessId = await business(tx, { plan: "pro" });
      await expect(asWorker(tx, (context) => lastLiveCallSequence(context, { businessId: otherBusinessId, callId: talked!.callId }))).resolves.toBe(0);
    });
  });

  it("gives a phone call on an unlimited plan the longest call length, and keeps a withheld number out", async () => {
    await rollbackTest(async (tx) => {
      const businessId = await business(tx, { plan: "pro" });
      const started = await asWorker(tx, (context) => startLivePhoneCall(context, call(businessId)));
      await tx.update(calls).set({ startedAt: new Date(Date.now() - 2 * 60_000) }).where(eq(calls.id, started.callId));
      const [open] = await asWorker(tx, (context) => listOpenLiveCalls(context, { businessId, startedBefore: new Date(Date.now() - 60_000) }));
      expect(open).toMatchObject({ callId: started.callId, reservedSeconds: 1_800 });
      expect(open).not.toHaveProperty("callerPhone");
    });
  });

  it("queues the recording copy in the outbox with the call's finish, once, and retries it as a new job", async () => {
    await rollbackTest(async (tx) => {
      const businessId = await business(tx, { plan: "pro" });
      const phone = call(businessId, "+14165550134");
      const started = await asWorker(tx, (context) => startLivePhoneCall(context, phone));
      const recording = { sessionId: phone.sessionId, durationMs: 42_000 };
      const finished = await asWorker(tx, async (context) => [
        await finishLiveCall(context, { businessId, callId: started.callId, seconds: 42, end: "caller_hung_up", recording }),
        // A late re-attach finishing the same call again queues nothing.
        await finishLiveCall(context, { businessId, callId: started.callId, seconds: 42, end: "caller_hung_up", recording }),
      ]);
      expect(finished).toEqual([true, false]);
      const jobs = () => tx.select({ dedupeKey: outboxMessages.dedupeKey, payload: outboxMessages.payload, availableAt: outboxMessages.availableAt }).from(outboxMessages).where(and(eq(outboxMessages.aggregateId, started.callId), eq(outboxMessages.topic, "call.saveRecording")));
      const [first, ...rest] = await jobs();
      expect(rest).toHaveLength(0);
      expect(first).toMatchObject({ dedupeKey: `call:${started.callId}:recording:1`, payload: { callId: started.callId, sessionId: phone.sessionId, durationMs: 42_000, attempt: 1 } });
      expect(first!.availableAt.getTime()).toBeGreaterThan(Date.now() + 3_000);

      // OpenAI answered 404: the next attempt is its own outbox row, ten seconds out.
      await asWorker(tx, (context) => retryLiveCallRecording(context, { businessId, callId: started.callId, ...recording, attempt: 2 }));
      expect((await jobs()).map((row) => row.dedupeKey).sort()).toEqual([`call:${started.callId}:recording:1`, `call:${started.callId}:recording:2`]);
      await expect(asWorker(tx, (context) => liveCallHasRecording(context, { businessId, callId: started.callId }))).resolves.toBe(false);
    });
  });

  it("bills a call the worker's shutdown ended, as service_restart", async () => {
    await rollbackTest(async (tx) => {
      const businessId = await business(tx, { plan: "free_cloud" });
      const started = await asWorker(tx, (context) => startLivePhoneCall(context, call(businessId, "+14165550134")));
      await asWorker(tx, (context) => finishLiveCall(context, { businessId, callId: started.callId, seconds: 120, measuredSeconds: 119.6, end: "service_restart" }));
      const [row] = await tx.select({ status: calls.status, disposition: calls.disposition }).from(calls).where(eq(calls.id, started.callId));
      expect(row).toEqual({ status: "completed", disposition: "service_restart" });
      const [usage] = await tx.select({ quantity: billingUsageEvents.quantity }).from(billingUsageEvents).where(eq(billingUsageEvents.sourceKey, `voice:${started.callId}`));
      expect(usage!.quantity).toBe(120);
    });
  });
});
