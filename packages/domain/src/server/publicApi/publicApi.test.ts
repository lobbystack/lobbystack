import { createHmac } from "node:crypto";

import { apiAppointmentSchema, apiCallSchema, apiContactSchema, apiMessageSchema, WEBHOOK_MAX_ATTEMPTS, WEBHOOK_RETRY_DELAYS_SECONDS } from "@lobbystack/shared";
import { describe, expect, it } from "vitest";

import { apiKeyPepper, bearerToken, generateApiKey, hashApiKey, isWellFormedApiKey, normalizeScopes } from "./apiKeys";
import { idempotencyRequestHash, validateIdempotencyKey } from "./idempotency";
import { decodeCursor, encodeCursor, pageSize, serializeAppointment, serializeCall, serializeContact, serializeMessage, toPage } from "./resources";
import { webhookRetryDelaySeconds } from "./webhooks";

describe("API keys", () => {
  it("generates lsk_ keys with a visible prefix and stores only a hash", () => {
    const generated = generateApiKey();
    expect(generated.key).toMatch(/^lsk_[0-9a-f]{8}_[A-Za-z0-9_-]{32}$/);
    expect(generated.key.startsWith(`${generated.prefix}_`)).toBe(true);
    expect(generated.keyHash).toBe(hashApiKey(generated.key));
    expect(generated.keyHash).not.toContain(generated.key.slice(13));
    expect(isWellFormedApiKey(generated.key)).toBe(true);
    expect(generateApiKey().key).not.toBe(generated.key);
  });

  it("hashes keys with HMAC-SHA256 under a pepper derived from ENCRYPTION_KEY", () => {
    const { key } = generateApiKey();
    const pepperA = apiKeyPepper({ ENCRYPTION_KEY: "secret-a" });
    const pepperB = apiKeyPepper({ ENCRYPTION_KEY: "secret-b" });
    expect(hashApiKey(key, pepperA)).toBe(createHmac("sha256", pepperA).update(key).digest("hex"));
    expect(hashApiKey(key, pepperA)).not.toBe(hashApiKey(key, pepperB));
    expect(() => apiKeyPepper({ NODE_ENV: "production" })).toThrow(/ENCRYPTION_KEY/);
  });

  it("reads only Bearer authorization headers", () => {
    expect(bearerToken("Bearer lsk_abc")).toBe("lsk_abc");
    expect(bearerToken("bearer   lsk_abc ")).toBe("lsk_abc");
    expect(bearerToken("Basic abc")).toBeNull();
    expect(bearerToken("Bearer a b")).toBeNull();
    expect(bearerToken(null)).toBeNull();
  });

  it("accepts known scopes only and keeps a canonical order", () => {
    expect(normalizeScopes(["contacts:write", "calls:read", "calls:read"])).toEqual(["calls:read", "contacts:write"]);
    expect(() => normalizeScopes([])).toThrow(/at least one/);
    expect(() => normalizeScopes(["calls:write"])).toThrow(/Unknown scopes/);
  });
});

describe("cursor pagination", () => {
  it("round-trips an opaque cursor", () => {
    const at = new Date("2026-09-01T12:00:00.123Z");
    const id = "5d0bd9a4-7e1c-4a51-9a50-8e1b2c3d4e5f";
    expect(decodeCursor(encodeCursor({ at, id }))).toEqual({ at, id });
    expect(() => decodeCursor("not-a-cursor")).toThrow(/cursor is invalid/);
  });

  it("validates limit", () => {
    expect(pageSize(undefined)).toBe(25);
    expect(pageSize(100)).toBe(100);
    expect(() => pageSize(0)).toThrow();
    expect(() => pageSize(101)).toThrow();
  });

  it("returns next_cursor only when more rows exist", () => {
    const rows = [1, 2, 3].map((n) => ({ id: `00000000-0000-4000-8000-00000000000${n}`, at: new Date(n * 1000) }));
    const first = toPage(rows, 2, (row) => row.id, (row) => row);
    expect(first).toMatchObject({ data: [rows[0]!.id, rows[1]!.id], has_more: true });
    expect(decodeCursor(first.next_cursor!)).toEqual({ at: rows[1]!.at, id: rows[1]!.id });
    expect(toPage(rows.slice(0, 2), 2, (row) => row.id, (row) => row)).toEqual({ data: [rows[0]!.id, rows[1]!.id], next_cursor: null, has_more: false });
  });
});

