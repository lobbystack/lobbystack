import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { agentRules, agents, billingAccounts, businesses, calls, contacts, conversations, createDatabaseClient, inboxItems } from "@lobbystack/db";
import { apiAgentSchema, apiCallSchema, apiMessageSchema } from "@lobbystack/shared";

import { runPrivacyRetentionSweep } from "../privacy";
import { takeMessageForStaff } from "../receptionistActions";
import { createVoiceFollowUpTask } from "../voice";
import { PublicApiError } from "./errors";
import { getAgentForApi, getCallForApi, getReceptionistForApi, listAgentsForApi, listCallsForApi, listMessagesForApi, type ApiKeyCaller } from "./operations";

// Explicit opt-in only; never fall back to DATABASE_URL or load an env file.
const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
    throw new Error("Public API integration tests require a dedicated local test database.");
  }
}

// The admin serves /api/v1 with the lobbystack_worker role; run the same role here.
function roleUrl(role: string): string {
  const url = new URL(testUrl!);
  url.searchParams.set("options", `-c role=${role}`);
  return url.toString();
}

const admin = testUrl ? createDatabaseClient("lobbystack_migrator", { DATABASE_URL: testUrl }) : undefined;
const worker = testUrl ? createDatabaseClient("lobbystack_worker", { DATABASE_URL: roleUrl("lobbystack_worker") }) : undefined;

const agentRow = (businessId: string, extra: Partial<typeof agents.$inferInsert> = {}) => ({ businessId, greeting: "Hi", tone: "warm", summary: "Shared summary", bookingPolicy: "Book", transferMode: "never", bookingMode: "instant", ...extra });

async function expectNotFound(promise: Promise<unknown>) {
  const error = await promise.then(() => null, (value: unknown) => value);
  expect(error).toBeInstanceOf(PublicApiError);
  expect(error).toMatchObject({ status: 404, code: "not_found" });
}

