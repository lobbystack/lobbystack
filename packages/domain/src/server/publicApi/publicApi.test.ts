import { createHmac } from "node:crypto";

import { apiAppointmentSchema, apiCalendarConnectionSchema, apiCallSchema, apiNotificationEvents, apiNotificationPreferencesSchema, apiContactSchema, apiKnowledgeEntrySchema, apiKnowledgeSourceSchema, apiMessageSchema, apiPhoneNumberClaimSchema, apiPhoneNumberSchema, apiWidgetKeySchema, normalizeWidgetOrigin, WEBHOOK_MAX_ATTEMPTS, WEBHOOK_RETRY_DELAYS_SECONDS, widgetEmbedSnippet } from "@lobbystack/shared";
import { describe, expect, it } from "vitest";

import { KnowledgeStorageLimitError } from "../knowledge";
import { defaultOperatorNotificationEventPreferences, operatorNotificationEventKeys, type NotificationPreferences } from "../notifications";
import { offerBusinessNumbers } from "../phoneNumbers";
import { apiKeyPepper, bearerToken, generateApiKey, hashApiKey, isWellFormedApiKey, normalizeScopes } from "./apiKeys";
import { idempotencyRequestHash, validateIdempotencyKey } from "./idempotency";
import { PublicApiError } from "./errors";
import { apiErrorFromDomain, claimPhoneNumberForApi } from "./operations";
import { decodeCursor, encodeCursor, notificationEventKeys, pageSize, serializeAppointment, serializeCalendarConnection, serializeCall, serializeNotificationPreferences, serializeContact, serializeKnowledgeEntry, serializeKnowledgeSource, serializeMessage, serializePhoneNumber, serializePhoneNumberClaim, serializeWidgetKey, toPage } from "./resources";
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

  it("keeps platform-only scopes off per-business keys", () => {
    expect(() => normalizeScopes(["business:read", "businesses:create"])).toThrow(/Only platform keys can hold businesses:create/);
    expect(() => normalizeScopes(["users:create"])).toThrow(/Only platform keys/);
    expect(normalizeScopes(["phone_numbers:manage", "knowledge:read"])).toEqual(["knowledge:read", "phone_numbers:manage"]);
  });
});