describe("v1 resource serializers match the published schemas", () => {
  const now = new Date("2026-09-27T15:00:00.000Z");
  it("serializes calls", () => {
    const call = serializeCall({ id: "5d0bd9a4-7e1c-4a51-9a50-8e1b2c3d4e5f", transport: "web_voice", disposition: "caller_hangup", startedAt: now, endedAt: new Date(now.getTime() + 95_000), createdAt: now, providerDurationSeconds: null, contactId: null, contactName: null, contactPhone: null, conversationSummary: null, currentIntent: null, persistedOutcome: { kind: "booked", serviceName: "Cut", startsAt: now.toISOString() }, recordingObjectId: null, recordingStatus: null, recordingRetentionUntil: null });
    expect(apiCallSchema.parse(call)).toEqual(call);
    expect(call).toMatchObject({ channel: "web", status: "completed", outcome: "appointment_booked", duration_seconds: 95, recording_available: false });
  });

  it("serializes appointments with the public status names", () => {
    const appointment = serializeAppointment({ id: "5d0bd9a4-7e1c-4a51-9a50-8e1b2c3d4e5f", status: "canceled", startsAt: now, endsAt: now, timezone: "America/Toronto", serviceId: "5d0bd9a4-7e1c-4a51-9a50-8e1b2c3d4e5e", serviceName: "Cut", staffId: "5d0bd9a4-7e1c-4a51-9a50-8e1b2c3d4e5d", staffName: "Sam", contactId: "5d0bd9a4-7e1c-4a51-9a50-8e1b2c3d4e5c", contactName: null, contactPhone: "+14165550134", sourceChannel: "api", calendarSyncState: "weird", createdAt: now, updatedAt: now });
    expect(apiAppointmentSchema.parse(appointment)).toEqual(appointment);
    expect(appointment).toMatchObject({ status: "cancelled", calendar_sync_status: "pending" });
  });

  it("serializes contacts", () => {
    const contact = serializeContact({ id: "5d0bd9a4-7e1c-4a51-9a50-8e1b2c3d4e5f", name: "Ada", phone: "+14165550134", email: null, preferredLocale: "fr", timezone: null, createdAt: now, updatedAt: now });
    expect(apiContactSchema.parse(contact)).toEqual(contact);
  });

  it("withholds expired message content", () => {
    const base = { id: "5d0bd9a4-7e1c-4a51-9a50-8e1b2c3d4e5f", status: "open", title: "Voice message from Ada", body: "Call me", metadata: { callerName: "Ada", callbackPhone: "+14165550134", urgency: "urgent", channel: "voice" }, relatedCallId: null, createdAt: now, updatedAt: now };
    const message = serializeMessage({ ...base, expired: false });
    expect(apiMessageSchema.parse(message)).toEqual(message);
    expect(message).toMatchObject({ caller_name: "Ada", urgency: "urgent", channel: "voice" });
    const expired = serializeMessage({ ...base, expired: true });
    expect(expired).toMatchObject({ caller_name: null, callback_phone: null, body: "[Expired by the retention policy]" });
  });
});

describe("webhook retries", () => {
  it("retries with growing delays over about a day", () => {
    const delays = Array.from({ length: WEBHOOK_MAX_ATTEMPTS }, (_, index) => webhookRetryDelaySeconds(index + 1));
    expect(delays.at(-1)).toBeNull();
    const scheduled = delays.filter((value): value is number => value !== null);
    expect(scheduled).toEqual([...WEBHOOK_RETRY_DELAYS_SECONDS]);
    for (let index = 1; index < scheduled.length; index += 1) expect(scheduled[index]!).toBeGreaterThan(scheduled[index - 1]!);
    const total = scheduled.reduce((sum, value) => sum + value, 0);
    expect(total).toBeGreaterThan(20 * 3600);
    expect(total).toBeLessThan(26 * 3600);
  });
});

describe("idempotency keys", () => {
  it("accepts printable keys up to 255 characters", () => {
    expect(validateIdempotencyKey(null)).toBeNull();
    expect(validateIdempotencyKey(" abc-123 ")).toBe("abc-123");
    expect(() => validateIdempotencyKey("x".repeat(256))).toThrow();
    expect(() => validateIdempotencyKey("has space")).toThrow();
    expect(idempotencyRequestHash("{\"a\":1}")).not.toBe(idempotencyRequestHash("{\"a\":2}"));
  });
});