describe.skipIf(!testUrl)("agents in the public API, with two agents", () => {
  const businessId = randomUUID();
  const otherBusinessId = randomUUID();
  const caller: ApiKeyCaller = { businessId, apiKeyId: randomUUID() };
  const context = { db: worker?.db as NonNullable<typeof worker>["db"] };
  let frontDesk: string;
  let evening: string;
  let archived: string;
  let otherAgent: string;
  let contactId: string;

  beforeAll(async () => {
    await admin!.db.insert(businesses).values([
      { id: businessId, slug: `api-agents-${businessId}`, name: "Agents Clinic", timezone: "UTC", businessType: "test" },
      { id: otherBusinessId, slug: `api-agents-${otherBusinessId}`, name: "Other Clinic", timezone: "UTC", businessType: "test" },
    ]);
    await admin!.db.insert(billingAccounts).values({ businessId, billingKey: `business:${businessId}`, plan: "starter", subscriptionState: "active" });
    const old = new Date(Date.now() - 60_000);
    // The second agent is the older one, so the list must put the default first by more than age.
    [{ id: evening }] = await admin!.db.insert(agents).values(agentRow(businessId, { name: "Evening", greeting: "Good evening", chatInstructions: "Column text no one reads", voice: "cedar", createdAt: old })).returning({ id: agents.id }) as [{ id: string }];
    // chat_instructions reads the agent's website chat rule, not the deprecated column.
    await admin!.db.insert(agentRules).values({ businessId, agentId: evening, title: "In website chat", content: "Keep it short.", channel: "web_chat" });
    [{ id: frontDesk }] = await admin!.db.insert(agents).values(agentRow(businessId, { name: "Front desk", isDefault: true })).returning({ id: agents.id }) as [{ id: string }];
    [{ id: archived }] = await admin!.db.insert(agents).values(agentRow(businessId, { name: "Old", archivedAt: new Date() })).returning({ id: agents.id }) as [{ id: string }];
    [{ id: otherAgent }] = await admin!.db.insert(agents).values(agentRow(otherBusinessId, { isDefault: true })).returning({ id: agents.id }) as [{ id: string }];
    [{ id: contactId }] = await admin!.db.insert(contacts).values({ businessId, phone: "+14165550142", name: "Ada" }).returning({ id: contacts.id }) as [{ id: string }];
  });

  afterAll(async () => {
    await admin?.db.delete(businesses).where(inArray(businesses.id, [businessId, otherBusinessId]));
    await Promise.all([admin?.pool.end(), worker?.pool.end()]);
  });

  it("lists active agents, the default first, with their own settings", async () => {
    const list = await listAgentsForApi(context, caller);
    expect(list.map((agent) => [agent.name, agent.is_default, agent.paused])).toEqual([["Front desk", true, false], ["Evening", false, false]]);
    for (const agent of list) expect(apiAgentSchema.parse(agent)).toEqual(agent);
    expect(list[1]).toMatchObject({ id: evening, greeting: "Good evening", chat_instructions: "Keep it short.", voice: "cedar" });
    expect(list[1]).not.toHaveProperty("summary");
    // /receptionist stays on the default agent.
    expect(await getReceptionistForApi(context, caller)).toMatchObject({ greeting: "Hi", summary: "Shared summary" });
  });

  it("reads one agent, and 404s an archived agent or another business's", async () => {
    expect(await getAgentForApi(context, caller, evening)).toMatchObject({ id: evening, name: "Evening", is_default: false });
    await expectNotFound(getAgentForApi(context, caller, archived));
    await expectNotFound(getAgentForApi(context, caller, otherAgent));
    await expectNotFound(getAgentForApi(context, caller, randomUUID()));
  });

  it("marks agents past a free plan's limit as paused", async () => {
    await admin!.db.update(billingAccounts).set({ plan: "free_cloud", subscriptionState: "none" }).where(eq(billingAccounts.businessId, businessId));
    try {
      expect((await listAgentsForApi(context, caller)).map((agent) => [agent.name, agent.paused])).toEqual([["Front desk", false], ["Evening", true]]);
      expect((await getAgentForApi(context, caller, evening)).paused).toBe(true);
    } finally {
      await admin!.db.update(billingAccounts).set({ plan: "starter", subscriptionState: "active" }).where(eq(billingAccounts.businessId, businessId));
    }
  });

  it("names the agent on each call and on the messages taken in it", async () => {
    const started = new Date(Date.now() - 120_000);
    const [eveningCall, frontCall] = await admin!.db.insert(calls).values([
      { businessId, agentId: evening, contactId, providerCallId: `test-${randomUUID()}`, transport: "sip", status: "completed", startedAt: started, endedAt: new Date() },
      { businessId, agentId: frontDesk, contactId, providerCallId: `test-${randomUUID()}`, transport: "sip", status: "completed", startedAt: new Date(started.getTime() + 1_000), endedAt: new Date() },
    ]).returning({ id: calls.id });
    const page = await listCallsForApi(context, caller, { limit: 100 });
    for (const call of page.data) expect(apiCallSchema.parse(call)).toEqual(call);
    expect(Object.fromEntries(page.data.map((call) => [call.id, call.agent_id]))).toMatchObject({ [eveningCall!.id]: evening, [frontCall!.id]: frontDesk });
    expect((await getCallForApi(context, caller, eveningCall!.id)).agent_id).toBe(evening);

    const message = await createVoiceFollowUpTask(context, { businessId, callId: eveningCall!.id, callerName: "Ada", message: "Call back", channel: "voice" });
    const messages = await listMessagesForApi(context, caller, { limit: 100 });
    const shown = messages.data.find((entry) => entry.id === message.inboxItemId);
    expect(apiMessageSchema.parse(shown)).toMatchObject({ call_id: eveningCall!.id, agent_id: evening });
  });

  it("names the agent on a message taken in a chat, and keeps it once the content expires", async () => {
    const [conversation] = await admin!.db.insert(conversations).values({ businessId, contactId, channel: "web_chat", agentId: evening }).returning({ id: conversations.id });
    const taken = await takeMessageForStaff(context, { businessId, agentId: evening, message: "Wants a quote.", channel: "web_chat", callerName: "Ada", conversationId: conversation!.id });
    const read = async () => (await listMessagesForApi(context, caller, { limit: 100 })).data.find((entry) => entry.id === taken.inboxItemId);
    expect(await read()).toMatchObject({ call_id: null, agent_id: evening, caller_name: "Ada" });

    await admin!.db.update(inboxItems).set({ contentExpiresAt: new Date(Date.now() - 1_000) }).where(eq(inboxItems.id, taken.inboxItemId));
    await runPrivacyRetentionSweep(context, { businessId });
    const [row] = await admin!.db.select({ status: inboxItems.contentRetentionStatus, metadata: inboxItems.metadata }).from(inboxItems).where(eq(inboxItems.id, taken.inboxItemId));
    expect(row).toEqual({ status: "scrubbed", metadata: { agentId: evening } });
    expect(await read()).toMatchObject({ caller_name: null, agent_id: evening });

    // A message with no agent of record has none after the sweep either.
    const unknown = await createVoiceFollowUpTask(context, { businessId, callerName: "Bo", message: "Hello", channel: "sms" });
    await admin!.db.update(inboxItems).set({ contentExpiresAt: new Date(Date.now() - 1_000) }).where(eq(inboxItems.id, unknown.inboxItemId));
    await runPrivacyRetentionSweep(context, { businessId });
    const [scrubbed] = await admin!.db.select({ metadata: inboxItems.metadata }).from(inboxItems).where(eq(inboxItems.id, unknown.inboxItemId));
    expect(scrubbed?.metadata).toBeNull();
    expect((await listMessagesForApi(context, caller, { limit: 100 })).data.find((entry) => entry.id === unknown.inboxItemId)?.agent_id).toBeNull();
  });
});
