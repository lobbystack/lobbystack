import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { agents, billingAccounts, businessContextSnapshots, businesses, calls, contacts, conversations, createDatabaseClient, instagramAccounts, messages, outboxMessages, phoneNumbers, withBusinessTransaction, type Database, type DatabaseTransaction, defaultAgentIdOf } from "@lobbystack/db";

import { businessHasPhoneNumber } from "../snapshot";
import { getOrCreateWidgetConversation } from "./conversations";
import { loadInstagramReplyContext, receiveInstagramMessage } from "./instagram";
import { refreshBusinessSnapshot } from "./knowledge";
import { finishLiveCall, listOpenLiveCalls, startLivePhoneCall, startLiveWebCall } from "./liveCalls";
import { desiredNumberRouting, enqueueNumberAgentChange, refreshStaleRefusedCallForwards, resolveRefusedCallForward } from "./numberTrials";
import { lookupCallerAppointments, takeMessageForStaff } from "./agentActions";
import { activeAgentExistsInTransaction } from "./agentSettings";
import { loadTextReplyReachInTransaction, receiveInboundSms } from "./sms";
import { getBusinessSnapshotForAgent } from "./snapshotCache";
import { decideStaffFirstCall, loadStaffFirstHandover, recordStaffAnsweredCall } from "./staffFirst";
import { loadTextReplyContext } from "./textReplies";

// Each channel against PostgreSQL with the worker role and its row-level
// security, on a business with two agents, inside a transaction that always
// rolls back. Nothing else is faked.

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

const LINE_A = "+15145550101";
const LINE_B = "+15145550102";
const TRANSFER_A = "+14165550111";
const TRANSFER_B = "+14165550122";
const STAFF_B = "+14165550133";
const CALLER = "+447700900123";

type World = { tx: DatabaseTransaction; businessId: string; agentA: string; agentB: string; numberA: string; numberB: string };

const noChanges = { enabled: true, allowCancel: false, allowReschedule: false, verificationMode: "phone_match_and_facts" };

/** A business whose default agent answers LINE_A and whose second agent answers LINE_B. */
async function world(tx: DatabaseTransaction, input: { carrier?: string } = {}): Promise<World> {
  const businessId = randomUUID();
  await tx.insert(businesses).values({ id: businessId, slug: `agents-${businessId}`, name: "Harbor Dental", timezone: "UTC", businessType: "test", deploymentMode: "cloud", textRepliesEnabled: true });
  await tx.insert(billingAccounts).values({ businessId, billingKey: `business:${businessId}`, plan: "starter", subscriptionState: "active" }).onConflictDoUpdate({ target: billingAccounts.businessId, set: { plan: "starter", subscriptionState: "active" } });
  const common = { businessId, tone: "warm", summary: "A dental clinic", bookingPolicy: "Book" };
  const [a] = await tx.insert(agents).values({ ...common, isDefault: true, name: "Front desk", greeting: "Front desk here", transferMode: "on_request", transferNumber: TRANSFER_A, voice: "cedar" }).returning({ id: agents.id });
  const [b] = await tx.insert(agents).values({ ...common, name: "Evening", isDefault: false, greeting: "Evening desk here", transferMode: "always", transferNumber: TRANSFER_B, voice: "marin", appointmentChangePolicy: noChanges, staffFirstMode: "always", staffFirstNumber: STAFF_B, staffFirstHandoverMessage: "Evening handover" }).returning({ id: agents.id });
  const [lineA] = await tx.insert(phoneNumbers).values({ businessId, agentId: a!.id, e164: LINE_A, providerPhoneId: `PN${randomUUID()}`, status: "active", carrier: input.carrier ?? "twilio", voiceEnabled: true, smsEnabled: true }).returning({ id: phoneNumbers.id });
  const [lineB] = await tx.insert(phoneNumbers).values({ businessId, agentId: b!.id, e164: LINE_B, providerPhoneId: `PN${randomUUID()}`, status: "active", carrier: input.carrier ?? "twilio", voiceEnabled: true, smsEnabled: true }).returning({ id: phoneNumbers.id });
  await tx.execute(sql`insert into public.agent_rules (business_id, agent_id, title, content, sort_order) values (${businessId}::uuid, ${a!.id}::uuid, 'Day rule', 'Offer mornings', 0), (${businessId}::uuid, ${b!.id}::uuid, 'Night rule', 'Offer evenings', 0)`);
  // Each agent's own words for each channel, as rules kept to it.
  for (const [agentId, words] of [[a!.id, "Day"], [b!.id, "Night"]] as const) {
    await tx.execute(sql`insert into public.agent_rules (business_id, agent_id, title, content, sort_order, channel) values (${businessId}::uuid, ${agentId}::uuid, 'On calls', ${`${words} voice text`}, 1, 'voice'), (${businessId}::uuid, ${agentId}::uuid, 'In texts', ${`${words} text`}, 2, 'sms'), (${businessId}::uuid, ${agentId}::uuid, 'In website chat', ${`${words} chat`}, 3, 'web_chat')`);
  }
  return { tx, businessId, agentA: a!.id, agentB: b!.id, numberA: lineA!.id, numberB: lineB!.id };
}