describe("knowledge sources", () => {
  const at = new Date("2026-10-11T12:00:00.000Z");
  const row = { id: "06d9c0dc-f18a-4cc6-a987-ac4963c87113", title: "Price list", sourceType: "upload", sourceUrl: null, status: "pending", error: null, active: true, createdAt: at, updatedAt: at, jobId: null, pageLimit: null };

  it("serializes files, websites and the pages their crawls read to the published schema", () => {
    const file = serializeKnowledgeSource(row);
    expect(file).toMatchObject({ type: "file", url: null, status: "pending", page_limit: null });
    expect(apiKnowledgeSourceSchema.safeParse(file).success).toBe(true);
    const website = serializeKnowledgeSource({ ...row, sourceType: "website", sourceUrl: "https://maple.example/", status: "error", error: "The site timed out.", jobId: "7a1c2e9d-3b4f-4d8a-9c6e-1f2a3b4c5d6e", pageLimit: 10 });
    expect(website).toMatchObject({ type: "website", url: "https://maple.example/", status: "error", error: "The site timed out.", page_limit: 10 });
    expect(apiKnowledgeSourceSchema.safeParse(website).success).toBe(true);
    // A page has no crawl job of its own.
    const page = serializeKnowledgeSource({ ...row, sourceType: "website", sourceUrl: "https://maple.example/about", status: "indexed" });
    expect(page).toMatchObject({ type: "page", url: "https://maple.example/about", page_limit: null });
    expect(apiKnowledgeSourceSchema.safeParse(page).success).toBe(true);
  });

  it("shows an FAQ's type instead of the tag that marks it", () => {
    const snippet = { id: row.id, title: "Do you park?", content: "Behind the building.", tags: ["faq", "parking"], priority: 2, active: false, createdAt: at, updatedAt: at };
    const faq = serializeKnowledgeEntry(snippet);
    expect(faq).toEqual({ id: row.id, type: "faq", title: "Do you park?", content: "Behind the building.", tags: ["parking"], priority: 2, active: false, created_at: at.toISOString(), updated_at: at.toISOString() });
    expect(apiKnowledgeEntrySchema.safeParse(faq).success).toBe(true);
    expect(serializeKnowledgeEntry({ ...snippet, tags: [] }).type).toBe("text");
  });

  it("shows an error only for a failed source, and an unknown status as still processing", () => {
    expect(serializeKnowledgeSource({ ...row, status: "cancelled", error: "Cancelled by operator." }).error).toBeNull();
    expect(serializeKnowledgeSource({ ...row, status: "queued" }).status).toBe("processing");
  });

  it("gives the domain's status-carrying errors their v1 codes", () => {
    expect(apiErrorFromDomain(Object.assign(new Error("Website URL must use a public hostname."), { status: 422, code: "website_url_invalid" }), "Knowledge source")).toMatchObject({ status: 400, code: "invalid_request", details: [{ path: "url" }] });
    expect(apiErrorFromDomain(Object.assign(new Error("Knowledge document not found."), { status: 404 }), "Knowledge source")).toMatchObject({ status: 404, code: "not_found", message: "Knowledge source not found." });
    expect(apiErrorFromDomain(Object.assign(new Error("Only a processing knowledge document can be cancelled."), { status: 409 }), "Knowledge source")).toMatchObject({ status: 409, code: "conflict" });
    expect(apiErrorFromDomain(Object.assign(new Error("Only a website import can be read further."), { status: 400 }), "Knowledge source")).toMatchObject({ status: 400, code: "invalid_request" });
    // A full plan has its own code, so clients don't retry it like a file that hasn't arrived.
    expect(apiErrorFromDomain(new KnowledgeStorageLimitError(1024 * 1024), "Upload")).toMatchObject({ status: 409, code: "plan_limit_reached", message: "Knowledge storage limit reached. 1 MB of text is included on this plan." });
    const crash = new Error("connection refused");
    expect(apiErrorFromDomain(crash, "Knowledge source")).toBe(crash);
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

  it("serializes contacts with whether they have a keypad PIN", () => {
    const row = { id: "5d0bd9a4-7e1c-4a51-9a50-8e1b2c3d4e5f", name: "Ada", phone: "+14165550134", email: null, preferredLocale: "fr", timezone: null, createdAt: now, updatedAt: now };
    const contact = serializeContact(row, null);
    expect(apiContactSchema.parse(contact)).toEqual(contact);
    expect(contact.passcode).toBeNull();
    const locked = serializeContact(row, { setAt: now, lockedAt: now });
    expect(apiContactSchema.parse(locked)).toEqual(locked);
    expect(locked.passcode).toEqual({ set_at: now.toISOString(), locked: true });
    expect(serializeContact(row, { setAt: now, lockedAt: null }).passcode).toEqual({ set_at: now.toISOString(), locked: false });
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

describe("phone numbers", () => {
  const now = new Date("2026-10-11T12:00:00.000Z");
  const businessId = "5d0bd9a4-7e1c-4a51-9a50-8e1b2c3d4e5f";
  const userId = "6a1f0c2d-8e3b-4c5d-9e6f-7a8b9c0d1e2f";
  const secret = "number-claim-test-secret";
  const caller = { businessId, apiKeyId: "0b7c1d2e-3f40-4a51-8b62-7c83d94ea5b6" };
  // These checks refuse before any query, so the database is never reached.
  const context = { db: {} as never };
  const provider = { listAvailablePhoneNumbers: async () => [{ phoneE164: "+14165550123", countryCode: "CA", capabilities: { sms: true, voice: true } }] };
  const tokenFor = async (input: { businessId?: string; userId?: string; purpose?: "onboarding" | "replacement" } = {}) => (await offerBusinessNumbers({ businessId: input.businessId ?? businessId, userId: input.userId ?? userId, purpose: input.purpose ?? "onboarding", eligibility: { market: { countryCode: "CA", source: "selection" }, trial: undefined, countryFixed: false, smsRequired: false }, claimTokenSecret: secret }, provider))[0]!.claimToken;
  async function refusal(offerToken: string, replaces?: string) {
    const error = await claimPhoneNumberForApi(context, caller, { offerToken, replaces }, { userId, claimTokenSecret: secret }).then(() => null, (value: unknown) => value);
    expect(error).toBeInstanceOf(PublicApiError);
    return error as PublicApiError;
  }

  it("refuses an offer that is forged, for another business or account, or the wrong kind", async () => {
    expect(await refusal("not-a-token")).toMatchObject({ status: 400, message: "The offer is invalid or has expired. Search again." });
    expect(await refusal(await tokenFor({ businessId: "8c2b7f4e-1d3a-4e5b-9c6d-0e1f2a3b4c5d" }))).toMatchObject({ status: 400, message: expect.stringContaining("another business or account") });
    expect(await refusal(await tokenFor({ userId: "8c2b7f4e-1d3a-4e5b-9c6d-0e1f2a3b4c5d" }))).toMatchObject({ status: 400, message: expect.stringContaining("another business or account") });
    expect(await refusal(await tokenFor({ purpose: "replacement" }))).toMatchObject({ status: 400, message: expect.stringContaining("POST /phone-numbers/{phone_number_id}/replace") });
    expect(await refusal(await tokenFor(), "8c2b7f4e-1d3a-4e5b-9c6d-0e1f2a3b4c5d")).toMatchObject({ status: 400, message: expect.stringContaining("POST /phone-numbers/claims") });
  });

  it("names the worker's reclaim steps for what they do", () => {
    const row = { id: businessId, e164: "+14165550123", reclaimScheduledAt: null, createdAt: now, updatedAt: now };
    const active = serializePhoneNumber({ ...row, status: "active" });
    expect(apiPhoneNumberSchema.parse(active)).toEqual(active);
    expect(serializePhoneNumber({ ...row, status: "reclaiming", reclaimScheduledAt: now })).toMatchObject({ status: "releasing", release_scheduled_at: now.toISOString() });
    expect(serializePhoneNumber({ ...row, status: "reclaimed" }).status).toBe("released");
  });

  it("shows a claim's progress, and any claim that ended without a number as failed", () => {
    const row = { id: businessId, requestedE164: "+14165550123", phoneNumberId: null, replacingPhoneNumberId: null, lastError: null, createdAt: now, updatedAt: now };
    const pending = serializePhoneNumberClaim({ ...row, status: "reserved" });
    expect(apiPhoneNumberClaimSchema.parse(pending)).toEqual(pending);
    expect(pending).toMatchObject({ status: "pending", error: null });
    expect(serializePhoneNumberClaim({ ...row, status: "provisioning" }).status).toBe("provisioning");
    expect(serializePhoneNumberClaim({ ...row, status: "claimed", phoneNumberId: userId })).toMatchObject({ status: "claimed", phone_number_id: userId });
    expect(serializePhoneNumberClaim({ ...row, status: "unavailable", lastError: "The selected number is no longer available." })).toMatchObject({ status: "failed", error: "The selected number is no longer available." });
    expect(serializePhoneNumberClaim({ ...row, status: "failed" })).toMatchObject({ status: "failed", error: "The number could not be claimed." });
  });
});

describe("notification preferences", () => {
  const preferences: NotificationPreferences = { emailEnabled: true, smsEnabled: false, smsConsent: false, eventPreferences: { ...defaultOperatorNotificationEventPreferences(), voiceMessage: { email: false, sms: false } }, dailySummaryEnabled: true, dailySummarySendTime: "08:30", canUseSms: true, smsUnavailableReason: null };

  it("names each alert the dashboard shows, and says why texts are off", () => {
    const settings = serializeNotificationPreferences(preferences);
    expect(apiNotificationPreferencesSchema.parse(settings)).toEqual(settings);
    expect(Object.keys(settings.events)).toEqual(apiNotificationEvents);
    expect(settings).toMatchObject({ email_enabled: true, sms_enabled: false, events: { voice_message: { email: false, sms: false }, text_message: { email: true, sms: false } }, daily_summary: { enabled: true, send_time: "08:30" }, sms: { available: false, unavailable_reason: "consent_required" } });
    expect(serializeNotificationPreferences({ ...preferences, smsConsent: true }).sms).toEqual({ available: true, unavailable_reason: null });
    expect(serializeNotificationPreferences({ ...preferences, smsConsent: true, canUseSms: false, smsUnavailableReason: "sender_missing" }).sms).toEqual({ available: false, unavailable_reason: "sender_missing" });
    // Each API name is one of the dashboard's events, and every event it shows has one.
    expect(Object.values(notificationEventKeys).every((key) => (operatorNotificationEventKeys as readonly string[]).includes(key))).toBe(true);
    expect(new Set(Object.values(notificationEventKeys))).toEqual(new Set(["voiceMessage", "pausedSms", "smsFailed", "calendarSync", "transferFailed", "widgetChat", "webhookDisabled"]));
  });
});

describe("calendar connections", () => {
  const row = { id: "5d0bd9a4-7e1c-4a51-9a50-8e1b2c3d4e5f", provider: "google", externalAccountId: "1234", staffId: null, selectedCalendarId: "main@example.com", status: "connected", lastSyncError: null, lastSyncedAt: new Date("2026-10-11T12:00:00.000Z"), createdAt: new Date("2026-10-10T12:00:00.000Z"), updatedAt: new Date("2026-10-11T12:30:00.000Z") };

  it("shows a connection in snake_case, and any state the dashboard flags as error", () => {
    const connection = serializeCalendarConnection(row);
    expect(apiCalendarConnectionSchema.parse(connection)).toEqual(connection);
    expect(connection).toEqual({ id: row.id, provider: "google", account_id: "1234", calendar_id: "main@example.com", staff_id: null, status: "connected", sync_error: null, last_synced_at: "2026-10-11T12:00:00.000Z", created_at: "2026-10-10T12:00:00.000Z", updated_at: "2026-10-11T12:30:00.000Z" });
    expect(serializeCalendarConnection({ ...row, status: "syncing", lastSyncedAt: null })).toMatchObject({ status: "syncing", last_synced_at: null });
    expect(serializeCalendarConnection({ ...row, status: "expired", lastSyncError: "Google Calendar authorization requires reconnection." })).toMatchObject({ status: "error", sync_error: "Google Calendar authorization requires reconnection." });
  });
});

describe("widget keys", () => {
  const now = new Date("2026-10-11T12:00:00.000Z");
  const row = { id: "5d0bd9a4-7e1c-4a51-9a50-8e1b2c3d4e5f", label: null, status: "active", allowedOrigins: ["https://example.com/", "shop.example.com "], lastUsedAt: null, createdAt: now };

  it("shows the dashboard's configuration in snake_case, with the defaults the widget falls back to", () => {
    const plain = serializeWidgetKey({ ...row, config: {} });
    expect(apiWidgetKeySchema.parse(plain)).toEqual(plain);
    expect(plain).toMatchObject({ allowed_origins: ["https://example.com", "https://shop.example.com"], config: { position: "bottom-right", title: "", lead_form: { enabled: false, require_phone: false, require_email: false, show_before_chat: false } } });
    const styled = serializeWidgetKey({ ...row, status: "weird", config: { color: "#112233", localeOverride: "sr", leadForm: { enabled: true, requireEmail: true } } });
    expect(styled).toMatchObject({ status: "active", config: { color: "#112233", locale: "sr", lead_form: { enabled: true, require_phone: false, require_email: true, show_before_chat: false } } });
  });

  it("keeps an origin's scheme, host and port, and reads a bare host as https", () => {
    expect(normalizeWidgetOrigin("https://Example.com/contact/")).toBe("https://example.com");
    expect(normalizeWidgetOrigin("http://localhost:3000/")).toBe("http://localhost:3000");
    expect(normalizeWidgetOrigin(" Example.com ")).toBe("https://example.com");
    expect(normalizeWidgetOrigin("localhost:3000")).toBe("https://localhost:3000");
    expect(normalizeWidgetOrigin("null")).toBe("null");
  });

  it("builds the script tag the dashboard shows, which names the key so the loader brings the saved look", () => {
    expect(widgetEmbedSnippet("https://app.example.com", "wk_live_x")).toBe('<script src="https://app.example.com/embed.js?key=wk_live_x" data-widget-key="wk_live_x" defer></script>');
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

describe("idempotency request hashes", () => {
  it("adds the path only for an operation on one resource", () => {
    const body = "{\"offer_token\":\"signed\"}";
    expect(idempotencyRequestHash(body, undefined)).toBe(idempotencyRequestHash(body));
    expect(idempotencyRequestHash(body, "/api/v1/phone-numbers/a/replace")).not.toBe(idempotencyRequestHash(body, "/api/v1/phone-numbers/b/replace"));
    expect(idempotencyRequestHash(" { \"offer_token\": \"signed\" } ", "/api/v1/phone-numbers/a/replace")).toBe(idempotencyRequestHash(body, "/api/v1/phone-numbers/a/replace"));
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

  it("hashes a body by its JSON value, so REST text and MCP arguments match", () => {
    const rest = "{\n  \"starts_at\": \"2026-09-29T13:00:00Z\", \"service_id\": \"x\" }";
    expect(idempotencyRequestHash(rest)).toBe(idempotencyRequestHash({ service_id: "x", starts_at: "2026-09-29T13:00:00Z" }));
    expect(idempotencyRequestHash({ a: 1, b: undefined })).toBe(idempotencyRequestHash({ a: 1 }));
    expect(idempotencyRequestHash({ a: [1, 2] })).not.toBe(idempotencyRequestHash({ a: [2, 1] }));
    expect(idempotencyRequestHash("not json")).not.toBe(idempotencyRequestHash("not json either"));
    expect(idempotencyRequestHash("not json")).not.toBe(idempotencyRequestHash({ raw: "x" }));
  });
});
