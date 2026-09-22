import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const mocks = vi.hoisted(() => ({ transaction: vi.fn(), enqueue: vi.fn() }));
vi.mock("@lobbystack/db", async (original) => ({
  ...(await original<typeof import("@lobbystack/db")>()),
  withBusinessTransaction: mocks.transaction, enqueueOutbox: mocks.enqueue,
}));
vi.mock("./notifications", () => ({ queueOperatorAlertInTransaction: vi.fn() }));

import { messages, transcripts } from "@lobbystack/db";
import { appendMessage } from "./conversations";
import { receiveInboundSms } from "./sms";
import { upsertTranscript } from "./voice";
import { deleteTranscriptForRetention, runPrivacyRetentionSweep, scrubExpiredMessageContent } from "./privacy";
import { contentExpiry, getContentRetentionPolicy } from "./contentRetentionPolicy";

const context = { db: {} as never };
const now = new Date("2030-01-01T00:00:00Z");
const policy = { approvalId: "test-only-approval", categories: { messages: 2, transcripts: 3 }, messageMedia: "scrub_with_body" };
type Values = Record<string, unknown>;
let inserts: Array<{ table: unknown; values: Values; conflict?: Values }>;
let updates: Array<{ table: unknown; values: Values; where?: SQL }>;
let deletes: Array<{ table: unknown; where?: SQL }>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubEnv("CONTENT_RETENTION_ENABLED", "true");
  vi.stubEnv("CONTENT_RETENTION_POLICY_JSON", JSON.stringify(policy));
  inserts = []; updates = []; deletes = [];
  const selected = [{ id: "existing", smsConsentStatus: "subscribed" }];
  const selectChain = { from: () => selectChain, innerJoin: () => selectChain, where: () => selectChain,
    orderBy: () => selectChain, limit: async () => selected, then: (resolve: (rows: unknown[]) => unknown) => Promise.resolve([]).then(resolve) };
  const tx = {
    select: () => selectChain,
    insert: (table: unknown) => ({ values: (values: Values) => {
      const entry: { table: unknown; values: Values; conflict?: Values } = { table, values };
      inserts.push(entry);
      const chain = { onConflictDoNothing: () => chain,
        onConflictDoUpdate: ({ set }: { set: Values }) => { entry.conflict = set; return chain; },
        returning: async () => [{ id: "created", revision: 1 }] };
      return chain;
    } }),
    update: (table: unknown) => ({ set: (values: Values) => ({ where: (where: SQL) => {
      updates.push({ table, values, where });
      return { returning: async () => [{ id: "updated" }] };
    } }) }),
    delete: (table: unknown) => ({ where: (where: SQL) => {
      deletes.push({ table, where });
      return { returning: async () => [{ id: "deleted", callId: "call" }] };
    } }),
  };
  mocks.transaction.mockImplementation(async (_db, _scope, run) => run(tx));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("approved content retention", () => {
  it.each([undefined, "false", "1"])("fails closed for gate %s", (gate) => {
    vi.stubEnv("CONTENT_RETENTION_ENABLED", gate);
    expect(contentExpiry("messages")).toBeNull();
  });
  it.each(["{", "{}", JSON.stringify({ ...policy, approvalId: " " }), JSON.stringify({ ...policy, categories: { messages: 0 } }), JSON.stringify({ ...policy, categories: { messages: 1.5 } }), JSON.stringify({ ...policy, messageMedia: "keep" })])("rejects invalid policies", (json) => {
    vi.stubEnv("CONTENT_RETENTION_POLICY_JSON", json);
    expect(getContentRetentionPolicy()).toBeNull();
  });
  it.each(["sms", "web_chat", "dashboard"] as const)("assigns expiry on the real %s message creation path", async (channel) => {
    await appendMessage(context, { businessId: "business", conversationId: "conversation", body: "test", direction: "inbound", channel });
    expect(inserts.find((entry) => entry.table === messages)?.values.contentExpiresAt).toEqual(new Date("2030-01-03T00:00:00Z"));
  });
  it("leaves production-created messages and transcripts unexpired without approval", async () => {
    vi.stubEnv("CONTENT_RETENTION_POLICY_JSON", "{}");
    await appendMessage(context, { businessId: "business", conversationId: "conversation", body: "test", direction: "outbound", channel: "sms" });
    await upsertTranscript(context, { businessId: "business", callId: "call", sequence: 1, speaker: "caller", text: "test", final: false });
    expect(inserts.find((entry) => entry.table === messages)?.values.contentExpiresAt).toBeNull();
    expect(inserts.find((entry) => entry.table === transcripts)?.values.expiresAt).toBeNull();
    await receiveInboundSms(context, { businessId: "business", providerMessageId: "provider", from: "+10000000000", to: "+10000000001", body: "HELP", payload: {} });
    expect(inserts.filter((entry) => entry.table === messages).map((entry) => entry.values.contentExpiresAt)).toEqual([null, null, null]);
  });
  it("assigns inbound and compliance reply expiry in the SMS production path", async () => {
    await receiveInboundSms(context, { businessId: "business", providerMessageId: "provider", from: "+10000000000", to: "+10000000001", body: "HELP", payload: {} });
    const rows = inserts.filter((entry) => entry.table === messages);
    expect(rows).toHaveLength(2);
    expect(rows.map((entry) => entry.values.contentExpiresAt)).toEqual([new Date("2030-01-03T00:00:00Z"), new Date("2030-01-03T00:00:00Z")]);
  });
  it.each([null, new Date("2029-12-31T00:00:00Z"), new Date("2030-02-01T00:00:00Z")])("preserves existing transcript expiry %s on conflict", async (expiry) => {
    await upsertTranscript(context, { businessId: "business", callId: "call", sequence: 1, speaker: "caller", text: "revised", final: true });
    const entry = inserts.find((row) => row.table === transcripts)!;
    expect(entry.values.expiresAt).toEqual(new Date("2030-01-04T00:00:00Z"));
    expect(entry.conflict).not.toHaveProperty("expiresAt");
    expect({ expiresAt: expiry, ...entry.conflict }).toMatchObject({ expiresAt: expiry, text: "revised", final: true });
  });
  it("does not assign omitted categories", () => {
    vi.stubEnv("CONTENT_RETENTION_POLICY_JSON", JSON.stringify({ ...policy, categories: { transcripts: 3 } }));
    expect(contentExpiry("messages")).toBeNull();
  });
  it("scrubs body and media together and resets the expiry marker", async () => {
    await scrubExpiredMessageContent(context, { businessId: "business" });
    expect(updates[0]?.values).toMatchObject({ body: "[content expired]", media: null, contentExpiresAt: null });
    const query = new PgDialect().sqlToQuery(updates[0]!.where!);
    expect(query.sql).toContain('"messages"."business_id"');
    expect(query.sql).toContain('"messages"."content_expires_at" <');
  });
  it("keeps new retention disabled while existing follow-up and notification sweeps still run", async () => {
    vi.stubEnv("CONTENT_RETENTION_ENABLED", "false");
    expect(await scrubExpiredMessageContent(context, { businessId: "business" })).toBe(0);
    expect(await deleteTranscriptForRetention(context, { businessId: "business", callId: "call" })).toBe(0);
    const result = await runPrivacyRetentionSweep(context, { businessId: "business", now });
    expect(result).toMatchObject({ scrubbedMessages: 0, deletedTranscripts: 0, scrubbedFollowUps: 1, scrubbedOperatorDeliveries: 1 });
    expect(updates.some((entry) => entry.table === messages)).toBe(false);
    expect(deletes).toHaveLength(0);
  });
  it("requires an expired timestamp for queued transcript retention jobs", async () => {
    await deleteTranscriptForRetention(context, { businessId: "business", callId: "call" });
    const query = new PgDialect().sqlToQuery(deletes[0]!.where!);
    expect(query.sql).toContain('"transcripts"."expires_at" is not null');
    expect(query.sql).toContain('"transcripts"."expires_at" <');
  });
  it("uses the same media scrub in the scheduled sweep", async () => {
    const result = await runPrivacyRetentionSweep(context, { businessId: "business", now });
    expect(result).toMatchObject({ scrubbedMessages: 1, deletedTranscripts: 1 });
    expect(updates.find((entry) => entry.table === messages)?.values).toMatchObject({ body: "[content expired]", media: null, contentExpiresAt: null });
    expect(mocks.enqueue).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ topic: "realtime.publish", payload: expect.objectContaining({ deleted: true }) }));
  });
});