async function withTwoAgents(run: (world: World, db: Database) => Promise<void>, input: { carrier?: string } = {}) {
  const rollback = new Error("rollback test fixture");
  try {
    await client!.db.transaction(async (tx) => {
      const fixture = await world(tx, input);
      await refreshBusinessSnapshot({ db: tx as unknown as Database }, { businessId: fixture.businessId });
      await tx.execute(sql`set local role lobbystack_worker`);
      await run(fixture, tx as unknown as Database);
      await tx.execute(sql`reset role`);
      // The composite foreign keys are deferred: a cross-business write fails here.
      await tx.execute(sql`set constraints all immediate`);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
}

const asMigrator = async <T>(tx: DatabaseTransaction, run: () => Promise<T>): Promise<T> => {
  await tx.execute(sql`reset role`);
  try {
    return await run();
  } finally {
    await tx.execute(sql`set local role lobbystack_worker`);
  }
};

/** Readers take the newest snapshot, and a second one in this transaction has the same generated_at, so the first has to go. */
async function rebuildSnapshot(tx: DatabaseTransaction, db: Database, businessId: string) {
  await asMigrator(tx, async () => { await tx.delete(businessContextSnapshots).where(eq(businessContextSnapshots.businessId, businessId)); });
  await refreshBusinessSnapshot({ db }, { businessId });
}

const callRow = async (tx: DatabaseTransaction, callId: string) => (await tx.select({ agentId: calls.agentId, conversationId: calls.conversationId }).from(calls).where(eq(calls.id, callId)))[0]!;
const conversationAgent = async (tx: DatabaseTransaction, conversationId: string) => (await tx.select({ agentId: conversations.agentId }).from(conversations).where(eq(conversations.id, conversationId)))[0]?.agentId;

describe.skipIf(!testUrl)("each channel answers as its own agent", () => {
  it("phone: the dialled number picks the agent, stored on the call and its conversation", async () => {
    await withTwoAgents(async ({ tx, businessId, agentA, agentB }, db) => {
      const [callA, callB] = [await startLivePhoneCall({ db }, { businessId, sessionId: `rtc_${randomUUID()}`, from: CALLER, to: LINE_A }), await startLivePhoneCall({ db }, { businessId, sessionId: `rtc_${randomUUID()}`, from: CALLER, to: LINE_B })];
      expect(callA.agentId).toBe(agentA);
      expect(callB.agentId).toBe(agentB);
      expect(await callRow(tx, callB.callId)).toEqual({ agentId: agentB, conversationId: callB.conversationId });
      expect(await conversationAgent(tx, callB.conversationId)).toBe(agentB);

      const snapshot = (await getBusinessSnapshotForAgent({ db }, { businessId, agentId: callB.agentId }))!;
      expect(snapshot).toMatchObject({ agentId: agentB, greeting: "Evening desk here", voice: "marin", transferPolicy: { mode: "always", transferNumber: TRANSFER_B } });
      expect(snapshot.rules).toContainEqual(expect.objectContaining({ content: "Night voice text", channel: "voice" }));
      expect(JSON.stringify(snapshot.rules)).not.toContain("Day voice text");
      expect(snapshot.contactChannels.phoneNumber).toBe(LINE_B);
    });
  });

  it("phone: routing stays live, and a retried delivery keeps the agent it started with", async () => {
    await withTwoAgents(async ({ tx, businessId, agentA, agentB, numberB }, db) => {
      const sessionId = `rtc_${randomUUID()}`;
      expect((await startLivePhoneCall({ db }, { businessId, sessionId, from: CALLER, to: LINE_B })).agentId).toBe(agentB);
      await asMigrator(tx, async () => { await tx.update(phoneNumbers).set({ agentId: agentA }).where(eq(phoneNumbers.id, numberB)); });
      const retried = await startLivePhoneCall({ db }, { businessId, sessionId, from: CALLER, to: LINE_B });
      expect(retried).toMatchObject({ duplicate: true, agentId: agentB });
      // The stale snapshot doesn't matter: the next call reads the number.
      expect((await startLivePhoneCall({ db }, { businessId, sessionId: `rtc_${randomUUID()}`, from: CALLER, to: LINE_B })).agentId).toBe(agentA);
    });
  });

  it("phone: a call to a number the business doesn't hold, or a withheld caller, gets the default agent", async () => {
    await withTwoAgents(async ({ businessId, agentA }, db) => {
      expect((await startLivePhoneCall({ db }, { businessId, sessionId: `rtc_${randomUUID()}`, from: undefined, to: "+15145550999" })).agentId).toBe(agentA);
    });
  });

  it("refused forward: follows the number's agent, and a moved number's forward changes with it", async () => {
    await withTwoAgents(async ({ tx, businessId, agentA, numberB }, db) => {
      expect(await resolveRefusedCallForward({ db }, { businessId, e164: LINE_A })).toBe(TRANSFER_A);
      expect(await resolveRefusedCallForward({ db }, { businessId, e164: LINE_B })).toBe(TRANSFER_B);
      await asMigrator(tx, async () => { await tx.update(phoneNumbers).set({ refusedCallsForwardTo: TRANSFER_B }).where(eq(phoneNumbers.id, numberB)); });

      // A move queues the routing job that writes the new forward to the carrier, and the snapshot refresh.
      await asMigrator(tx, async () => {
        await tx.update(phoneNumbers).set({ agentId: agentA }).where(eq(phoneNumbers.id, numberB));
        await withBusinessTransaction(db, { businessId, actorType: "worker" }, async (inner) => await enqueueNumberAgentChange(inner, { businessId, phoneNumberId: numberB, agentId: agentA }));
      });
      const jobs = await asMigrator(tx, async () => await tx.select({ topic: outboxMessages.topic, payload: outboxMessages.payload }).from(outboxMessages).where(eq(outboxMessages.businessId, businessId)));
      expect(jobs).toEqual(expect.arrayContaining([expect.objectContaining({ topic: "phoneNumber.route", payload: expect.objectContaining({ phoneNumberId: numberB }) }), expect.objectContaining({ topic: "snapshot.refresh", payload: expect.objectContaining({ reason: "channel_moved" }) })]));
      expect(await resolveRefusedCallForward({ db }, { businessId, e164: LINE_B })).toBe(TRANSFER_A);
    }, { carrier: "telnyx" });
  });

  it("refused forward: the hourly sweep catches a Telnyx number whose stored forward is another agent's", async () => {
    await withTwoAgents(async ({ tx, businessId, numberA, numberB }, db) => {
      await asMigrator(tx, async () => {
        await tx.update(phoneNumbers).set({ refusedCallsForwardTo: TRANSFER_A }).where(eq(phoneNumbers.id, numberA));
        await tx.update(phoneNumbers).set({ refusedCallsForwardTo: TRANSFER_A }).where(eq(phoneNumbers.id, numberB));
      });
      expect(await refreshStaleRefusedCallForwards({ db }, { businessId })).toBe(1);
    }, { carrier: "telnyx" });
  });

  it("staff first: only the number whose agent has it on rings, with that agent's phone and handover", async () => {
    vi.stubEnv("OPENAI_PROJECT_ID", "proj_test");
    await withTwoAgents(async ({ tx, businessId, numberA, numberB, agentB }, db) => {
      expect(await desiredNumberRouting({ db }, { businessId, phoneNumberId: numberA })).toMatchObject({ mode: "receptionist" });
      expect(await desiredNumberRouting({ db }, { businessId, phoneNumberId: numberB })).toMatchObject({ mode: "staff_first" });
      expect(await decideStaffFirstCall({ db }, { businessId, e164: LINE_B, providerCallId: `CA${randomUUID()}`, from: CALLER })).toMatchObject({ action: "ring", phone: STAFF_B });
      expect(await decideStaffFirstCall({ db }, { businessId, e164: LINE_A, providerCallId: `CA${randomUUID()}`, from: CALLER })).toMatchObject({ action: "agent" });
      expect(await loadStaffFirstHandover({ db }, { businessId, e164: LINE_B })).toMatchObject({ message: "Evening handover" });
      expect(await loadStaffFirstHandover({ db }, { businessId, e164: LINE_A })).not.toHaveProperty("message");

      const providerCallId = `CA${randomUUID()}`;
      await recordStaffAnsweredCall({ db }, { businessId, providerCallId, from: CALLER, to: LINE_B, seconds: 30 });
      expect((await tx.select({ agentId: calls.agentId }).from(calls).where(eq(calls.providerCallId, providerCallId)))[0]?.agentId).toBe(agentB);
    });
    vi.unstubAllEnvs();
  });

  it("test call: records the agent the operator chose, with no agent meaning the default", async () => {
    await withTwoAgents(async ({ tx, businessId, agentA, agentB }, db) => {
      const chosen = await startLiveWebCall({ db }, { businessId, sessionId: `web_${randomUUID()}`, widgetId: "lobbystack-dashboard-test-call", billable: false, agentId: agentB });
      expect(chosen.agentId).toBe(agentB);
      expect((await callRow(tx, chosen.callId)).agentId).toBe(agentB);
      expect(await conversationAgent(tx, chosen.conversationId)).toBe(agentB);
      expect((await startLiveWebCall({ db }, { businessId, sessionId: `web_${randomUUID()}`, widgetId: "lobbystack-dashboard-test-call", billable: false })).agentId).toBe(agentA);
    });
  });

  it("test call: the operator's access finds their own active agent, and nothing of another business's", async () => {
    await withTwoAgents(async ({ tx, businessId, agentB }, db) => {
      const otherBusinessId = await asMigrator(tx, async () => {
        const other = randomUUID();
        await tx.insert(businesses).values({ id: other, slug: `agents-${other}`, name: "Other", timezone: "UTC", businessType: "test" });
        return other;
      });
      const [foreign] = await asMigrator(tx, async () => await tx.insert(agents).values({ businessId: otherBusinessId, greeting: "Hi", tone: "warm", bookingPolicy: "Book", transferMode: "never" }).returning({ id: agents.id }));
      await tx.execute(sql`set local role lobbystack_app`);
      const find = (agentId: string) => withBusinessTransaction(db, { businessId, actorType: "system" }, (inner) => activeAgentExistsInTransaction(inner, { businessId, agentId }));
      expect(await find(agentB)).toBe(true);
      expect(await find(foreign!.id)).toBe(false);
      expect(await find(randomUUID())).toBe(false);
      await asMigrator(tx, async () => {
        await tx.update(phoneNumbers).set({ status: "released" }).where(eq(phoneNumbers.agentId, agentB));
        await tx.update(agents).set({ archivedAt: new Date() }).where(eq(agents.id, agentB));
      });
      await tx.execute(sql`set local role lobbystack_app`);
      expect(await find(agentB)).toBe(false);
      await tx.execute(sql`set local role lobbystack_worker`);
    });
  });

  it("widget: a new chat stores the key's agent, and an open chat keeps the one it has", async () => {
    await withTwoAgents(async ({ tx, businessId, agentA, agentB }, db) => {
      const widgetVisitorId = randomUUID();
      const chat = await getOrCreateWidgetConversation({ db }, { businessId, widgetVisitorId, agentId: agentB });
      expect(chat.agentId).toBe(agentB);
      expect(await conversationAgent(tx, chat.conversationId)).toBe(agentB);
      expect(await getOrCreateWidgetConversation({ db }, { businessId, widgetVisitorId, agentId: agentA })).toMatchObject({ conversationId: chat.conversationId, agentId: agentB });
      const snapshot = await getBusinessSnapshotForAgent({ db }, { businessId, agentId: chat.agentId });
      expect(snapshot?.rules).toContainEqual(expect.objectContaining({ content: "Night chat", channel: "web_chat" }));
      expect((await getOrCreateWidgetConversation({ db }, { businessId, widgetVisitorId: randomUUID() })).agentId).toBe(agentA);
    });
  });

  it("Instagram: a conversation stores the account's agent, and the reply context names it", async () => {
    await withTwoAgents(async ({ tx, businessId, agentB }, db) => {
      await asMigrator(tx, async () => { await tx.insert(instagramAccounts).values({ businessId, agentId: agentB, instagramUserId: randomUUID(), encryptedAccessToken: "token", tokenExpiresAt: new Date(Date.now() + 86_400_000) }); });
      const received = await receiveInstagramMessage({ db }, { businessId, senderId: randomUUID(), providerMessageId: randomUUID(), text: "Open tonight?", sentAt: new Date() });
      const job = (await asMigrator(tx, async () => await tx.select({ payload: outboxMessages.payload }).from(outboxMessages).where(and(eq(outboxMessages.businessId, businessId), eq(outboxMessages.topic, "instagram.reply")))))[0]!;
      const conversationId = String(job.payload.conversationId);
      expect(await conversationAgent(tx, conversationId)).toBe(agentB);
      // The job's payload holds what an old worker's did: only the conversation and the message.
      expect(Object.keys(job.payload).sort()).toEqual(["conversationId", "messageId"]);
      expect(await loadInstagramReplyContext({ db }, { businessId, conversationId, messageId: received.messageId! })).toMatchObject({ agentId: agentB });
    });
  });

  it("text: each number has its own conversation and agent, and replies come from the number texted", async () => {
    await withTwoAgents(async ({ tx, businessId, agentA, agentB }, db) => {
      const text = (to: string, body: string) => receiveInboundSms({ db }, { businessId, providerMessageId: `SM${randomUUID()}`, from: CALLER, to, body, payload: {} });
      const [first, second, third] = [await text(LINE_A, "Open today?"), await text(LINE_B, "Open tonight?"), await text(LINE_B, "And tomorrow?")];
      const jobs = await asMigrator(tx, async () => await tx.select({ payload: outboxMessages.payload }).from(outboxMessages).where(and(eq(outboxMessages.businessId, businessId), eq(outboxMessages.topic, "sms.aiReply"))));
      const conversationOf = (messageId: string | undefined) => String(jobs.find((job) => job.payload.messageId === messageId)!.payload.conversationId);
      expect(new Set(jobs.map((job) => job.payload.conversationId)).size).toBe(2);
      expect(conversationOf(second.messageId)).toBe(conversationOf(third.messageId));
      expect(await conversationAgent(tx, conversationOf(first.messageId))).toBe(agentA);
      expect(await conversationAgent(tx, conversationOf(third.messageId))).toBe(agentB);

      // Rows in one transaction share a timestamp, so this puts the newest text last.
      await asMigrator(tx, async () => { await tx.update(messages).set({ createdAt: new Date(Date.now() + 60_000) }).where(eq(messages.id, third.messageId!)); });
      const reply = await loadTextReplyContext({ db }, { businessId, conversationId: conversationOf(third.messageId), messageId: third.messageId! });
      expect(reply).toMatchObject({ agentId: agentB, phone: CALLER });
      expect(await getBusinessSnapshotForAgent({ db }, { businessId, agentId: reply!.agentId })).toMatchObject({ rules: expect.arrayContaining([expect.objectContaining({ content: "Night text", channel: "sms" })]) });
      const from = (conversationId: string) => withBusinessTransaction(db, { businessId, actorType: "worker" }, async (inner) => (await loadTextReplyReachInTransaction(inner, { businessId, conversationId })).from);
      expect(await from(conversationOf(first.messageId))).toBe(LINE_A);
      expect(await from(conversationOf(third.messageId))).toBe(LINE_B);
    });
  });

  it("recovery: an open call lists its agent", async () => {
    await withTwoAgents(async ({ businessId, agentB }, db) => {
      const call = await startLivePhoneCall({ db }, { businessId, sessionId: `rtc_${randomUUID()}`, from: CALLER, to: LINE_B });
      const open = await listOpenLiveCalls({ db }, { businessId, startedBefore: new Date(Date.now() + 60_000) });
      expect(open.find((row) => row.callId === call.callId)).toMatchObject({ agentId: agentB });
    });
  });

  it("archived mid-call: a call under way finishes as its agent, and nothing new does", async () => {
    await withTwoAgents(async ({ tx, businessId, agentA, agentB, numberB }, db) => {
      const call = await startLiveWebCall({ db }, { businessId, sessionId: `web_${randomUUID()}`, widgetId: "lobbystack-dashboard-test-call", billable: false, agentId: agentB });
      await asMigrator(tx, async () => {
        await tx.update(phoneNumbers).set({ agentId: agentA }).where(eq(phoneNumbers.id, numberB));
        await tx.update(agents).set({ archivedAt: new Date() }).where(eq(agents.id, agentB));
      });
      await rebuildSnapshot(tx, db, businessId);
      const recovered = await getBusinessSnapshotForAgent({ db }, { businessId, agentId: agentB, underWay: true });
      expect(recovered).toMatchObject({ agentId: agentB, greeting: "Evening desk here", voice: "marin", rules: [expect.objectContaining({ title: "Night rule" }), expect.objectContaining({ content: "Night voice text", channel: "voice" }), expect.objectContaining({ content: "Night text", channel: "sms" }), expect.objectContaining({ content: "Night chat", channel: "web_chat" })] });
      expect(recovered?.contactChannels.phoneNumber).toBeUndefined();

      const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
      expect(await getBusinessSnapshotForAgent({ db }, { businessId, agentId: agentB })).toMatchObject({ greeting: "Front desk here" });
      expect(error).toHaveBeenCalledWith("[snapshot] unknown agent, answering as the default agent", businessId, agentB);
      error.mockRestore();
      expect(await finishLiveCall({ db }, { businessId, callId: call.callId, seconds: 30, end: "caller_finished", channel: "web_voice" })).toBe(true);
    });
  });

  it("unknown agent: the snapshot and the policy fall back to the default agent", async () => {
    await withTwoAgents(async ({ businessId }, db) => {
      const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
      expect(await getBusinessSnapshotForAgent({ db }, { businessId, agentId: randomUUID() })).toMatchObject({ greeting: "Front desk here" });
      error.mockRestore();
      expect((await lookupCallerAppointments({ db }, { businessId, agentId: randomUUID(), callerPhone: CALLER })).policy).toMatchObject({ allowCancel: true });
    });
  });

  it("tools: the appointment policy is the agent's own", async () => {
    await withTwoAgents(async ({ businessId, agentA, agentB }, db) => {
      expect((await lookupCallerAppointments({ db }, { businessId, agentId: agentA, callerPhone: CALLER })).policy).toMatchObject({ allowCancel: true });
      expect((await lookupCallerAppointments({ db }, { businessId, agentId: agentB, callerPhone: CALLER })).policy).toMatchObject({ allowCancel: false });
      expect((await lookupCallerAppointments({ db }, { businessId, callerPhone: CALLER })).policy).toMatchObject({ allowCancel: true });
    });
  });

  it("tools: a message taken outside any conversation opens one on the agent", async () => {
    await withTwoAgents(async ({ tx, businessId, agentB }, db) => {
      await takeMessageForStaff({ db }, { businessId, agentId: agentB, message: "Call me back", channel: "voice", callbackPhone: CALLER });
      expect((await tx.select({ agentId: conversations.agentId }).from(conversations).where(eq(conversations.businessId, businessId)))[0]?.agentId).toBe(agentB);
    });
  });

  it("rules: each agent's prompt gets only its own rules", async () => {
    await withTwoAgents(async ({ businessId, agentA, agentB }, db) => {
      const rulesOf = async (agentId?: string) => (await getBusinessSnapshotForAgent({ db }, { businessId, agentId }))!.rules?.map((rule) => rule.content);
      expect(await rulesOf(agentB)).toEqual(["Offer evenings", "Night voice text", "Night text", "Night chat"]);
      expect(await rulesOf(agentA)).toEqual(["Offer mornings", "Day voice text", "Day text", "Day chat"]);
      expect(await rulesOf()).toEqual(["Offer mornings", "Day voice text", "Day text", "Day chat"]);
    });
  });

  it("phone numbers: an agent with no number gets none, and widget voice still counts the business's", async () => {
    await withTwoAgents(async ({ tx, businessId, agentA, agentB, numberB }, db) => {
      await asMigrator(tx, async () => { await tx.update(phoneNumbers).set({ agentId: agentA }).where(eq(phoneNumbers.id, numberB)); });
      await rebuildSnapshot(tx, db, businessId);
      const snapshot = (await getBusinessSnapshotForAgent({ db }, { businessId, agentId: agentB }))!;
      expect(snapshot.contactChannels.phoneNumber).toBeUndefined();
      expect(businessHasPhoneNumber(snapshot)).toBe(true);
    });
  });
});

describe.skipIf(!testUrl)("a business with one agent", () => {
  it("answers each channel as before, with the default agent stored", async () => {
    const rollback = new Error("rollback test fixture");
    await client!.db.transaction(async (tx) => {
      const businessId = randomUUID();
      await tx.insert(businesses).values({ id: businessId, slug: `one-agent-${businessId}`, name: "Harbor Dental", timezone: "UTC", businessType: "test", deploymentMode: "cloud" });
      await tx.insert(billingAccounts).values({ businessId, billingKey: `business:${businessId}`, plan: "starter", subscriptionState: "active" }).onConflictDoUpdate({ target: billingAccounts.businessId, set: { plan: "starter", subscriptionState: "active" } });
      const [agent] = await tx.insert(agents).values({ businessId, isDefault: true, greeting: "Hello", tone: "warm", bookingPolicy: "Book", transferMode: "on_request", transferNumber: TRANSFER_A }).returning({ id: agents.id });
      await tx.insert(phoneNumbers).values({ businessId, agentId: defaultAgentIdOf(businessId), e164: LINE_A, providerPhoneId: `PN${randomUUID()}`, status: "active", voiceEnabled: true, smsEnabled: true });
      await refreshBusinessSnapshot({ db: tx as unknown as Database }, { businessId });
      await tx.execute(sql`set local role lobbystack_worker`);
      const db = tx as unknown as Database;

      const flat = (await getBusinessSnapshotForAgent({ db }, { businessId }))!;
      const call = await startLivePhoneCall({ db }, { businessId, sessionId: `rtc_${randomUUID()}`, from: CALLER, to: LINE_A });
      expect(call.agentId).toBe(agent!.id);
      const { agentId: _agentId, agentName: _agentName, tone: _tone, ...projected } = (await getBusinessSnapshotForAgent({ db }, { businessId, agentId: call.agentId }))!;
      expect(projected).toEqual(flat);
      expect(flat.contactChannels.phoneNumber).toBe(LINE_A);
      expect(businessHasPhoneNumber(flat)).toBe(true);
      expect(await resolveRefusedCallForward({ db }, { businessId, e164: LINE_A })).toBe(TRANSFER_A);
      throw rollback;
    }).catch((error: unknown) => { if (error !== rollback) throw error; });
  });

  it("keeps a snapshot built before agents had numbers working, with the flat number", async () => {
    const rollback = new Error("rollback test fixture");
    await client!.db.transaction(async (tx) => {
      const businessId = randomUUID();
      await tx.insert(businesses).values({ id: businessId, slug: `old-shape-${businessId}`, name: "Harbor Dental", timezone: "UTC", businessType: "test" });
      const [agent] = await tx.insert(agents).values({ businessId, isDefault: true, greeting: "Hello", tone: "warm", bookingPolicy: "Book", transferMode: "never" }).returning({ id: agents.id });
      await tx.insert(phoneNumbers).values({ businessId, agentId: defaultAgentIdOf(businessId), e164: LINE_A, providerPhoneId: `PN${randomUUID()}`, status: "active", voiceEnabled: true });
      await refreshBusinessSnapshot({ db: tx as unknown as Database }, { businessId });
      const db = tx as unknown as Database;
      const current = (await getBusinessSnapshotForAgent({ db }, { businessId }))!;
      // Stored by the release before this one: agents[] with no phoneNumber in it.
      const loaded = { ...current, agents: current.agents!.map(({ phoneNumber: _phoneNumber, ...fields }) => fields) };
      expect((await getBusinessSnapshotForAgent({ db }, { businessId, agentId: agent!.id, loaded }))!.contactChannels.phoneNumber).toBe(LINE_A);
      throw rollback;
    }).catch((error: unknown) => { if (error !== rollback) throw error; });
  });
});

// The NOT VALID check refuses a new null, so each test drops it, and it does
// that first, before it holds anything else. This block keeps the index, because
// dropping a check while agents is locked can deadlock with another file's
// business delete.
describe.skipIf(!testUrl)("a row from before agents were recorded", () => {
  async function oneAgent(table: "calls" | "conversations", run: (input: { tx: DatabaseTransaction; db: Database; businessId: string; agentId: string }) => Promise<void>) {
    const rollback = new Error("rollback test fixture");
    await client!.db.transaction(async (tx) => {
      await tx.execute(sql`alter table public.${sql.identifier(table)} drop constraint ${sql.identifier(`${table}_agent_id_present`)}`);
      const businessId = randomUUID();
      await tx.insert(businesses).values({ id: businessId, slug: `old-row-${businessId}`, name: "Harbor Dental", timezone: "UTC", businessType: "test", deploymentMode: "cloud", textRepliesEnabled: true });
      const [agent] = await tx.insert(agents).values({ businessId, isDefault: true, greeting: "Hello", tone: "warm", bookingPolicy: "Book", transferMode: "never" }).returning({ id: agents.id });
      await tx.insert(phoneNumbers).values({ businessId, agentId: defaultAgentIdOf(businessId), e164: LINE_A, providerPhoneId: `PN${randomUUID()}`, status: "active", voiceEnabled: true, smsEnabled: true });
      await run({ tx, db: tx as unknown as Database, businessId, agentId: agent!.id });
      throw rollback;
    }).catch((error: unknown) => { if (error !== rollback) throw error; });
  }

  it("text: an open conversation with no agent stays with the default agent's number", async () => {
    await oneAgent("conversations", async ({ tx, db, businessId, agentId }) => {
      const conversationId = randomUUID();
      const [contact] = await tx.insert(contacts).values({ businessId, phone: CALLER }).returning({ id: contacts.id });
      await tx.execute(sql`set local session_replication_role = replica`);
      await tx.execute(sql`insert into public.conversations (id, business_id, contact_id, channel, status, automation_state) values (${conversationId}::uuid, ${businessId}::uuid, ${contact!.id}::uuid, 'sms', 'open', 'ai_active')`);
      await tx.execute(sql`set local session_replication_role = origin`);
      await receiveInboundSms({ db }, { businessId, providerMessageId: `SM${randomUUID()}`, from: CALLER, to: LINE_A, body: "Still there?", payload: {} });
      const open = await tx.select({ id: conversations.id, agentId: conversations.agentId }).from(conversations).where(and(eq(conversations.businessId, businessId), eq(conversations.channel, "sms")));
      expect(open).toEqual([{ id: conversationId, agentId }]);
    });
  });

  it("recovery: an open call with no agent lists none, so the default agent takes it", async () => {
    await oneAgent("calls", async ({ tx, db, businessId }) => {
      const callId = randomUUID();
      await tx.execute(sql`set local session_replication_role = replica`);
      await tx.execute(sql`insert into public.calls (id, business_id, provider, provider_call_id, transport, started_at) values (${callId}::uuid, ${businessId}::uuid, 'openai_live', ${callId}, 'voice', now())`);
      await tx.execute(sql`set local session_replication_role = origin`);
      const open = await listOpenLiveCalls({ db }, { businessId, startedBefore: new Date(Date.now() + 60_000) });
      expect(open.find((row) => row.callId === callId)).toBeDefined();
      expect(open.find((row) => row.callId === callId)).not.toHaveProperty("agentId");
    });
  });
});
