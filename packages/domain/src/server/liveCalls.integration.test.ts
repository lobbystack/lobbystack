import { randomUUID } from "node:crypto";

import { and, eq, inArray, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { billingAccounts, billingUsageEvents, billingUsageMonths, businesses, calls, contacts, createDatabaseClient, enqueueOutbox, outboxMessages, transcripts, type Database, type DatabaseTransaction } from "@lobbystack/db";

import { blockLiveCaller, extendLiveCallReservation, finishLiveCall, lastLiveCallSequence, listOpenLiveCalls, liveCallHasRecording, markLiveCallMediaStarted, retryLiveCallRecording, saveLiveCallTurn, startLivePhoneCall, startLiveWebCall } from "./liveCalls";
import { heldForCall } from "./notifications";
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

// What each call's reservation holds now, in the order given.
async function reserved(tx: DatabaseTransaction, callIds: string[]) {
  const rows = await tx.select({ sourceKey: billingUsageEvents.sourceKey, quantity: billingUsageEvents.quantity }).from(billingUsageEvents).where(inArray(billingUsageEvents.sourceKey, callIds.map((id) => `voice:${id}`)));
  return callIds.map((id) => rows.find((row) => row.sourceKey === `voice:${id}`)?.quantity);
}

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

  it("shares a capped Starter plan's minutes between two calls, a slice at a time", async () => {
    await rollbackTest(async (tx) => {
      // 2,000 included seconds left, plus 300 seconds the $1 cap allows at $0.20 a minute.
      const businessId = await business(tx, { plan: "starter", capCents: 100, usedSeconds: 7_000 });
      const first = call(businessId, "+14165550134");
      const second = call(businessId, "+14165550135");
      const started = await asWorker(tx, async (context) => [await startLivePhoneCall(context, first), await startLivePhoneCall(context, second)]);
      expect(started.map((row) => row.maxDurationMs)).toEqual([300_000, 300_000]);
      const [firstId, secondId] = started.map((row) => row.callId) as [string, string];
      // The first call grows to the longest call, which leaves 200 seconds for the second.
      const grants = await asWorker(tx, async (context) => {
        const result: number[] = [];
        for (const callId of [firstId, firstId, firstId, firstId, firstId, firstId, secondId, secondId]) result.push(await extendLiveCallReservation(context, { businessId, callId }));
        return result;
      });
      expect(grants).toEqual([300, 300, 300, 300, 300, 0, 200, 0]);
      expect(await reserved(tx, [firstId, secondId])).toEqual([1_800, 500]);
      // Nothing is left for a third.
      await expect(asWorker(tx, (context) => startLivePhoneCall(context, call(businessId, "+14165550136")))).rejects.toMatchObject({ code: "voice_limit_reached" });

      // The month counts what the calls hold, and the cap blocks more.
      const [month] = await tx.select({ voiceSecondsUsed: billingUsageMonths.voiceSecondsUsed, voiceBlocked: billingUsageMonths.voiceBlocked }).from(billingUsageMonths).where(eq(billingUsageMonths.businessId, businessId));
      expect(month).toEqual({ voiceSecondsUsed: 9_300, voiceBlocked: true });
      // Billed as reserved on a monthly plan, and synced to Polar only once the calls finish.
      const events = await tx.select({ quantity: billingUsageEvents.quantity, billableQuantity: billingUsageEvents.billableQuantity, syncStatus: billingUsageEvents.syncStatus }).from(billingUsageEvents).where(inArray(billingUsageEvents.sourceKey, [`voice:${firstId}`, `voice:${secondId}`]));
      expect(events.every((row) => row.billableQuantity === row.quantity && row.syncStatus === "pending")).toBe(true);
      expect(await tx.select({ id: outboxMessages.id }).from(outboxMessages).where(and(eq(outboxMessages.businessId, businessId), eq(outboxMessages.topic, "billing.syncUsage")))).toHaveLength(0);

      // A retried delivery attaches with what the call holds now.
      const retried = await asWorker(tx, async (context) => [await startLivePhoneCall(context, first), await startLivePhoneCall(context, second)]);
      expect(retried.map((row) => [row.duplicate, row.maxDurationMs])).toEqual([[true, 1_800_000], [true, 500_000]]);
    });
  });

  it("lets two calls in at once on a free plan, a slice each, and limits a call to the minutes left", async () => {
    await rollbackTest(async (tx) => {
      // Free plans include 1,800 seconds, one call's longest length.
      const businessId = await business(tx, { plan: "free_cloud" });
      const started = await asWorker(tx, async (context) => [await startLivePhoneCall(context, call(businessId, "+14165550134")), await startLivePhoneCall(context, call(businessId, "+14165550135"))]);
      expect(started.map((row) => row.maxDurationMs)).toEqual([300_000, 300_000]);
      expect(await reserved(tx, started.map((row) => row.callId))).toEqual([300, 300]);

      // 150 seconds left: the call gets them, and the next caller hears busy.
      const nearlyOut = await business(tx, { plan: "free_cloud", usedSeconds: 1_650 });
      await expect(asWorker(tx, (context) => startLivePhoneCall(context, call(nearlyOut, "+14165550134")))).resolves.toMatchObject({ maxDurationMs: 150_000 });
      await expect(asWorker(tx, (context) => startLivePhoneCall(context, call(nearlyOut, "+14165550135")))).rejects.toMatchObject({ code: "voice_limit_reached" });
    });
  });

  it("grows reservations a slice at a time until the plan runs out, then grants nothing", async () => {
    await rollbackTest(async (tx) => {
      // 1,600 seconds left: two slices up front, then 1,000 to share.
      const businessId = await business(tx, { plan: "free_cloud", usedSeconds: 200 });
      const first = call(businessId, "+14165550134");
      const started = await asWorker(tx, async (context) => [await startLivePhoneCall(context, first), await startLivePhoneCall(context, call(businessId, "+14165550135"))]);
      const [a, b] = started.map((row) => row.callId) as [string, string];
      const grants = await asWorker(tx, async (context) => {
        const result: number[] = [];
        for (const callId of [a, b, a, b, a, b]) result.push(await extendLiveCallReservation(context, { businessId, callId }));
        return result;
      });
      // The last slice is what was left.
      expect(grants).toEqual([300, 300, 300, 100, 0, 0]);
      expect(await reserved(tx, [a, b])).toEqual([900, 700]);
      const [month] = await tx.select({ voiceSecondsUsed: billingUsageMonths.voiceSecondsUsed, voiceBlocked: billingUsageMonths.voiceBlocked }).from(billingUsageMonths).where(eq(billingUsageMonths.businessId, businessId));
      expect(month).toEqual({ voiceSecondsUsed: 1_800, voiceBlocked: true });
      await expect(asWorker(tx, (context) => startLivePhoneCall(context, call(businessId, "+14165550136")))).rejects.toMatchObject({ code: "voice_limit_reached" });
      // A retried delivery reads back what the call holds now.
      await expect(asWorker(tx, (context) => startLivePhoneCall(context, first))).resolves.toMatchObject({ duplicate: true, maxDurationMs: 900_000 });

      // A finished call gives back what it didn't use, and a call still running can grow into it.
      await asWorker(tx, (context) => finishLiveCall(context, { businessId, callId: b, seconds: 400, end: "caller_hung_up" }));
      await expect(asWorker(tx, (context) => extendLiveCallReservation(context, { businessId, callId: a }))).resolves.toBe(300);
    });
  });

  it("never grows one call's reservation past 30 minutes", async () => {
    await rollbackTest(async (tx) => {
      // A capped Pro plan has hours left, so only the longest call stops it.
      const businessId = await business(tx, { plan: "pro", capCents: 10_000 });
      const started = await asWorker(tx, (context) => startLivePhoneCall(context, call(businessId, "+14165550134")));
      const callInput = { businessId, callId: started.callId };
      const grants = await asWorker(tx, async (context) => {
        const result: number[] = [];
        for (let ask = 0; ask < 6; ask += 1) result.push(await extendLiveCallReservation(context, callInput));
        return result;
      });
      expect(grants).toEqual([300, 300, 300, 300, 300, 0]);
      expect(await reserved(tx, [started.callId])).toEqual([1_800]);
      // A partial slice tops up to exactly 30 minutes.
      await tx.update(billingUsageEvents).set({ quantity: 1_650 }).where(eq(billingUsageEvents.sourceKey, `voice:${started.callId}`));
      await expect(asWorker(tx, (context) => extendLiveCallReservation(context, callInput))).resolves.toBe(150);
      expect(await reserved(tx, [started.callId])).toEqual([1_800]);
    });
  });

  it("keeps growing a call whose plan became unlimited mid-call, up to 30 minutes", async () => {
    await rollbackTest(async (tx) => {
      const businessId = await business(tx, { plan: "free_cloud", usedSeconds: 1_500 });
      const started = await asWorker(tx, (context) => startLivePhoneCall(context, call(businessId, "+14165550134")));
      expect(started.maxDurationMs).toBe(300_000);
      // The business upgrades to Pro with no overage cap while the caller talks.
      await tx.insert(billingAccounts).values({ businessId, billingKey: `test:${businessId}`, plan: "pro", subscriptionState: "active", billingInterval: "month" });
      const grants = await asWorker(tx, async (context) => {
        const result: number[] = [];
        for (let ask = 0; ask < 6; ask += 1) result.push(await extendLiveCallReservation(context, { businessId, callId: started.callId }));
        return result;
      });
      expect(grants).toEqual([300, 300, 300, 300, 300, 0]);
    });
  });

  it("grants nothing to an ended call, a call on an unlimited plan, or a browser call", async () => {
    await rollbackTest(async (tx) => {
      const freeId = await business(tx, { plan: "free_cloud" });
      const unlimitedId = await business(tx, { plan: "pro" });
      const [ended, unlimited, browser] = await asWorker(tx, async (context) => [
        await startLivePhoneCall(context, call(freeId, "+14165550134")),
        await startLivePhoneCall(context, call(unlimitedId, "+14165550135")),
        await startLiveWebCall(context, { businessId: freeId, sessionId: `live_${randomUUID()}`, widgetId: "dashboard", billable: true, maxDurationMs: 120_000 }),
      ]);
      await asWorker(tx, (context) => finishLiveCall(context, { businessId: freeId, callId: ended!.callId, seconds: 42, end: "caller_hung_up" }));
      const grants = await asWorker(tx, async (context) => [
        await extendLiveCallReservation(context, { businessId: freeId, callId: ended!.callId }),
        await extendLiveCallReservation(context, { businessId: unlimitedId, callId: unlimited!.callId }),
        await extendLiveCallReservation(context, { businessId: freeId, callId: browser!.callId }),
      ]);
      expect(grants).toEqual([0, 0, 0]);
      expect(await reserved(tx, [ended!.callId, unlimited!.callId, browser!.callId])).toEqual([42, undefined, 120]);
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
      // 1,200 seconds left, so the phone call reserves a 300-second slice.
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
        startedAt, reservedSeconds: 300, slicedReservation: true, lastActivityAt: new Date(startedAt.getTime() + 90_000), lastSequence: 2,
      });
      expect(open.find((row) => row.callId === demoCall!.callId)).toEqual({
        businessId, callId: demoCall!.callId, sessionId: demo.sessionId, channel: "web_voice", conversationId: demoCall!.conversationId, intakeOnly: true,
        startedAt, reservedSeconds: 120, slicedReservation: false, lastActivityAt: new Date(startedAt.getTime() + 3_000), lastSequence: 0,
      });
      expect(open.map((row) => row.callId)).not.toContain(recentCall!.callId);
      // A top-up grows the reservation a recovery reads.
      await asWorker(tx, (context) => extendLiveCallReservation(context, { businessId, callId: phoneCall!.callId }));
      const grown = await asWorker(tx, (context) => listOpenLiveCalls(context, { businessId, startedBefore: new Date(Date.now() - 60_000) }));
      expect(grown.find((row) => row.callId === phoneCall!.callId)).toMatchObject({ reservedSeconds: 600 });
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

  it("saves Twilio's call SID when the trunk sent one", async () => {
    await rollbackTest(async (tx) => {
      const businessId = await business(tx, { plan: "pro" });
      const twilioCallSid = "CA0123456789abcdef0123456789abcdef";
      const [withSid, without] = await asWorker(tx, async (context) => [
        await startLivePhoneCall(context, { ...call(businessId, "+14165550134"), twilioCallSid }),
        await startLivePhoneCall(context, call(businessId, "+14165550135")),
      ]);
      const rows = await tx.select({ id: calls.id, twilioCallSid: calls.twilioCallSid }).from(calls).where(inArray(calls.id, [withSid!.callId, without!.callId]));
      expect(Object.fromEntries(rows.map((row) => [row.id, row.twilioCallSid]))).toEqual({ [withSid!.callId]: twilioCallSid, [without!.callId]: null });
    });
  });

  it("gives a phone call on an unlimited plan the longest call length, and keeps a withheld number out", async () => {
    await rollbackTest(async (tx) => {
      const businessId = await business(tx, { plan: "pro" });
      const started = await asWorker(tx, (context) => startLivePhoneCall(context, call(businessId)));
      await tx.update(calls).set({ startedAt: new Date(Date.now() - 2 * 60_000) }).where(eq(calls.id, started.callId));
      const [open] = await asWorker(tx, (context) => listOpenLiveCalls(context, { businessId, startedBefore: new Date(Date.now() - 60_000) }));
      expect(open).toMatchObject({ callId: started.callId, reservedSeconds: 1_800, slicedReservation: false });
      expect(open).not.toHaveProperty("callerPhone");
    });
  });

  it("sends the texts held during the call when it finishes, and only that call's", async () => {
    await rollbackTest(async (tx) => {
      const businessId = await business(tx, { plan: "pro" });
      const started = await asWorker(tx, (context) => startLivePhoneCall(context, call(businessId, "+14165550134")));
      const held = (callId: string) => enqueueOutbox(tx, { topic: "notification.dispatch", businessId, aggregateType: "appointment", aggregateId: randomUUID(), dedupeKey: `notification:${randomUUID()}:dispatch`, ...heldForCall(callId, { notificationId: randomUUID() }) });
      const [ours, other] = [await held(started.callId), await held(randomUUID())];
      await asWorker(tx, (context) => finishLiveCall(context, { businessId, callId: started.callId, seconds: 42, end: "caller_hung_up" }));
      const due = async (id: string) => (await tx.select({ availableAt: outboxMessages.availableAt }).from(outboxMessages).where(eq(outboxMessages.id, id)))[0]!.availableAt.getTime() <= Date.now();
      expect([await due(ours), await due(other)]).toEqual([true, false]);
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
