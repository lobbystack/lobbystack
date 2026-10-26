import { createHash, randomUUID } from "node:crypto";

import { and, eq, inArray, sql } from "drizzle-orm";
import { DateTime } from "luxon";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { agentRules, apiKeys, appointments, auditLogs, billingAccounts, billingCheckoutRequests, businesses, businessHours, businessMemberships, calendarBusyBlocks, calendarConnections, calls, contacts, conversations, createDatabaseClient, idempotencyKeys, inboxItems, knowledgeChunks, knowledgeDocuments, knowledgeSnippets, numberTrials, onboardingNumberClaimEvents, onboardingPhoneVerifications, operatorNotificationDeliveries, operatorNotificationPreferences, outboxMessages, phoneNumbers, platformKeyBusinesses, receptionistProfiles, services, staff, staffServiceAssignments, storageObjects, users, webhookDeliveries, webhookDeliveryAttempts, webhookEndpoints, webhookEvents, websiteIngestionJobs, widgetKeys } from "@lobbystack/db";
import { apiAppointmentSchema, apiBillingSchema, apiBusinessSchema, apiCalendarConnectionSchema, apiCallSchema, apiCheckoutSchema, apiKnowledgeEntrySchema, apiKnowledgeSourceSchema, apiNotificationPreferencesSchema, apiOnboardingSchema, apiPhoneNumberClaimSchema, apiPhoneNumberOfferSchema, apiPhoneNumberSchema, apiReceptionistSchema, apiRuleSchema, apiServiceSchema, apiStaffSchema, apiTeamSchema, apiWidgetKeyCreatedSchema, defaultGreeting, OPERATOR_SMS_DISCLOSURE_VERSION, WEBHOOK_MAX_ATTEMPTS } from "@lobbystack/shared";

import { finalizeConversationSession } from "../conversations";
import { FULL_CRAWL_PAGE_LIMIT, ONBOARDING_CRAWL_PAGE_LIMIT } from "../knowledge";
import { defaultOperatorNotificationEventPreferences, getNotificationPreferences, setNotificationPreferences } from "../notifications";
import { claimNumberProvisioning, completeNumberProvisioning, failNumberProvisioning } from "../phoneNumbers";
import { acceptInvitation } from "../tenancy";
import { createVoiceFollowUpTask } from "../voice";
import { generateApiKey, resolveApiKey, revokeApiKey } from "./apiKeys";
import { runIdempotent } from "./idempotency";
import { cancelAppointmentForApi, cancelKnowledgeSourceForApi, claimPhoneNumberForApi, completeKnowledgeUploadForApi, completeOnboardingForApi, createAppointmentForApi, createCalendarConnectLinkForApi, createCheckoutForApi, createClaimLinkForApi, createContactForApi, createKnowledgeEntryForApi, createKnowledgeSourceForApi, createKnowledgeUploadForApi, createRuleForApi, createServiceForApi, createTeamInvitationForApi, createWidgetKeyForApi, deleteCalendarConnectionForApi, deleteKnowledgeEntryForApi, deleteKnowledgeSourceForApi, deleteRuleForApi, deleteServiceForApi, endManagedPlanForApi, expandKnowledgeSourceForApi, getAvailabilityForApi, getBillingForApi, getCheckoutForApi, getContactForApi, getKnowledgeEntryForApi, getKnowledgeSourceForApi, getMeForApi, getNotificationPreferencesForApi, getOnboardingForApi, getPhoneNumberClaimForApi, getReceptionistForApi, getTeamForApi, listAccountCalendarsForApi, listAppointmentsForApi, listBusinessesForApi, listCalendarConnectionsForApi, listContactsForApi, listKnowledgeEntriesForApi, listKnowledgeSourcesForApi, listPhoneNumbersForApi, listRulesForApi, listServicesForApi, listStaffForApi, listWidgetKeysForApi, releasePhoneNumberForApi, removeTeamMemberForApi, reorderRulesForApi, rescheduleAppointmentForApi, retryKnowledgeSourceForApi, revokeTeamInvitationForApi, searchPhoneNumbersForApi, setManagedPlanForApi, updateBillingForApi, updateBusinessForApi, updateCalendarConnectionForApi, updateContactForApi, updateKnowledgeEntryForApi, updateKnowledgeSourceForApi, updateNotificationPreferencesForApi, updateOnboardingForApi, updateReceptionistForApi, updateRuleForApi, updateServiceForApi, updateTeamMemberForApi, updateWidgetKeyForApi, type ApiCaller, type ApiKeyCaller, type PlatformKeyCaller } from "./operations";
import { PublicApiError } from "./errors";
import { requirePlatformBusinessAccess } from "./platformKeys";
import { createWebhookEndpoint, deleteWebhookEndpoint, disableRemovedPlatformKeyWebhooks, processWebhookDelivery, pruneApiHistory, rotateWebhookSecret, updateWebhookEndpoint, type WebhookManager } from "./webhooks";
import { encryptWebhookSecret } from "./webhookTransport";

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
// A real lobbystack_worker login (optional) also exercises the owner-alert resolver, which checks session_user.
const workerLoginUrl = process.env.LOBBYSTACK_PUBLIC_API_TEST_WORKER_DATABASE_URL;
const worker = testUrl ? createDatabaseClient("lobbystack_worker", { DATABASE_URL: workerLoginUrl ?? roleUrl("lobbystack_worker") }) : undefined;
const app = testUrl ? createDatabaseClient("lobbystack_app", { DATABASE_URL: roleUrl("lobbystack_app") }) : undefined;

type Fixture = { businessId: string; serviceId: string; staffId: string; caller: ApiKeyCaller; key: string };
let a: Fixture;
let b: Fixture;
let ownerId: string;

async function createFixture(label: string): Promise<Fixture> {
  const businessId = randomUUID();
  await admin!.db.insert(businesses).values({ id: businessId, slug: `api-${label}-${businessId}`, name: `API ${label}`, timezone: "UTC", businessType: "test" });
  await admin!.db.insert(receptionistProfiles).values({ businessId, greeting: "Hi", tone: "warm", summary: label, bookingPolicy: "Book", transferMode: "never", bookingMode: "instant" });
  const [member] = await admin!.db.insert(staff).values({ businessId, name: "Sam", timezone: "UTC" }).returning({ id: staff.id });
  const [service] = await admin!.db.insert(services).values({ businessId, name: "Cut", slug: "cut", durationMinutes: 30 }).returning({ id: services.id });
  await admin!.db.insert(businessHours).values(Array.from({ length: 7 }, (_, dayOfWeek) => ({ businessId, dayOfWeek, openMinutes: 8 * 60, closeMinutes: 20 * 60 })));
  const generated = generateApiKey();
  const [apiKey] = await admin!.db.insert(apiKeys).values({ businessId, name: label, prefix: generated.prefix, keyHash: generated.keyHash, scopes: ["contacts:read", "contacts:write", "appointments:write"] }).returning({ id: apiKeys.id });
  return { businessId, serviceId: service!.id, staffId: member!.id, caller: { businessId, apiKeyId: apiKey!.id }, key: generated.key };
}

function tomorrowAt(hour: number): string {
  return DateTime.utc().plus({ days: 2 }).set({ hour, minute: 0, second: 0, millisecond: 0 }).toISO()!;
}

const numberClaimSecret = "number-claim-test-secret";

/** A random Toronto number for one test, so tests running at once never share one. */
function testNumber(not?: string): string {
  for (;;) {
    const candidate = `+1416${String(Math.floor(Math.random() * 10_000_000)).padStart(7, "0")}`;
    if (candidate !== not) return candidate;
  }
}

async function expectApiError(promise: Promise<unknown>, status: number, code: string) {
  const error = await promise.then(() => null, (value: unknown) => value);
  expect(error).toBeInstanceOf(PublicApiError);
  expect(error).toMatchObject({ status, code });
}

describe.skipIf(!testUrl)("public API against PostgreSQL with RLS", () => {
  beforeAll(async () => {
    a = await createFixture("a");
    b = await createFixture("b");
    ownerId = randomUUID();
    await admin!.db.insert(users).values({ id: ownerId, email: `${ownerId}@example.invalid`, normalizedEmail: `${ownerId}@example.invalid` });
    await admin!.db.insert(businessMemberships).values({ businessId: a.businessId, userId: ownerId, role: "business_owner" });
  });

  afterAll(async () => {
    if (a && b) {
      const ids = [a.businessId, b.businessId];
      await admin!.db.delete(outboxMessages).where(inArray(outboxMessages.businessId, ids));
      await admin!.db.delete(appointments).where(inArray(appointments.businessId, ids));
      await admin!.db.delete(businesses).where(inArray(businesses.id, ids));
      await admin!.db.delete(users).where(eq(users.id, ownerId));
    }
    await Promise.all([admin?.pool.end(), worker?.pool.end(), app?.pool.end()]);
  });

  it("resolves a key to its own business and rejects revoked keys", async () => {
    expect(await resolveApiKey({ db: worker!.db }, a.key)).toMatchObject({ businessId: a.businessId, apiKeyId: a.caller.apiKeyId });
    expect(await resolveApiKey({ db: app!.db }, b.key)).toMatchObject({ businessId: b.businessId });
    // Change the last character; a fixed "x" would match the 1 in 64 keys that end in x.
    expect(await resolveApiKey({ db: worker!.db }, `${a.key.slice(0, -1)}${a.key.endsWith("x") ? "y" : "x"}`)).toBeNull();
    await admin!.db.update(apiKeys).set({ revokedAt: new Date() }).where(eq(apiKeys.id, b.caller.apiKeyId));
    expect(await resolveApiKey({ db: worker!.db }, b.key)).toBeNull();
    await admin!.db.update(apiKeys).set({ revokedAt: null }).where(eq(apiKeys.id, b.caller.apiKeyId));
  });

  it("never lets a key for business A read business B", async () => {
    const context = { db: worker!.db };
    const contactB = await createContactForApi(context, b.caller, { name: "Only in B", phone: "+14165550199" });
    await expectApiError(getContactForApi(context, a.caller, contactB.id), 404, "not_found");
    const pageA = await listContactsForApi(context, a.caller, { limit: 100 });
    expect(pageA.data.map((contact) => contact.id)).not.toContain(contactB.id);
    // RLS itself hides B's row from a transaction scoped to business A.
    const rows = await worker!.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.business_id', ${a.businessId}, true), set_config('app.actor_type', 'worker', true)`);
      return await tx.select({ id: contacts.id }).from(contacts).where(eq(contacts.id, contactB.id));
    });
    expect(rows).toEqual([]);
  });

  it("pages through contacts with a cursor without gaps or repeats", async () => {
    const context = { db: worker!.db };
    const created = [];
    for (let index = 0; index < 5; index += 1) created.push((await createContactForApi(context, a.caller, { name: `Page ${index}`, phone: `+1416555${String(1000 + index)}` })).id);
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await listContactsForApi(context, a.caller, { limit: 2, ...(cursor ? { cursor } : {}) });
      expect(page.data.length).toBeLessThanOrEqual(2);
      seen.push(...page.data.map((contact) => contact.id));
      cursor = page.next_cursor ?? undefined;
      expect(page.has_more).toBe(page.next_cursor !== null);
    } while (cursor);
    expect(new Set(seen).size).toBe(seen.length);
    for (const id of created) expect(seen).toContain(id);
  });

  it("rejects a duplicate phone number with 409", async () => {
    const context = { db: worker!.db };
    await createContactForApi(context, a.caller, { phone: "+14165552222" });
    await expectApiError(createContactForApi(context, a.caller, { phone: "+14165552222" }), 409, "conflict");
  });

  it("drops text consent when the API changes a contact's phone, but keeps an opt-out", async () => {
    const context = { db: worker!.db };
    const consentOf = async (id: string) => (await admin!.db.select({ status: contacts.smsConsentStatus }).from(contacts).where(eq(contacts.id, id)))[0]?.status;
    const consentDateOf = async (id: string) => (await admin!.db.select({ at: contacts.smsConsentUpdatedAt }).from(contacts).where(eq(contacts.id, id)))[0]?.at;
    const subscribed = await createContactForApi(context, a.caller, { phone: "+14165552300" });
    const optedOut = await createContactForApi(context, a.caller, { phone: "+14165552301" });
    await admin!.db.update(contacts).set({ smsConsentStatus: "subscribed" }).where(eq(contacts.id, subscribed.id));
    await admin!.db.update(contacts).set({ smsConsentStatus: "opted_out" }).where(eq(contacts.id, optedOut.id));
    // Same number or other fields: consent stays.
    await updateContactForApi(context, a.caller, subscribed.id, { name: "Kept", phone: "+14165552300" });
    expect(await consentOf(subscribed.id)).toBe("subscribed");
    expect(await consentDateOf(subscribed.id)).toBeNull();
    await updateContactForApi(context, a.caller, subscribed.id, { phone: "+14165552302" });
    expect(await consentOf(subscribed.id)).toBeNull();
    // Dated, so a reply can't count a text the old number sent.
    expect(await consentDateOf(subscribed.id)).toBeInstanceOf(Date);
    await updateContactForApi(context, a.caller, optedOut.id, { phone: "+14165552303" });
    expect(await consentOf(optedOut.id)).toBe("opted_out");
  });

  it("replays idempotent requests and rejects a reused key with a different body", async () => {
    const context = { db: worker!.db };
    const scope = { businessId: a.businessId, apiKeyId: a.caller.apiKeyId, operation: "createContact", key: `idem-${randomUUID()}` };
    const create = (transactional: typeof context) => createContactForApi(transactional, a.caller, { phone: "+14165551111" }).then((contact) => ({ status: 201, body: JSON.stringify({ data: contact }) }));
    const first = await runIdempotent(context, scope, "hash-1", create);
    expect(first.replayed).toBe(false);
    const again = await runIdempotent(context, scope, "hash-1", create);
    expect(again).toEqual({ replayed: true, response: first.response });
    await expectApiError(runIdempotent(context, scope, "hash-2", create), 422, "idempotency_key_reused");
    // The same key under another API key is independent.
    const other = await runIdempotent(context, { ...scope, businessId: b.businessId, apiKeyId: b.caller.apiKeyId }, "hash-2", async () => ({ status: 201, body: "{}" }));
    expect(other.replayed).toBe(false);
    expect(await admin!.db.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.businessId, a.businessId), eq(contacts.phone, "+14165551111")))).toHaveLength(1);
  });

  it("commits the mutation and the idempotency record together, so a failure after the mutation leaves no duplicate", async () => {
    const context = { db: worker!.db };
    const scope = { businessId: a.businessId, apiKeyId: a.caller.apiKeyId, operation: "createAppointment", key: `idem-${randomUUID()}` };
    const input = { service_id: a.serviceId, starts_at: tomorrowAt(16), contact_phone: "+14165551212" };
    const book = (transactional: typeof context) => createAppointmentForApi(transactional, a.caller, input).then((appointment) => ({ status: 201, body: JSON.stringify({ data: appointment }) }));
    // The process dies after the booking is written but before the response is stored.
    await expect(runIdempotent(context, scope, "hash", async (transactional) => {
      await book(transactional);
      throw new Error("crash after the mutation");
    })).rejects.toThrow("crash after the mutation");
    const appointmentsFor = async () => await admin!.db.select({ id: appointments.id }).from(appointments).innerJoin(contacts, eq(contacts.id, appointments.contactId)).where(and(eq(appointments.businessId, a.businessId), eq(contacts.phone, "+14165551212")));
    expect(await appointmentsFor()).toEqual([]);
    // The client retries with the same key: the booking happens once.
    const retry = await runIdempotent(context, scope, "hash", book);
    const replay = await runIdempotent(context, scope, "hash", book);
    expect(replay).toEqual({ replayed: true, response: retry.response });
    expect(await appointmentsFor()).toHaveLength(1);
    // Two concurrent requests with a fresh key also book once.
    const concurrentScope = { ...scope, key: `idem-${randomUUID()}` };
    const concurrentInput = { ...input, starts_at: tomorrowAt(17), contact_phone: "+14165551313" };
    const bookOther = (transactional: typeof context) => createAppointmentForApi(transactional, a.caller, concurrentInput).then((appointment) => ({ status: 201, body: JSON.stringify({ data: appointment }) }));
    const results = await Promise.all([runIdempotent(context, concurrentScope, "hash", bookOther), runIdempotent(context, concurrentScope, "hash", bookOther)]);
    expect(results.filter((result) => result.replayed)).toHaveLength(1);
    expect(await admin!.db.select({ id: appointments.id }).from(appointments).innerJoin(contacts, eq(contacts.id, appointments.contactId)).where(eq(contacts.phone, "+14165551313"))).toHaveLength(1);
  });

  it("books only in instant booking mode", async () => {
    const context = { db: worker!.db };
    const input = { service_id: a.serviceId, starts_at: tomorrowAt(10), contact_phone: "+14165553333", contact_name: "Booker" };
    await admin!.db.update(receptionistProfiles).set({ bookingMode: "request" }).where(eq(receptionistProfiles.businessId, a.businessId));
    await expectApiError(createAppointmentForApi(context, a.caller, input), 409, "booking_requires_confirmation");
    await admin!.db.update(receptionistProfiles).set({ bookingMode: "off" }).where(eq(receptionistProfiles.businessId, a.businessId));
    await expectApiError(createAppointmentForApi(context, a.caller, input), 409, "booking_disabled");
    expect(await admin!.db.select({ id: appointments.id }).from(appointments).innerJoin(contacts, eq(contacts.id, appointments.contactId)).where(and(eq(appointments.businessId, a.businessId), eq(contacts.phone, input.contact_phone)))).toEqual([]);
    await admin!.db.update(receptionistProfiles).set({ bookingMode: "instant" }).where(eq(receptionistProfiles.businessId, a.businessId));
    const appointment = await createAppointmentForApi(context, a.caller, input);
    expect(apiAppointmentSchema.parse(appointment)).toMatchObject({ status: "confirmed", source: "api", service_id: a.serviceId, contact_phone: "+14165553333" });
    const [calendarJob] = await admin!.db.select({ id: outboxMessages.id }).from(outboxMessages).where(and(eq(outboxMessages.businessId, a.businessId), eq(outboxMessages.topic, "calendar.syncAppointment"), eq(outboxMessages.aggregateId, appointment.id)));
    expect(calendarJob).toBeDefined();
    const [auditRow] = await admin!.db.select({ payload: auditLogs.payload }).from(auditLogs).where(and(eq(auditLogs.entityId, appointment.id), eq(auditLogs.eventType, "api.appointment.booked")));
    expect(auditRow?.payload).toMatchObject({ actor: "api_key", apiKeyId: a.caller.apiKeyId });
    await expectApiError(createAppointmentForApi(context, a.caller, { ...input, contact_phone: "+14165553334" }), 409, "slot_unavailable");
    const slots = await getAvailabilityForApi(context, a.caller, { serviceId: a.serviceId, startDate: tomorrowAt(10).slice(0, 10) });
    expect(slots.map((slot) => slot.starts_at)).not.toContain(new Date(input.starts_at).toISOString());
    expect(slots.length).toBeGreaterThan(0);
  });

  it("emits appointment and contact webhooks through the outbox in the booking transaction", async () => {
    const context = { db: worker!.db };
    const created = await createWebhookEndpoint({ db: app!.db }, { businessId: a.businessId, manager: { kind: "operator", userId: ownerId }, url: "https://hooks.example.com/lobbystack", events: ["appointment.booked", "appointment.cancelled", "appointment.rescheduled", "contact.created"] });
    const appointment = await createAppointmentForApi(context, a.caller, { service_id: a.serviceId, starts_at: tomorrowAt(12), contact_phone: "+14165554444" });
    const events = await admin!.db.select().from(webhookEvents).where(eq(webhookEvents.businessId, a.businessId));
    const booked = events.find((event) => event.type === "appointment.booked" && (event.payload.data as { id: string }).id === appointment.id);
    expect(booked?.payload).toMatchObject({ type: "appointment.booked", api_version: "v1", business_id: a.businessId, id: booked?.id });
    expect(booked?.payload.data).toEqual(appointment);
    expect(events.some((event) => event.type === "contact.created" && (event.payload.data as { phone: string }).phone === "+14165554444")).toBe(true);
    const [delivery] = await admin!.db.select().from(webhookDeliveries).where(and(eq(webhookDeliveries.eventId, booked!.id), eq(webhookDeliveries.endpointId, created.endpoint.id)));
    const [job] = await admin!.db.select().from(outboxMessages).where(and(eq(outboxMessages.topic, "webhook.deliver"), eq(outboxMessages.aggregateId, delivery!.id)));
    expect(job?.payload).toEqual({ deliveryId: delivery!.id, attempt: 1 });

    const moved = await rescheduleAppointmentForApi(context, a.caller, appointment.id, { starts_at: tomorrowAt(14) });
    expect(moved.starts_at).toBe(new Date(tomorrowAt(14)).toISOString());
    const cancelled = await cancelAppointmentForApi(context, a.caller, appointment.id);
    expect(cancelled.status).toBe("cancelled");
    expect((await cancelAppointmentForApi(context, a.caller, appointment.id)).status).toBe("cancelled");
    const types = (await admin!.db.select({ type: webhookEvents.type, payload: webhookEvents.payload }).from(webhookEvents).where(eq(webhookEvents.businessId, a.businessId))).filter((event) => (event.payload.data as { id: string }).id === appointment.id).map((event) => event.type);
    expect(types.sort()).toEqual(["appointment.booked", "appointment.cancelled", "appointment.rescheduled"]);
    await expectApiError(rescheduleAppointmentForApi(context, a.caller, appointment.id, { starts_at: tomorrowAt(15) }), 409, "conflict");
  });

  it("does not record events for businesses without subscribed endpoints", async () => {
    const before = await admin!.db.select({ id: webhookEvents.id }).from(webhookEvents).where(eq(webhookEvents.businessId, b.businessId));
    await createContactForApi({ db: worker!.db }, b.caller, { phone: "+14165556666" });
    expect(await admin!.db.select({ id: webhookEvents.id }).from(webhookEvents).where(eq(webhookEvents.businessId, b.businessId))).toHaveLength(before.length);
  });

  it("emits call.completed when a finished call is finalized, and message.taken for new messages", async () => {
    const context = { db: worker!.db };
    await admin!.db.update(webhookEndpoints).set({ events: ["call.completed", "message.taken"] }).where(eq(webhookEndpoints.businessId, a.businessId));
    const [contact] = await admin!.db.insert(contacts).values({ businessId: a.businessId, phone: "+14165557777", name: "Caller" }).returning({ id: contacts.id });
    const [conversation] = await admin!.db.insert(conversations).values({ businessId: a.businessId, contactId: contact!.id, channel: "voice", summary: "Asked about prices." }).returning({ id: conversations.id });
    const [call] = await admin!.db.insert(calls).values({ businessId: a.businessId, contactId: contact!.id, conversationId: conversation!.id, providerCallId: `test-${randomUUID()}`, transport: "sip", status: "completed", startedAt: new Date(Date.now() - 120_000), endedAt: new Date() }).returning({ id: calls.id });
    const result = await finalizeConversationSession(context, { businessId: a.businessId, callId: call!.id });
    expect(result.finalized).toBe(true);
    const [event] = await admin!.db.select().from(webhookEvents).where(and(eq(webhookEvents.businessId, a.businessId), eq(webhookEvents.type, "call.completed")));
    expect(apiCallSchema.parse(event!.payload.data)).toMatchObject({ id: call!.id, status: "completed", caller_phone: "+14165557777", channel: "phone" });
    const [outbox] = await admin!.db.select().from(outboxMessages).where(and(eq(outboxMessages.businessId, a.businessId), eq(outboxMessages.topic, "webhook.deliver"), sql`${outboxMessages.payload}->>'deliveryId' in (select id::text from webhook_deliveries where event_id = ${event!.id})`));
    expect(outbox).toBeDefined();

    const task = await createVoiceFollowUpTask(context, { businessId: a.businessId, callId: call!.id, callerName: "Caller", callbackPhone: "+14165557777", urgency: "urgent", message: "Call back", channel: "voice" });
    const [message] = await admin!.db.select().from(webhookEvents).where(and(eq(webhookEvents.businessId, a.businessId), eq(webhookEvents.type, "message.taken")));
    expect(message?.payload.data).toMatchObject({ id: task.inboxItemId, caller_name: "Caller", callback_phone: "+14165557777", urgency: "urgent", channel: "voice", call_id: call!.id });
    const [item] = await admin!.db.select({ metadata: inboxItems.metadata }).from(inboxItems).where(eq(inboxItems.id, task.inboxItemId));
    expect(item?.metadata).toMatchObject({ callerName: "Caller" });
  });

  it("retries failed deliveries with backoff, then disables a failing endpoint and alerts the owner", async () => {
    const context = { db: worker!.db };
    const [endpoint] = await admin!.db.insert(webhookEndpoints).values({ businessId: b.businessId, url: "https://failing.example.com/hook", events: ["contact.created"], encryptedSecret: encryptWebhookSecret("whsec_dGVzdHNlY3JldHRlc3RzZWNyZXR0ZXN0c2VjcmV0MTI=") }).returning();
    await admin!.db.insert(users).values({ id: randomUUID(), email: `b-owner-${randomUUID()}@example.invalid`, normalizedEmail: `b-owner-${randomUUID()}@example.invalid` }).returning({ id: users.id }).then(async ([user]) => {
      await admin!.db.insert(businessMemberships).values({ businessId: b.businessId, userId: user!.id, role: "business_owner" });
    });
    const contact = await createContactForApi(context, b.caller, { phone: "+14165558888" });
    const [delivery] = await admin!.db.select().from(webhookDeliveries).innerJoin(webhookEvents, eq(webhookEvents.id, webhookDeliveries.eventId)).where(and(eq(webhookDeliveries.endpointId, endpoint!.id), sql`${webhookEvents.payload}->'data'->>'id' = ${contact.id}`));
    const deliveryId = delivery!.webhook_deliveries.id;
    const failing = async () => ({ ok: false, status: 500, error: "HTTP 500", durationMs: 5 });

    const first = await processWebhookDelivery(context, { businessId: b.businessId, deliveryId, attempt: 1, send: failing });
    expect(first.outcome).toBe("retry_scheduled");
    const [retry] = await admin!.db.select().from(outboxMessages).where(eq(outboxMessages.dedupeKey, `webhook-delivery:${deliveryId}:attempt:2`));
    expect(retry!.availableAt.getTime() - Date.now()).toBeGreaterThan(20_000);
    // A duplicate job for an attempt that already ran is ignored.
    expect((await processWebhookDelivery(context, { businessId: b.businessId, deliveryId, attempt: 1, send: failing })).outcome).toBe("stale");

    let last = first;
    for (let attempt = 2; attempt <= WEBHOOK_MAX_ATTEMPTS; attempt += 1) last = await processWebhookDelivery(context, { businessId: b.businessId, deliveryId, attempt, send: failing });
    expect(last).toEqual({ outcome: "failed", endpointDisabled: true });
    const attempts = await admin!.db.select().from(webhookDeliveryAttempts).where(eq(webhookDeliveryAttempts.deliveryId, deliveryId));
    expect(attempts).toHaveLength(WEBHOOK_MAX_ATTEMPTS);
    const [after] = await admin!.db.select().from(webhookEndpoints).where(eq(webhookEndpoints.id, endpoint!.id));
    expect(after).toMatchObject({ status: "disabled", disabledReason: "failing", consecutiveFailures: WEBHOOK_MAX_ATTEMPTS });
    const [audit] = await admin!.db.select().from(auditLogs).where(and(eq(auditLogs.entityId, endpoint!.id), eq(auditLogs.eventType, "webhook_endpoint.auto_disabled")));
    expect(audit).toBeDefined();
    // The owner alert goes through app.resolve_operator_notification_recipients, which only
    // answers a session that logged in as lobbystack_worker.
    if (workerLoginUrl) {
      const alerts = await admin!.db.select().from(operatorNotificationDeliveries).where(and(eq(operatorNotificationDeliveries.businessId, b.businessId), eq(operatorNotificationDeliveries.eventKind, "webhookDisabled")));
      expect(alerts.length).toBeGreaterThan(0);
    }
  });

  it("marks a delivery succeeded and resets the failure count", async () => {
    const context = { db: worker!.db };
    await admin!.db.update(webhookEndpoints).set({ events: ["contact.created"], status: "enabled" }).where(eq(webhookEndpoints.businessId, a.businessId));
    const contact = await createContactForApi(context, a.caller, { phone: "+14165559999" });
    const [row] = await admin!.db.select({ id: webhookDeliveries.id }).from(webhookDeliveries).innerJoin(webhookEvents, eq(webhookEvents.id, webhookDeliveries.eventId)).where(sql`${webhookEvents.payload}->'data'->>'id' = ${contact.id}`);
    let sent: { id: string; body: string } | undefined;
    const result = await processWebhookDelivery(context, { businessId: a.businessId, deliveryId: row!.id, attempt: 1, send: async (input) => { sent = input; return { ok: true, status: 200, error: null, durationMs: 3 }; } });
    expect(result.outcome).toBe("succeeded");
    expect(JSON.parse(sent!.body)).toMatchObject({ type: "contact.created", data: { id: contact.id } });
    const [delivery] = await admin!.db.select().from(webhookDeliveries).where(eq(webhookDeliveries.id, row!.id));
    expect(delivery).toMatchObject({ status: "succeeded", attemptCount: 1, lastResponseStatus: 200 });
  });

  it("lists each business's own staff with the services they take", async () => {
    const context = { db: worker!.db };
    const listA = await listStaffForApi(context, a.caller);
    expect(listA.map((member) => apiStaffSchema.parse(member).id)).toContain(a.staffId);
    expect(listA.map((member) => member.id)).not.toContain(b.staffId);
    // A business that never set up staff has its one default staff member, open to every service.
    expect(listA.find((member) => member.id === a.staffId)).toMatchObject({ active: true, timezone: "UTC", service_ids: [a.serviceId] });

    const [second] = await admin!.db.insert(staff).values({ businessId: a.businessId, name: "Riley", timezone: "America/Toronto" }).returning({ id: staff.id });
    const [inactive] = await admin!.db.insert(staff).values({ businessId: a.businessId, name: "Gone", timezone: "UTC", active: false }).returning({ id: staff.id });
    const [colour] = await admin!.db.insert(services).values({ businessId: a.businessId, name: "Colour", slug: "colour", durationMinutes: 60 }).returning({ id: services.id });
    await admin!.db.insert(staffServiceAssignments).values({ businessId: a.businessId, staffId: second!.id, serviceId: colour!.id });
    const listed = await listStaffForApi(context, a.caller);
    expect(listed.find((member) => member.id === second!.id)?.service_ids.sort()).toEqual([a.serviceId, colour!.id].sort());
    expect(listed.find((member) => member.id === a.staffId)?.service_ids).toEqual([a.serviceId]);
    expect(listed.find((member) => member.id === inactive!.id)).toMatchObject({ active: false, service_ids: [] });

    // staff_id must be an active member of this business who takes the service.
    const base = { service_id: a.serviceId, starts_at: tomorrowAt(9), contact_phone: "+14165556000" };
    await expectApiError(createAppointmentForApi(context, a.caller, { ...base, staff_id: b.staffId }), 400, "invalid_request");
    await expectApiError(createAppointmentForApi(context, a.caller, { ...base, staff_id: inactive!.id }), 400, "invalid_request");
    await expectApiError(createAppointmentForApi(context, a.caller, { ...base, service_id: colour!.id, staff_id: a.staffId }), 400, "invalid_request");
    await expectApiError(getAvailabilityForApi(context, a.caller, { serviceId: a.serviceId, startDate: base.starts_at.slice(0, 10), staffId: b.staffId }), 400, "invalid_request");

    const booked = await createAppointmentForApi(context, a.caller, { ...base, staff_id: second!.id });
    expect(booked.staff_id).toBe(second!.id);
    const riley = await getAvailabilityForApi(context, a.caller, { serviceId: a.serviceId, startDate: base.starts_at.slice(0, 10), staffId: second!.id });
    expect(riley.map((slot) => slot.starts_at)).not.toContain(new Date(base.starts_at).toISOString());
    const sam = await getAvailabilityForApi(context, a.caller, { serviceId: a.serviceId, startDate: base.starts_at.slice(0, 10), staffId: a.staffId });
    expect(sam.map((slot) => slot.starts_at)).toContain(new Date(base.starts_at).toISOString());

    // Reschedule can move the appointment to another staff member.
    const moved = await rescheduleAppointmentForApi(context, a.caller, booked.id, { starts_at: tomorrowAt(11), staff_id: a.staffId });
    expect(moved).toMatchObject({ staff_id: a.staffId, starts_at: new Date(tomorrowAt(11)).toISOString() });
    await expectApiError(rescheduleAppointmentForApi(context, a.caller, booked.id, { starts_at: tomorrowAt(12), staff_id: b.staffId }), 400, "invalid_request");
    // Not when either staff member has their own calendar: the old event would stay behind.
    await admin!.db.insert(calendarConnections).values({ businessId: a.businessId, ownerUserId: ownerId, staffId: second!.id, provider: "google", externalAccountId: `staff-${randomUUID()}`, status: "connected" });
    await expectApiError(rescheduleAppointmentForApi(context, a.caller, booked.id, { starts_at: tomorrowAt(13), staff_id: second!.id }), 409, "conflict");
    await admin!.db.delete(calendarConnections).where(eq(calendarConnections.businessId, a.businessId));
    await admin!.db.update(staff).set({ active: false }).where(inArray(staff.id, [second!.id]));
  });

  it("describes the calling key and its business", async () => {
    const me = await getMeForApi({ db: worker!.db }, a.caller);
    expect(me).toEqual({ api_key: { id: a.caller.apiKeyId, name: "a", prefix: expect.stringMatching(/^lsk_[0-9a-f]{8}$/), scopes: ["contacts:read", "contacts:write", "appointments:write"], created_at: expect.any(String) }, business: { id: a.businessId, name: expect.any(String) } });
    await expectApiError(getMeForApi({ db: worker!.db }, { businessId: b.businessId, apiKeyId: a.caller.apiKeyId }), 404, "not_found");
  });

  it("filters appointments by contact in SQL, together with status, and pages through them", async () => {
    const context = { db: worker!.db };
    const phone = "+14165557100";
    const ids: string[] = [];
    for (const hour of [9, 10, 11]) ids.push((await createAppointmentForApi(context, a.caller, { service_id: a.serviceId, starts_at: DateTime.utc().plus({ days: 3 }).set({ hour, minute: 0, second: 0, millisecond: 0 }).toISO()!, contact_phone: phone })).id);
    await createAppointmentForApi(context, a.caller, { service_id: a.serviceId, starts_at: DateTime.utc().plus({ days: 3 }).set({ hour: 12, minute: 0, second: 0, millisecond: 0 }).toISO()!, contact_phone: "+14165557101" });
    await cancelAppointmentForApi(context, a.caller, ids[0]!);
    const [contact] = await admin!.db.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.businessId, a.businessId), eq(contacts.phone, phone)));
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await listAppointmentsForApi(context, a.caller, { contactId: contact!.id, limit: 1, ...(cursor ? { cursor } : {}) });
      expect(page.data.every((appointment) => appointment.contact_id === contact!.id)).toBe(true);
      seen.push(...page.data.map((appointment) => appointment.id));
      cursor = page.next_cursor ?? undefined;
    } while (cursor);
    expect(seen.sort()).toEqual([...ids].sort());
    const confirmed = await listAppointmentsForApi(context, a.caller, { contactId: contact!.id, status: "confirmed", limit: 100 });
    expect(confirmed.data.map((appointment) => appointment.id).sort()).toEqual(ids.slice(1).sort());
    // Another business's contact id matches nothing.
    expect((await listAppointmentsForApi(context, b.caller, { contactId: contact!.id, limit: 100 })).data).toEqual([]);
  });

  it("replaces opening hours through the business endpoint", async () => {
    const business = await updateBusinessForApi({ db: worker!.db }, a.caller, { name: "API a renamed", hours: [{ day: "monday", open: "09:00", close: "17:30" }] });
    expect(business).toMatchObject({ name: "API a renamed", hours: [{ day: "monday", open: "09:00", close: "17:30" }] });
    await expectApiError(updateBusinessForApi({ db: worker!.db }, a.caller, { hours: [{ day: "monday", open: "10:00", close: "09:00" }] }), 400, "invalid_request");
    await expectApiError(updateBusinessForApi({ db: worker!.db }, a.caller, { timezone: "Mars/Olympus" }), 400, "invalid_request");
  });

  it("adds a website as a sample crawl and returns the same source for a repeat", async () => {
    const context = { db: worker!.db };
    const source = await createKnowledgeSourceForApi(context, a.caller, { type: "website", url: "maple-api.example" });
    expect(source).toMatchObject({ type: "website", url: "https://maple-api.example/", status: "processing", page_limit: ONBOARDING_CRAWL_PAGE_LIMIT });
    expect(apiKnowledgeSourceSchema.safeParse(source).success).toBe(true);
    const [crawl] = await admin!.db.select({ payload: outboxMessages.payload }).from(outboxMessages).where(and(eq(outboxMessages.businessId, a.businessId), eq(outboxMessages.topic, "knowledge.crawlWebsite"), eq(outboxMessages.aggregateId, source.id)));
    expect(crawl?.payload).toMatchObject({ documentId: source.id, limit: ONBOARDING_CRAWL_PAGE_LIMIT });
    expect((await createKnowledgeSourceForApi(context, a.caller, { type: "website", url: "https://maple-api.example/" })).id).toBe(source.id);
    // Business a is not on its website step, so its website stays as it was.
    const [business] = await admin!.db.select({ websiteUrl: businesses.websiteUrl }).from(businesses).where(eq(businesses.id, a.businessId));
    expect(business?.websiteUrl).not.toBe("https://maple-api.example/");
  });

  it("refuses a website address the crawler can't read", async () => {
    const error = await createKnowledgeSourceForApi({ db: worker!.db }, a.caller, { type: "website", url: "localhost" }).then(() => null, (value: unknown) => value);
    expect(error).toMatchObject({ status: 400, code: "invalid_request", details: [{ path: "url", message: expect.any(String) }] });
  });

  it("expands, cancels and retries a website source, inside its own business only", async () => {
    const context = { db: worker!.db };
    const source = await createKnowledgeSourceForApi(context, a.caller, { type: "website", url: "https://oak-api.example" });
    // A source still being read can't be retried; cancel it first.
    await expectApiError(retryKnowledgeSourceForApi(context, a.caller, source.id), 409, "conflict");
    await cancelKnowledgeSourceForApi(context, a.caller, source.id);
    // A retry keeps the sample's page limit instead of quietly reading the whole site.
    expect(await retryKnowledgeSourceForApi(context, a.caller, source.id)).toMatchObject({ status: "processing", page_limit: ONBOARDING_CRAWL_PAGE_LIMIT });
    expect(await expandKnowledgeSourceForApi(context, a.caller, source.id)).toMatchObject({ status: "processing", page_limit: FULL_CRAWL_PAGE_LIMIT });
    expect(await cancelKnowledgeSourceForApi(context, a.caller, source.id)).toMatchObject({ status: "cancelled" });
    await expectApiError(cancelKnowledgeSourceForApi(context, a.caller, source.id), 409, "conflict");
    // Sending the cancelled site again reads it at its full limit, not back at a sample.
    expect(await createKnowledgeSourceForApi(context, a.caller, { type: "website", url: "https://oak-api.example" })).toMatchObject({ id: source.id, status: "processing", page_limit: FULL_CRAWL_PAGE_LIMIT });
    await expectApiError(expandKnowledgeSourceForApi(context, b.caller, source.id), 404, "not_found");
    await expectApiError(retryKnowledgeSourceForApi(context, b.caller, source.id), 404, "not_found");
    await expectApiError(cancelKnowledgeSourceForApi(context, a.caller, randomUUID()), 404, "not_found");
  });

  it("treats a page a crawl read as part of its website, not as a source", async () => {
    const context = { db: worker!.db };
    const [page] = await admin!.db.insert(knowledgeDocuments).values({ businessId: a.businessId, sourceType: "website", title: "About", sourceUrl: "https://elm-api.example/about", status: "indexed" }).returning({ id: knowledgeDocuments.id });
    await expectApiError(createKnowledgeSourceForApi(context, a.caller, { type: "website", url: "elm-api.example/about" }), 409, "conflict");
    await expectApiError(expandKnowledgeSourceForApi(context, a.caller, page!.id), 400, "invalid_request");
    await expectApiError(retryKnowledgeSourceForApi(context, a.caller, page!.id), 400, "invalid_request");
  });

  describe("file uploads", () => {
    // Stands in for S3 or local storage: holds what a client has PUT.
    const stored = new Map<string, { length: number; contentType: string; checksum?: string }>();
    const storage = {
      createUpload: async (input: { key: string; contentType: string }) => ({ url: `https://storage.test/${input.key}`, headers: { "content-type": input.contentType }, expiresAt: new Date(Date.now() + 900_000) }),
      headObject: async ({ key }: { key: string }) => stored.get(key) ?? null,
      deleteObject: async () => undefined,
      createDownloadUrl: async () => "https://storage.test/download",
    };
    const checksum = createHash("sha256").update("price list").digest("base64");
    const request = { file_name: "prices.pdf", content_type: "application/pdf" as const, length: 10, checksum_sha256: checksum };
    const keyOf = async (uploadId: string) => (await admin!.db.select({ key: storageObjects.objectKey }).from(storageObjects).where(eq(storageObjects.id, uploadId)))[0]!.key;

    it("completes an upload once its file arrives, and returns the same source when completed again", async () => {
      const context = { db: worker!.db };
      const upload = await createKnowledgeUploadForApi(context, a.caller, request, storage);
      expect(upload.upload_url).toContain(upload.upload_id);
      expect(upload.expires_at).not.toBeNull();
      await expectApiError(completeKnowledgeUploadForApi(context, a.caller, upload.upload_id, {}, storage), 409, "conflict");
      stored.set(await keyOf(upload.upload_id), { length: 10, contentType: "application/pdf", checksum });
      const source = await completeKnowledgeUploadForApi(context, a.caller, upload.upload_id, { title: "Price list" }, storage);
      expect(source).toMatchObject({ type: "file", title: "Price list", url: null, status: "pending", page_limit: null });
      expect(apiKnowledgeSourceSchema.safeParse(source).success).toBe(true);
      const [extract] = await admin!.db.select({ id: outboxMessages.id }).from(outboxMessages).where(and(eq(outboxMessages.topic, "knowledge.extractDocument"), eq(outboxMessages.aggregateId, source.id)));
      expect(extract).toBeDefined();
      expect((await completeKnowledgeUploadForApi(context, a.caller, upload.upload_id, {}, storage)).id).toBe(source.id);
      await expectApiError(completeKnowledgeUploadForApi(context, b.caller, upload.upload_id, {}, storage), 404, "not_found");
    });

    it("refuses a stored file that doesn't match its upload request", async () => {
      const context = { db: worker!.db };
      const upload = await createKnowledgeUploadForApi(context, a.caller, request, storage);
      stored.set(await keyOf(upload.upload_id), { length: 11, contentType: "application/pdf", checksum });
      await expectApiError(completeKnowledgeUploadForApi(context, a.caller, upload.upload_id, {}, storage), 400, "invalid_request");
      await expectApiError(completeKnowledgeUploadForApi(context, a.caller, randomUUID(), {}, storage), 404, "not_found");
    });

    it("treats an expired upload, or one that isn't a knowledge document, as not found", async () => {
      const context = { db: worker!.db };
      const upload = await createKnowledgeUploadForApi(context, a.caller, request, storage);
      stored.set(await keyOf(upload.upload_id), { length: 10, contentType: "application/pdf", checksum });
      await admin!.db.update(storageObjects).set({ expiresAt: new Date(Date.now() - 1_000) }).where(eq(storageObjects.id, upload.upload_id));
      await expectApiError(completeKnowledgeUploadForApi(context, a.caller, upload.upload_id, {}, storage), 404, "not_found");
      const [attachment] = await admin!.db.insert(storageObjects).values({ businessId: a.businessId, objectKey: `${a.businessId}/attachment/${randomUUID()}/note.pdf`, purpose: "attachment", fileName: "note.pdf", contentType: "application/pdf", contentLength: 10, status: "pending" }).returning({ id: storageObjects.id, key: storageObjects.objectKey });
      stored.set(attachment!.key, { length: 10, contentType: "application/pdf" });
      await expectApiError(completeKnowledgeUploadForApi(context, a.caller, attachment!.id, {}, storage), 404, "not_found");
    });

    it("makes one source when two completions race", async () => {
      const context = { db: worker!.db };
      const upload = await createKnowledgeUploadForApi(context, a.caller, request, storage);
      stored.set(await keyOf(upload.upload_id), { length: 10, contentType: "application/pdf", checksum });
      const [first, second] = await Promise.all([0, 1].map(async () => await completeKnowledgeUploadForApi(context, a.caller, upload.upload_id, {}, storage)));
      expect(second!.id).toBe(first!.id);
      expect(await admin!.db.select({ id: knowledgeDocuments.id }).from(knowledgeDocuments).where(eq(knowledgeDocuments.storageObjectId, upload.upload_id))).toHaveLength(1);
    });

    it("refuses an upload with plan_limit_reached once the plan's knowledge text is full, and keeps it pending", async () => {
      const context = { db: worker!.db };
      // Business b is on Free, which includes 1 MB of text. Fill it.
      const [full] = await admin!.db.insert(knowledgeDocuments).values({ businessId: b.businessId, sourceType: "text", title: "Full", status: "indexed" }).returning({ id: knowledgeDocuments.id });
      try {
        await admin!.db.insert(knowledgeChunks).values([0, 1].map((sequence) => ({ businessId: b.businessId, documentId: full!.id, sequence, content: "x".repeat(530_000), contentHash: `full-${sequence}` })));
        const upload = await createKnowledgeUploadForApi(context, b.caller, request, storage);
        stored.set(await keyOf(upload.upload_id), { length: 10, contentType: "application/pdf", checksum });
        await expectApiError(completeKnowledgeUploadForApi(context, b.caller, upload.upload_id, {}, storage), 409, "plan_limit_reached");
        const [object] = await admin!.db.select({ status: storageObjects.status }).from(storageObjects).where(eq(storageObjects.id, upload.upload_id));
        expect(object?.status).toBe("pending");
      } finally {
        await admin!.db.delete(knowledgeDocuments).where(eq(knowledgeDocuments.id, full!.id));
      }
    });
  });

  it("takes the first website as the business's website while onboarding", async () => {
    await admin!.db.update(businesses).set({ onboardingStage: "website" }).where(eq(businesses.id, b.businessId));
    await createKnowledgeSourceForApi({ db: worker!.db }, b.caller, { type: "website", url: "https://birch-api.example" });
    const [business] = await admin!.db.select({ websiteUrl: businesses.websiteUrl, stage: businesses.onboardingStage }).from(businesses).where(eq(businesses.id, b.businessId));
    expect(business).toEqual({ websiteUrl: "https://birch-api.example/", stage: "knowledge" });
  });

  it("adds, changes and deletes services, and keeps slugs unique among live services", async () => {
    const context = { db: worker!.db };
    // The name gives the slug, and staff_ids limits who takes the service.
    const created = await createServiceForApi(context, a.caller, { name: "Color & Gloss", duration_minutes: 90, staff_ids: [a.staffId] });
    expect(created).toMatchObject({ name: "Color & Gloss", slug: "color-gloss", description: null, duration_minutes: 90, active: true, staff_ids: [a.staffId] });
    expect(apiServiceSchema.safeParse(created).success).toBe(true);
    await expectApiError(createServiceForApi(context, a.caller, { name: "Another", slug: "color-gloss", duration_minutes: 30 }), 409, "conflict");
    // Staff of another business are refused, and nothing of the refused service stays.
    await expectApiError(createServiceForApi(context, a.caller, { name: "Mystery", duration_minutes: 30, staff_ids: [b.staffId] }), 400, "invalid_request");
    expect(await admin!.db.select({ id: services.id }).from(services).where(and(eq(services.businessId, a.businessId), eq(services.name, "Mystery")))).toEqual([]);
    // A name with no Latin letters or digits needs a slug.
    await expectApiError(createServiceForApi(context, a.caller, { name: "Стрижка", duration_minutes: 30 }), 400, "invalid_request");
    // A slug made from the name is checked like one sent: the fixture's Cut already holds "cut".
    await expectApiError(createServiceForApi(context, a.caller, { name: "Cut", duration_minutes: 30 }), 409, "conflict");
    // Two requests racing for one slug: one wins and the other gets a 409.
    const race = await Promise.allSettled([0, 1].map(async () => await createServiceForApi(context, a.caller, { name: "Beard Trim", duration_minutes: 20 })));
    expect(race.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(race.find((result) => result.status === "rejected")).toMatchObject({ reason: { status: 409, code: "conflict" } });

    const refreshes = async () => (await admin!.db.select({ id: outboxMessages.id }).from(outboxMessages).where(and(eq(outboxMessages.topic, "snapshot.refresh"), eq(outboxMessages.aggregateId, created.id)))).length;
    const audits = async () => await admin!.db.select({ payload: auditLogs.payload }).from(auditLogs).where(and(eq(auditLogs.entityId, created.id), eq(auditLogs.eventType, "api.service.updated")));
    const baseline = await refreshes();
    expect(await updateServiceForApi(context, a.caller, created.id, { duration_minutes: 60, description: "Full color.", staff_ids: [] })).toMatchObject({ duration_minutes: 60, description: "Full color.", staff_ids: [] });
    // One refresh for the fields and one for the staff.
    expect(await refreshes()).toBe(baseline + 2);
    expect(await audits()).toEqual([{ payload: expect.objectContaining({ fields: ["description", "duration_minutes", "staff_ids"] }) }]);
    // Values it already has change nothing.
    await updateServiceForApi(context, a.caller, created.id, { duration_minutes: 60, staff_ids: [] });
    expect(await refreshes()).toBe(baseline + 2);
    expect(await audits()).toHaveLength(1);
    await expectApiError(updateServiceForApi(context, a.caller, created.id, {}), 400, "invalid_request");
    await expectApiError(updateServiceForApi(context, a.caller, created.id, { slug: "cut" }), 409, "conflict");
    await expectApiError(updateServiceForApi(context, b.caller, created.id, { active: false }), 404, "not_found");
    await expectApiError(deleteServiceForApi(context, b.caller, created.id), 404, "not_found");
    // A refused staff list undoes the whole change.
    await expectApiError(updateServiceForApi(context, a.caller, created.id, { duration_minutes: 45, staff_ids: [b.staffId] }), 400, "invalid_request");
    const savedService = async () => (await admin!.db.select({ durationMinutes: services.durationMinutes, updatedAt: services.updatedAt }).from(services).where(eq(services.id, created.id)))[0]!;
    expect((await savedService()).durationMinutes).toBe(60);
    // Changing only the staff still moves updated_at, and ids may come in upper case.
    const before = (await savedService()).updatedAt.getTime();
    expect(await updateServiceForApi(context, a.caller, created.id, { staff_ids: [a.staffId.toUpperCase()] })).toMatchObject({ staff_ids: [a.staffId] });
    expect((await savedService()).updatedAt.getTime()).toBeGreaterThan(before);

    // A service turned off leaves the list unless the inactive ones are asked for.
    await updateServiceForApi(context, a.caller, created.id, { active: false });
    expect((await listServicesForApi(context, a.caller)).map((service) => service.id)).not.toContain(created.id);
    expect((await listServicesForApi(context, a.caller, { includeInactive: true })).map((service) => service.id)).toContain(created.id);

    // Deleting hides the service everywhere and frees its slug.
    await deleteServiceForApi(context, a.caller, created.id);
    await expectApiError(deleteServiceForApi(context, a.caller, created.id), 404, "not_found");
    expect((await listServicesForApi(context, a.caller, { includeInactive: true })).map((service) => service.id)).not.toContain(created.id);
    const again = await createServiceForApi(context, a.caller, { name: "Color & Gloss", duration_minutes: 90 });
    expect(again).toMatchObject({ slug: "color-gloss" });
    expect(again.id).not.toBe(created.id);
    expect(await admin!.db.select({ id: auditLogs.id }).from(auditLogs).where(and(eq(auditLogs.entityId, created.id), eq(auditLogs.eventType, "api.service.deleted")))).toHaveLength(1);
  });

  it("adds, changes, orders and deletes rules, refreshing the snapshot only when something changes", async () => {
    const context = { db: worker!.db };
    const first = await createRuleForApi(context, a.caller, { title: "No prices", content: "Never quote prices on the phone." });
    const second = await createRuleForApi(context, a.caller, { title: "Spanish", content: "Offer Spanish to callers who ask.", active: false });
    expect(second).toMatchObject({ title: "Spanish", active: false });
    expect(apiRuleSchema.safeParse(first).success).toBe(true);
    expect((await listRulesForApi(context, a.caller)).map((rule) => rule.id)).toEqual([first.id, second.id]);
    expect(await listRulesForApi(context, b.caller)).toEqual([]);

    const refreshes = async () => (await admin!.db.select({ id: outboxMessages.id }).from(outboxMessages).where(and(eq(outboxMessages.topic, "snapshot.refresh"), eq(outboxMessages.businessId, a.businessId), eq(outboxMessages.aggregateType, "agent_rule")))).length;
    const baseline = await refreshes();
    expect(await updateRuleForApi(context, a.caller, second.id, { active: true, title: "Spanish" })).toMatchObject({ active: true });
    expect(await refreshes()).toBe(baseline + 1);
    const [audit] = await admin!.db.select({ payload: auditLogs.payload }).from(auditLogs).where(and(eq(auditLogs.entityId, second.id), eq(auditLogs.eventType, "api.rule.updated")));
    expect(audit?.payload).toMatchObject({ fields: ["active"] });
    // Values the rule already has, or the order the rules already have, change nothing.
    await updateRuleForApi(context, a.caller, second.id, { active: true });
    expect(await reorderRulesForApi(context, a.caller, { rule_ids: [first.id, second.id] })).toMatchObject([{ id: first.id }, { id: second.id }]);
    expect(await refreshes()).toBe(baseline + 1);
    await expectApiError(updateRuleForApi(context, a.caller, second.id, {}), 400, "invalid_request");

    expect((await reorderRulesForApi(context, a.caller, { rule_ids: [second.id.toUpperCase(), first.id] })).map((rule) => rule.id)).toEqual([second.id, first.id]);
    expect(await refreshes()).toBe(baseline + 2);
    // The order has to name every rule once, and only this business's rules.
    await expectApiError(reorderRulesForApi(context, a.caller, { rule_ids: [second.id] }), 400, "invalid_request");
    await expectApiError(reorderRulesForApi(context, a.caller, { rule_ids: [second.id, first.id, first.id] }), 400, "invalid_request");
    await expectApiError(reorderRulesForApi(context, b.caller, { rule_ids: [second.id, first.id] }), 400, "invalid_request");
    await expectApiError(updateRuleForApi(context, b.caller, first.id, { active: false }), 404, "not_found");
    await expectApiError(deleteRuleForApi(context, b.caller, first.id), 404, "not_found");

    await deleteRuleForApi(context, a.caller, first.id);
    await expectApiError(deleteRuleForApi(context, a.caller, first.id), 404, "not_found");
    expect((await listRulesForApi(context, a.caller)).map((rule) => rule.id)).toEqual([second.id]);
    expect(await refreshes()).toBe(baseline + 3);
    const audited = async (eventType: string) => (await admin!.db.select({ id: auditLogs.id }).from(auditLogs).where(and(eq(auditLogs.businessId, a.businessId), eq(auditLogs.eventType, eventType)))).length;
    expect(await audited("api.rule.created")).toBe(2);
    expect(await audited("api.rule.deleted")).toBe(1);
    expect(await audited("api.rules.reordered")).toBe(1);
    await deleteRuleForApi(context, a.caller, second.id);
  });

  it("keeps at most 100 rules, and settles rules that share a position when their order is sent", async () => {
    const context = { db: worker!.db };
    // Two rules saved at the same position, as a dashboard subset reorder or a race can leave them.
    await admin!.db.insert(agentRules).values([0, 1].map((index) => ({ businessId: b.businessId, title: `Tied ${index}`, content: "Be kind.", sortOrder: 0 })));
    try {
      const listed = await listRulesForApi(context, b.caller);
      expect(listed).toHaveLength(2);
      const order = listed.map((rule) => rule.id);
      // Sending the order they're listed in writes it, so each rule gets its own position.
      await reorderRulesForApi(context, b.caller, { rule_ids: order });
      const positions = await admin!.db.select({ id: agentRules.id, sortOrder: agentRules.sortOrder }).from(agentRules).where(eq(agentRules.businessId, b.businessId));
      expect(order.map((id) => positions.find((row) => row.id === id)?.sortOrder)).toEqual([0, 1]);

      await admin!.db.insert(agentRules).values(Array.from({ length: 98 }, (_, index) => ({ businessId: b.businessId, title: `Rule ${index}`, content: "Be kind.", sortOrder: index + 2 })));
      await expectApiError(createRuleForApi(context, b.caller, { title: "One too many", content: "Be kind." }), 409, "conflict");
    } finally {
      await admin!.db.delete(agentRules).where(eq(agentRules.businessId, b.businessId));
    }
  });

  it("reads and changes the receptionist, refreshing the snapshot only when something changes", async () => {
    const context = { db: worker!.db };
    const before = await getReceptionistForApi(context, a.caller);
    expect(before).toMatchObject({ greeting: "Hi", tone: "warm", booking_policy: "Book", transfer_mode: "never", booking_mode: "instant", appointment_change_policy: { enabled: true, allow_cancel: true, allow_reschedule: true, verification_mode: "phone_match_and_facts" } });
    expect(apiReceptionistSchema.safeParse(before).success).toBe(true);
    const [profile] = await admin!.db.select({ id: receptionistProfiles.id }).from(receptionistProfiles).where(eq(receptionistProfiles.businessId, a.businessId));
    const refreshes = async () => (await admin!.db.select({ id: outboxMessages.id }).from(outboxMessages).where(and(eq(outboxMessages.topic, "snapshot.refresh"), eq(outboxMessages.aggregateId, profile!.id)))).length;
    const audits = async () => await admin!.db.select({ payload: auditLogs.payload }).from(auditLogs).where(and(eq(auditLogs.entityId, profile!.id), eq(auditLogs.eventType, "api.receptionist.updated")));
    const savedAt = async () => (await admin!.db.select({ at: receptionistProfiles.updatedAt }).from(receptionistProfiles).where(eq(receptionistProfiles.id, profile!.id)))[0]!.at.getTime();
    const baseline = await refreshes();
    // No policy is stored, which calls read as the default, so sending the default changes nothing.
    await updateReceptionistForApi(context, a.caller, { appointment_change_policy: before.appointment_change_policy });
    expect(await refreshes()).toBe(baseline);
    expect(await audits()).toEqual([]);
    await expectApiError(updateReceptionistForApi(context, a.caller, {}), 400, "invalid_request");

    const policy = { enabled: true, allow_cancel: false, allow_reschedule: true, verification_mode: "otp_required" as const };
    const updated = await updateReceptionistForApi(context, a.caller, { greeting: "Welcome to Maple.", voice_instructions: "Speak slowly.", transfer_mode: "on_request", transfer_number: "+14165550134", appointment_change_policy: policy });
    expect(updated).toMatchObject({ greeting: "Welcome to Maple.", tone: "warm", voice_instructions: "Speak slowly.", transfer_mode: "on_request", transfer_number: "+14165550134", appointment_change_policy: policy });
    expect(await refreshes()).toBe(baseline + 1);
    expect(await audits()).toEqual([{ payload: expect.objectContaining({ fields: ["greeting", "voice_instructions", "transfer_mode", "transfer_number", "appointment_change_policy"] }) }]);
    // Sending what it already has writes, audits and refreshes nothing.
    const written = await savedAt();
    await updateReceptionistForApi(context, a.caller, { greeting: "Welcome to Maple.", appointment_change_policy: policy });
    expect(await refreshes()).toBe(baseline + 1);
    expect(await audits()).toHaveLength(1);
    expect(await savedAt()).toBe(written);
    expect(await updateReceptionistForApi(context, a.caller, { voice_instructions: null, transfer_number: null })).toMatchObject({ voice_instructions: null, transfer_number: null });

    // Sending the summary it already has still makes it the business's own, so AI won't replace it.
    await admin!.db.update(receptionistProfiles).set({ summary: "Maple cuts hair.", summarySource: "generated" }).where(eq(receptionistProfiles.id, profile!.id));
    expect(await updateReceptionistForApi(context, a.caller, { summary: "Maple cuts hair." })).toMatchObject({ summary: "Maple cuts hair.", summary_source: "operator" });
    // Asking for a new summary hands it back to AI and queues the rewrite.
    expect(await updateReceptionistForApi(context, a.caller, { regenerate_summary: true })).toMatchObject({ summary_source: "generated" });
    expect(await audits()).toContainEqual({ payload: expect.objectContaining({ fields: ["regenerate_summary"] }) });
    const rewrites = await admin!.db.select({ payload: outboxMessages.payload }).from(outboxMessages).where(and(eq(outboxMessages.topic, "business.generateSummary"), eq(outboxMessages.businessId, a.businessId)));
    expect(rewrites).toContainEqual({ payload: expect.objectContaining({ reason: "operator_regenerate", force: true }) });
    // The other business's receptionist is untouched.
    expect((await getReceptionistForApi(context, b.caller)).greeting).toBe("Hi");
  });

  it("refuses a transfer number the dashboard would refuse", async () => {
    const context = { db: worker!.db };
    // China: Twilio can't put calls through there, so the dashboard refuses it too.
    await expect(updateReceptionistForApi(context, a.caller, { transfer_number: "+8613800138000" })).rejects.toMatchObject({ status: 400, code: "transfer_country_unsupported" });
    expect((await getReceptionistForApi(context, a.caller)).transfer_number).not.toBe("+8613800138000");
  });

  it("shows a business with no receptionist row the defaults, and saves them with its first change", async () => {
    const businessId = randomUUID();
    await admin!.db.insert(businesses).values({ id: businessId, slug: `api-bare-${businessId}`, name: "Bare Clinic", timezone: "UTC", businessType: "test" });
    const caller: ApiKeyCaller = { businessId, apiKeyId: randomUUID() };
    const rows = async () => await admin!.db.select({ greeting: receptionistProfiles.greeting, tone: receptionistProfiles.tone }).from(receptionistProfiles).where(eq(receptionistProfiles.businessId, businessId));
    try {
      const context = { db: worker!.db };
      expect(await getReceptionistForApi(context, caller)).toMatchObject({ greeting: defaultGreeting("Bare Clinic"), summary: "Bare Clinic", summary_source: "placeholder", transfer_mode: "on_request", booking_mode: "instant" });
      expect(await rows()).toEqual([]);
      expect(await updateReceptionistForApi(context, caller, { tone: "warm" })).toMatchObject({ greeting: defaultGreeting("Bare Clinic"), tone: "warm", summary_source: "placeholder" });
      expect(await rows()).toEqual([{ greeting: defaultGreeting("Bare Clinic"), tone: "warm" }]);
    } finally {
      await admin!.db.delete(outboxMessages).where(eq(outboxMessages.businessId, businessId));
      await admin!.db.delete(businesses).where(eq(businesses.id, businessId));
    }
  });

  it("lists, edits and deletes knowledge entries, and keeps an FAQ an FAQ", async () => {
    const context = { db: worker!.db };
    const faq = await createKnowledgeEntryForApi(context, a.caller, { type: "faq", question: "Do you park?", answer: "Behind the building." });
    const text = await createKnowledgeEntryForApi(context, a.caller, { type: "text", title: "Holidays", content: "Closed on public holidays." });
    const ids = async (type?: "text" | "faq", caller: ApiKeyCaller = a.caller) => (await listKnowledgeEntriesForApi(context, caller, { type })).data.map((entry) => entry.id);
    expect(await ids()).toEqual(expect.arrayContaining([faq.id, text.id]));
    expect(await ids("faq")).toContain(faq.id);
    expect(await ids("faq")).not.toContain(text.id);
    expect(await ids("text")).toContain(text.id);
    expect(await ids("text")).not.toContain(faq.id);
    expect(await ids(undefined, b.caller)).not.toContain(faq.id);
    // One page at a time, with no entry on two pages.
    const first = await listKnowledgeEntriesForApi(context, a.caller, { limit: 1 });
    expect(first.has_more).toBe(true);
    const second = await listKnowledgeEntriesForApi(context, a.caller, { limit: 1, cursor: first.next_cursor! });
    expect([first.data[0]?.id, second.data[0]?.id].sort()).toEqual([faq.id, text.id].sort());

    // Tags sent without the FAQ marker keep the FAQ an FAQ.
    const edited = await updateKnowledgeEntryForApi(context, a.caller, faq.id, { content: "Free parking behind the building.", tags: ["parking", "faq", "parking"], priority: 3, active: false });
    expect(edited).toMatchObject({ id: faq.id, type: "faq", title: "Do you park?", content: "Free parking behind the building.", tags: ["parking"], priority: 3, active: false });
    expect(apiKnowledgeEntrySchema.safeParse(edited).success).toBe(true);
    expect(await getKnowledgeEntryForApi(context, a.caller, faq.id)).toEqual(edited);
    const refreshes = async (id: string) => await admin!.db.select({ payload: outboxMessages.payload }).from(outboxMessages).where(and(eq(outboxMessages.topic, "snapshot.refresh"), eq(outboxMessages.aggregateId, id)));
    expect(await refreshes(faq.id)).toContainEqual({ payload: expect.objectContaining({ reason: "snippet_updated" }) });
    const [updatedAudit] = await admin!.db.select({ payload: auditLogs.payload }).from(auditLogs).where(and(eq(auditLogs.entityId, faq.id), eq(auditLogs.eventType, "api.knowledge.updated")));
    expect(updatedAudit?.payload).toMatchObject({ fields: ["content", "tags", "priority", "active"] });
    // A text entry can't turn into an FAQ through its tags.
    expect(await updateKnowledgeEntryForApi(context, a.caller, text.id, { tags: ["faq"] })).toMatchObject({ type: "text", tags: [] });
    // An empty change is refused, and one to the values it already has writes nothing.
    const updatedAt = async () => (await admin!.db.select({ at: knowledgeSnippets.updatedAt }).from(knowledgeSnippets).where(eq(knowledgeSnippets.id, text.id)))[0]!.at.getTime();
    const before = await updatedAt();
    await expectApiError(updateKnowledgeEntryForApi(context, a.caller, text.id, {}), 400, "invalid_request");
    await updateKnowledgeEntryForApi(context, a.caller, text.id, { title: "Holidays", active: true });
    expect(await updatedAt()).toBe(before);

    await expectApiError(getKnowledgeEntryForApi(context, b.caller, faq.id), 404, "not_found");
    await expectApiError(updateKnowledgeEntryForApi(context, b.caller, faq.id, { active: true }), 404, "not_found");
    await expectApiError(deleteKnowledgeEntryForApi(context, b.caller, faq.id), 404, "not_found");
    await deleteKnowledgeEntryForApi(context, a.caller, faq.id);
    await expectApiError(getKnowledgeEntryForApi(context, a.caller, faq.id), 404, "not_found");
    await expectApiError(deleteKnowledgeEntryForApi(context, a.caller, faq.id), 404, "not_found");
    expect(await refreshes(faq.id)).toContainEqual({ payload: expect.objectContaining({ reason: "snippet_deleted" }) });
    expect(await admin!.db.select({ id: auditLogs.id }).from(auditLogs).where(and(eq(auditLogs.entityId, faq.id), eq(auditLogs.eventType, "api.knowledge.deleted")))).toHaveLength(1);
  });

  it("lists websites, pages and files apart, and turns one off or deletes it", async () => {
    const context = { db: worker!.db };
    const website = await createKnowledgeSourceForApi(context, b.caller, { type: "website", url: "https://cedar-api.example" });
    const [page] = await admin!.db.insert(knowledgeDocuments).values({ businessId: b.businessId, sourceType: "website", title: "Menu", sourceUrl: "https://cedar-api.example/menu", status: "indexed" }).returning({ id: knowledgeDocuments.id });
    const [file] = await admin!.db.insert(knowledgeDocuments).values({ businessId: b.businessId, sourceType: "upload", title: "Prices", status: "error", error: "Unreadable." }).returning({ id: knowledgeDocuments.id });
    // A status the API doesn't know reads, and filters, as processing.
    const [queued] = await admin!.db.insert(knowledgeDocuments).values({ businessId: b.businessId, sourceType: "upload", title: "Hours", status: "queued" }).returning({ id: knowledgeDocuments.id });
    await admin!.db.insert(knowledgeChunks).values({ businessId: b.businessId, documentId: page!.id, sequence: 0, content: "Soup of the day.", contentHash: "menu-0" });
    type Filter = { type?: "website" | "page" | "file"; status?: "pending" | "processing" | "indexed" | "error" | "cancelled" };
    const ids = async (filter: Filter, caller: ApiKeyCaller = b.caller) => (await listKnowledgeSourcesForApi(context, caller, filter)).data.map((source) => source.id);
    expect(await ids({})).toEqual(expect.arrayContaining([website.id, page!.id, file!.id, queued!.id]));
    expect(await ids({}, a.caller)).not.toContain(page!.id);
    expect(await ids({ type: "website" })).toContain(website.id);
    expect(await ids({ type: "website" })).not.toContain(page!.id);
    expect(await ids({ type: "page" })).toContain(page!.id);
    expect(await ids({ type: "page" })).not.toContain(website.id);
    expect(await ids({ type: "file", status: "error" })).toContain(file!.id);
    expect(await ids({ type: "file", status: "indexed" })).not.toContain(file!.id);
    expect(await ids({ status: "processing" })).toEqual(expect.arrayContaining([website.id, queued!.id]));
    expect(await getKnowledgeSourceForApi(context, b.caller, queued!.id)).toMatchObject({ type: "file", status: "processing" });
    // One page at a time, with no source on two pages.
    const first = await listKnowledgeSourcesForApi(context, b.caller, { limit: 2 });
    const second = await listKnowledgeSourcesForApi(context, b.caller, { limit: 2, cursor: first.next_cursor! });
    expect(first.has_more).toBe(true);
    expect(second.data).toHaveLength(2);
    expect(second.data.filter((source) => first.data.some((seen) => seen.id === source.id))).toEqual([]);
    const read = await getKnowledgeSourceForApi(context, b.caller, page!.id);
    expect(read).toMatchObject({ type: "page", url: "https://cedar-api.example/menu", page_limit: null, active: true });
    expect(apiKnowledgeSourceSchema.safeParse(read).success).toBe(true);

    expect(await updateKnowledgeSourceForApi(context, b.caller, page!.id, { active: false })).toMatchObject({ id: page!.id, active: false });
    const refreshes = async (id: string) => await admin!.db.select({ payload: outboxMessages.payload }).from(outboxMessages).where(and(eq(outboxMessages.topic, "snapshot.refresh"), eq(outboxMessages.aggregateId, id)));
    expect(await refreshes(page!.id)).toContainEqual({ payload: expect.objectContaining({ reason: "document_activity_changed" }) });
    // Sending the state it already has writes and audits nothing.
    await updateKnowledgeSourceForApi(context, b.caller, page!.id, { active: false });
    expect(await admin!.db.select({ id: auditLogs.id }).from(auditLogs).where(and(eq(auditLogs.entityId, page!.id), eq(auditLogs.eventType, "api.knowledge_source.updated")))).toHaveLength(1);
    expect(await refreshes(page!.id)).toHaveLength(1);
    await expectApiError(updateKnowledgeSourceForApi(context, a.caller, page!.id, { active: true }), 404, "not_found");
    // Crawl actions belong to the website, not its pages.
    await expectApiError(retryKnowledgeSourceForApi(context, b.caller, page!.id), 400, "invalid_request");

    await deleteKnowledgeSourceForApi(context, b.caller, website.id);
    await expectApiError(getKnowledgeSourceForApi(context, b.caller, website.id), 404, "not_found");
    await expectApiError(deleteKnowledgeSourceForApi(context, b.caller, website.id), 404, "not_found");
    // Its crawl goes with it.
    expect(await admin!.db.select({ id: websiteIngestionJobs.id }).from(websiteIngestionJobs).where(eq(websiteIngestionJobs.rootDocumentId, website.id))).toEqual([]);
    expect(await refreshes(website.id)).toContainEqual({ payload: expect.objectContaining({ reason: "document_deleted" }) });
    // The pages its crawl read stay until they are deleted too.
    expect(await getKnowledgeSourceForApi(context, b.caller, page!.id)).toMatchObject({ type: "page" });
    await expectApiError(deleteKnowledgeSourceForApi(context, a.caller, page!.id), 404, "not_found");
    await deleteKnowledgeSourceForApi(context, b.caller, page!.id);
    await expectApiError(getKnowledgeSourceForApi(context, b.caller, page!.id), 404, "not_found");
    expect(await admin!.db.select({ id: knowledgeChunks.id }).from(knowledgeChunks).where(eq(knowledgeChunks.documentId, page!.id))).toEqual([]);
    expect(await admin!.db.select({ id: auditLogs.id }).from(auditLogs).where(and(eq(auditLogs.entityId, page!.id), eq(auditLogs.eventType, "api.knowledge_source.deleted")))).toHaveLength(1);
  });

  it("reads and updates the business type and reads the onboarding stage", async () => {
    const business = await updateBusinessForApi({ db: worker!.db }, a.caller, { business_type: "dental_clinic" });
    expect(business).toMatchObject({ business_type: "dental_clinic", onboarding_stage: "create_business" });
    expect(apiBusinessSchema.safeParse(business).success).toBe(true);
  });

  it("reads billing, keeps a managed plan apart from Polar, and makes checkouts out to the business's own owner", async () => {
    const context = { db: worker!.db };
    // A business of its own, owned at first by the operator, as a platform key's businesses start out.
    const businessId = randomUUID();
    const customerId = randomUUID();
    await admin!.db.insert(businesses).values({ id: businessId, slug: `api-billing-${businessId}`, name: "Billing test", timezone: "UTC", businessType: "test" });
    await admin!.db.insert(businessMemberships).values({ businessId, userId: ownerId, role: "business_owner" });
    const generated = generateApiKey();
    const [key] = await admin!.db.insert(apiKeys).values({ businessId, name: "billing", prefix: generated.prefix, keyHash: generated.keyHash, scopes: ["billing:manage"], createdByUserId: ownerId }).returning({ id: apiKeys.id });
    const caller: ApiKeyCaller = { businessId, apiKeyId: key!.id };
    // An operator's platform key acts as its owner.
    const operator: PlatformKeyCaller = { businessId, platformKeyId: randomUUID(), groupId: "lobbystack", actingUserId: ownerId, actor: "platform_key" };
    const audited = async (eventType: string) => (await admin!.db.select({ id: auditLogs.id }).from(auditLogs).where(and(eq(auditLogs.businessId, businessId), eq(auditLogs.eventType, eventType)))).length;
    const account = async () => (await admin!.db.select({ source: billingAccounts.source, plan: billingAccounts.plan, subscriptionState: billingAccounts.subscriptionState, cap: billingAccounts.overageSpendingCapCents }).from(billingAccounts).where(eq(billingAccounts.businessId, businessId)))[0];
    const payer = async (checkoutId: string) => (await admin!.db.select({ userId: billingCheckoutRequests.requestedByUserId }).from(billingCheckoutRequests).where(eq(billingCheckoutRequests.id, checkoutId)))[0]?.userId;
    try {
      // No billing account yet: the free plan, which has no cap.
      expect(await getBillingForApi(context, caller)).toMatchObject({ plan: "free_cloud", managed: false, spending_cap_cents: null, overage_spend_cents: 0, spending_cap_reached: false });
      await expectApiError(updateBillingForApi(context, caller, { spending_cap_cents: 1_000 }), 409, "conflict");
      // A self-hosted server's business has no limit, so it has no plan to buy.
      await admin!.db.update(businesses).set({ deploymentMode: "self_hosted_standard" }).where(eq(businesses.id, businessId));
      await expectApiError(createCheckoutForApi(context, caller, { plan: "starter", interval: "monthly" }, { available: true }), 409, "conflict");
      await admin!.db.update(businesses).set({ deploymentMode: "cloud" }).where(eq(businesses.id, businessId));

      // A Starter plan that lapsed left a cap behind. The managed plan clears it, or calls would have nothing to reserve.
      await admin!.db.insert(billingAccounts).values({ businessId, billingKey: `business:${businessId}`, plan: "starter", subscriptionState: "canceled", billingInterval: "monthly", overageSpendingCapCents: 500 });
      expect(await getBillingForApi(context, caller)).toMatchObject({ plan: "free_cloud", billing_interval: null, spending_cap_cents: null });
      // A checkout queued before the managed plan stops, so Polar never sells a plan the operator bills.
      const queued = await createCheckoutForApi(context, caller, { plan: "starter", interval: "monthly" }, { available: true });
      // A per-business key makes it out to the key's creator.
      expect(await payer(queued.id)).toBe(ownerId);
      // The lapsed plan left its number on the way out; a managed plan is a paid plan, so it keeps it.
      const e164 = `+1555${String(Date.now()).slice(-7)}`;
      const [number] = await admin!.db.insert(phoneNumbers).values({ businessId, e164, status: "active", reclaimScheduledAt: new Date(Date.now() + 86_400_000), reclaimReason: "subscription_ended" }).returning({ id: phoneNumbers.id });
      const release = async () => (await admin!.db.select({ at: phoneNumbers.reclaimScheduledAt, reason: phoneNumbers.reclaimReason }).from(phoneNumbers).where(eq(phoneNumbers.id, number!.id)))[0];
      const managed = await setManagedPlanForApi(context, operator);
      expect(managed).toMatchObject({ plan: "enterprise", managed: true, subscription_state: "active", billing_interval: null, current_period_end: null, spending_cap_cents: null });
      expect(apiBillingSchema.safeParse(managed).success).toBe(true);
      expect(await account()).toEqual({ source: "managed", plan: "enterprise", subscriptionState: "active", cap: null });
      expect(await getCheckoutForApi(context, caller, queued.id)).toMatchObject({ status: "error", error: "The business moved to a managed plan." });
      expect(await release()).toEqual({ at: null, reason: null });
      // Setting it again changes nothing.
      await setManagedPlanForApi(context, operator);
      expect(await audited("api.billing.managed_plan_set")).toBe(1);
      // LobbyStack bills a managed plan, so it can't be bought through Polar.
      await expectApiError(createCheckoutForApi(context, caller, { plan: "pro", interval: "monthly" }, { available: true }), 409, "conflict");

      // Ending it puts the business on the free plan. The account keeps its managed source for the finance export.
      expect(await endManagedPlanForApi(context, operator)).toMatchObject({ plan: "free_cloud", managed: false });
      expect(await account()).toMatchObject({ source: "managed", plan: "enterprise", subscriptionState: "canceled" });
      // As when a paid plan ends, the number stays 30 more days.
      expect(await release()).toMatchObject({ reason: "subscription_ended", at: expect.any(Date) });
      await expectApiError(endManagedPlanForApi(context, operator), 404, "not_found");
      expect(await audited("api.billing.managed_plan_ended")).toBe(1);

      // While the operator is the only owner, a platform key has no customer to make a checkout out to.
      await expectApiError(createCheckoutForApi(context, operator, { plan: "pro", interval: "monthly" }, { available: true }), 409, "conflict");
      // Once the customer owns it too, the platform key's checkout is made out to them.
      await admin!.db.insert(users).values({ id: customerId, email: `${customerId}@example.invalid`, normalizedEmail: `${customerId}@example.invalid` });
      await admin!.db.insert(businessMemberships).values({ businessId, userId: customerId, role: "business_owner" });
      const checkout = await createCheckoutForApi(context, operator, { plan: "pro", interval: "monthly" }, { available: true });
      expect(checkout).toMatchObject({ plan: "pro", interval: "monthly", status: "pending", checkout_url: null, error: null, paid: false });
      expect(apiCheckoutSchema.safeParse(checkout).success).toBe(true);
      expect(await payer(checkout.id)).toBe(customerId);
      expect(await admin!.db.select({ id: outboxMessages.id }).from(outboxMessages).where(and(eq(outboxMessages.topic, "billing.createCheckout"), eq(outboxMessages.aggregateId, checkout.id)))).toHaveLength(1);
      // As in the dashboard, nobody else can start one while the customer's is open.
      await expectApiError(createCheckoutForApi(context, caller, { plan: "starter", interval: "annual" }, { available: true }), 409, "conflict");
      await expectApiError(createCheckoutForApi(context, caller, { plan: "starter", interval: "annual" }, { available: false }), 409, "conflict");
      expect(await getCheckoutForApi(context, caller, checkout.id)).toMatchObject({ id: checkout.id, status: "pending" });
      await expectApiError(getCheckoutForApi(context, a.caller, checkout.id), 404, "not_found");

      // Once Polar's page exists and the business is on the plan, the checkout reads as paid.
      await admin!.db.update(billingCheckoutRequests).set({ status: "ready", checkoutUrl: "https://polar.example/checkout/1" }).where(eq(billingCheckoutRequests.id, checkout.id));
      await admin!.db.update(billingAccounts).set({ source: "polar", plan: "pro", subscriptionState: "active", billingInterval: "monthly" }).where(eq(billingAccounts.businessId, businessId));
      expect(await getCheckoutForApi(context, caller, checkout.id)).toMatchObject({ status: "ready", checkout_url: "https://polar.example/checkout/1", paid: true });

      // A business paying through Polar can't also get a managed plan, and changes its paid plan in Polar's portal.
      await expectApiError(setManagedPlanForApi(context, operator), 409, "conflict");
      await expectApiError(createCheckoutForApi(context, caller, { plan: "starter", interval: "monthly" }, { available: true }), 409, "conflict");
      // Its spending cap can be set, and sending the same cap again changes nothing.
      expect(await updateBillingForApi(context, caller, { spending_cap_cents: 2_500 })).toMatchObject({ plan: "pro", managed: false, billing_interval: "monthly", spending_cap_cents: 2_500 });
      await updateBillingForApi(context, caller, { spending_cap_cents: 2_500 });
      expect(await audited("api.billing.updated")).toBe(1);
      // As in the dashboard, a Starter business moves up to Pro in the billing portal too.
      await admin!.db.update(billingAccounts).set({ plan: "starter" }).where(eq(billingAccounts.businessId, businessId));
      await expectApiError(createCheckoutForApi(context, caller, { plan: "pro", interval: "annual" }, { available: true }), 409, "conflict");
    } finally {
      // Deleting the business deletes its billing rows, keys and memberships; outbox rows only lose their business.
      await admin!.db.delete(outboxMessages).where(eq(outboxMessages.businessId, businessId));
      await admin!.db.delete(businesses).where(eq(businesses.id, businessId));
      await admin!.db.delete(users).where(eq(users.id, customerId));
    }
  });

  it("claims a free trial number as the dashboard does: once per business, person and phone", async () => {
    const context = { db: worker!.db };
    const personId = randomUUID();
    const phone = `+1416${String(Date.now()).slice(-7)}`;
    await admin!.db.insert(users).values({ id: personId, email: `${personId}@example.invalid`, normalizedEmail: `${personId}@example.invalid`, phone, phoneVerifiedAt: new Date() });
    const businessIds: string[] = [];
    const cloudBusiness = async (label: string, verified = true) => {
      const businessId = randomUUID();
      businessIds.push(businessId);
      // A cloud business on the free plan, still on its first onboarding step.
      await admin!.db.insert(businesses).values({ id: businessId, slug: `api-trial-${label}-${businessId}`, name: `Trial ${label}`, timezone: "America/Toronto", businessType: "test", deploymentMode: "cloud" });
      await admin!.db.insert(businessMemberships).values({ businessId, userId: personId, role: "business_owner" });
      if (verified) await admin!.db.insert(onboardingPhoneVerifications).values({ businessId, userId: personId, phoneE164: phone, countryCode: "CA", status: "approved", approvedAt: new Date(), expiresAt: new Date(Date.now() + 600_000), requestFingerprint: "test" });
      return { businessId, apiKeyId: randomUUID() } satisfies ApiKeyCaller;
    };
    const inventory = { listAvailablePhoneNumbers: async () => [{ phoneE164: testNumber(), countryCode: "CA", capabilities: { sms: false, voice: true } }] };
    const search = async (caller: ApiCaller) => await searchPhoneNumbersForApi(context, caller, {}, { userId: personId, provider: inventory, claimTokenSecret: numberClaimSecret });
    const claim = async (caller: ApiCaller, offerToken: string) => await claimPhoneNumberForApi(context, caller, { offerToken }, { userId: personId, claimTokenSecret: numberClaimSecret });
    try {
      // Without a verified mobile, a free business gets no number, as in the dashboard.
      const unverified = await cloudBusiness("unverified", false);
      await expectApiError(search(unverified), 409, "conflict");

      const first = await cloudBusiness("first");
      const [offer] = await search(first);
      expect(offer).toMatchObject({ country: "CA", trial: true });
      const claimed = await claim(first, offer!.offer_token);
      expect(claimed).toMatchObject({ status: "pending" });
      expect(await admin!.db.select({ status: numberTrials.status, verifiedPhone: numberTrials.verifiedPhone, claimId: numberTrials.claimId, ipHash: numberTrials.ipHash }).from(numberTrials).where(eq(numberTrials.businessId, first.businessId))).toEqual([{ status: "reserved", verifiedPhone: phone, claimId: claimed.id, ipHash: null }]);
      // The trial is used: the business is offered nothing more without a paid plan.
      await expectApiError(search(first), 409, "conflict");

      // Another business of the same person and phone gets no second trial, even through the API.
      const second = await cloudBusiness("second");
      const [again] = await search(second);
      expect(again).toMatchObject({ trial: true });
      await expectApiError(claim(second, again!.offer_token), 409, "conflict");
      expect(await admin!.db.select({ id: numberTrials.id }).from(numberTrials).where(eq(numberTrials.businessId, second.businessId))).toEqual([]);

      // Once the business pays, a trial offer is refused and the paid-plan rules apply.
      await admin!.db.insert(billingAccounts).values({ businessId: second.businessId, billingKey: `business:${second.businessId}`, plan: "starter", subscriptionState: "active", billingInterval: "monthly" });
      await expectApiError(claim(second, again!.offer_token), 409, "conflict");
      const [paid] = await search(second);
      expect(paid).toMatchObject({ trial: false });
      expect(await claim(second, paid!.offer_token)).toMatchObject({ status: "pending" });
    } finally {
      await admin!.db.delete(outboxMessages).where(inArray(outboxMessages.businessId, businessIds));
      await admin!.db.delete(businesses).where(inArray(businesses.id, businessIds));
      await admin!.db.delete(users).where(eq(users.id, personId));
    }
  });

  it("gives each customer of one integration a free trial number, and each key's account one at most", async () => {
    const context = { db: worker!.db };
    const people: string[] = [];
    const businessIds: string[] = [];
    const inventory = { listAvailablePhoneNumbers: async () => [{ phoneE164: testNumber(), countryCode: "CA", capabilities: { sms: false, voice: true } }] };
    const person = async () => {
      const personId = randomUUID();
      const phone = `+1647${String(Date.now() + people.length).slice(-7)}`;
      people.push(personId);
      await admin!.db.insert(users).values({ id: personId, email: `${personId}@example.invalid`, normalizedEmail: `${personId}@example.invalid`, phone, phoneVerifiedAt: new Date() });
      return { personId, phone };
    };
    const trialBusiness = async (owner: { personId: string; phone: string }) => {
      const businessId = randomUUID();
      businessIds.push(businessId);
      await admin!.db.insert(businesses).values({ id: businessId, slug: `api-trial-integration-${businessId}`, name: "Trial integration", timezone: "America/Toronto", businessType: "test", deploymentMode: "cloud" });
      await admin!.db.insert(onboardingPhoneVerifications).values({ businessId, userId: owner.personId, phoneE164: owner.phone, countryCode: "CA", status: "approved", approvedAt: new Date(), expiresAt: new Date(Date.now() + 600_000), requestFingerprint: "test" });
      return businessId;
    };
    const claimTrial = async (caller: ApiCaller, userId: string) => {
      const [offer] = await searchPhoneNumbersForApi(context, caller, {}, { userId, provider: inventory, claimTokenSecret: numberClaimSecret });
      expect(offer).toMatchObject({ trial: true });
      return await claimPhoneNumberForApi(context, caller, { offerToken: offer!.offer_token }, { userId, claimTokenSecret: numberClaimSecret });
    };
    try {
      // Customers of one platform claim from the same addresses, so the API doesn't count trials per network.
      for (let customer = 0; customer < 3; customer += 1) {
        const owner = await person();
        const businessId = await trialBusiness(owner);
        expect(await claimTrial({ businessId, apiKeyId: randomUUID() }, owner.personId)).toMatchObject({ status: "pending" });
        expect(await admin!.db.select({ ipHash: numberTrials.ipHash }).from(numberTrials).where(eq(numberTrials.businessId, businessId))).toEqual([{ ipHash: null }]);
      }
      // A key acts as one person, who gets one trial: a platform key's second business pays for its number.
      const keyOwner = await person();
      const platform = (businessId: string): PlatformKeyCaller => ({ businessId, platformKeyId: randomUUID(), groupId: "acme", actingUserId: keyOwner.personId, actor: "platform_key" });
      const firstBusiness = await trialBusiness(keyOwner);
      expect(await claimTrial(platform(firstBusiness), keyOwner.personId)).toMatchObject({ status: "pending" });
      const secondBusiness = await trialBusiness(keyOwner);
      await expectApiError(claimTrial(platform(secondBusiness), keyOwner.personId), 409, "conflict");
      expect(await admin!.db.select({ id: numberTrials.id }).from(numberTrials).where(eq(numberTrials.businessId, secondBusiness))).toEqual([]);
    } finally {
      await admin!.db.delete(outboxMessages).where(inArray(outboxMessages.businessId, businessIds));
      await admin!.db.delete(businesses).where(inArray(businesses.id, businessIds));
      await admin!.db.delete(users).where(inArray(users.id, people));
    }
  });

  it("searches, claims, replaces and releases a number, whatever the onboarding stage", async () => {
    const context = { db: worker!.db };
    const businessId = randomUUID();
    await admin!.db.insert(businesses).values({ id: businessId, slug: `api-numbers-${businessId}`, name: "Numbers test", timezone: "America/Toronto", businessType: "test" });
    await admin!.db.insert(businessMemberships).values({ businessId, userId: ownerId, role: "business_owner" });
    const generated = generateApiKey();
    const [key] = await admin!.db.insert(apiKeys).values({ businessId, name: "numbers", prefix: generated.prefix, keyHash: generated.keyHash, scopes: ["phone_numbers:manage"], createdByUserId: ownerId }).returning({ id: apiKeys.id });
    const caller: ApiKeyCaller = { businessId, apiKeyId: key!.id };
    const firstNumber = testNumber();
    const secondNumber = testNumber(firstNumber);
    let available = firstNumber;
    const inventory = { listAvailablePhoneNumbers: async () => [{ phoneE164: available, locality: "Toronto", region: "ON", countryCode: "CA", capabilities: { sms: true, voice: true } }] };
    const search = async (input: Parameters<typeof searchPhoneNumbersForApi>[2] = {}) => await searchPhoneNumbersForApi(context, caller, input, { userId: ownerId, provider: inventory, claimTokenSecret: numberClaimSecret });
    const claim = async (offerToken: string, options: { replaces?: string; userId?: string; as?: ApiCaller } = {}) => await claimPhoneNumberForApi(context, options.as ?? caller, { offerToken, replaces: options.replaces }, { userId: options.userId ?? ownerId, claimTokenSecret: numberClaimSecret });
    const audited = async (eventType: string) => (await admin!.db.select({ id: auditLogs.id }).from(auditLogs).where(and(eq(auditLogs.businessId, businessId), eq(auditLogs.eventType, eventType)))).length;
    const queued = async (topic: string, aggregateId: string) => (await admin!.db.select({ id: outboxMessages.id }).from(outboxMessages).where(and(eq(outboxMessages.topic, topic), eq(outboxMessages.aggregateId, aggregateId)))).length;
    try {
      // A number needs a paid plan.
      await expectApiError(search(), 409, "conflict");
      await admin!.db.insert(billingAccounts).values({ businessId, billingKey: `business:${businessId}`, plan: "pro", subscriptionState: "active", billingInterval: "monthly" });
      // The API ignores the onboarding stage order: this business hasn't finished its first step.
      const offers = await search({ area_code: "416" });
      expect(offers).toEqual([expect.objectContaining({ phone_number: firstNumber, country: "CA", kind: "local", locality: "Toronto", region: "ON", capabilities: { voice: true, sms: true }, trial: false })]);
      expect(apiPhoneNumberOfferSchema.safeParse(offers[0]).success).toBe(true);
      const token = offers[0]!.offer_token;

      // An offer works only for its business and account, before it expires, and as what it was searched for.
      await expectApiError(claim(token, { userId: randomUUID() }), 400, "invalid_request");
      await expectApiError(claim(token, { as: a.caller }), 400, "invalid_request");
      await expectApiError(claim(`${token}x`), 400, "invalid_request");
      const later = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 6 * 60_000);
      try {
        await expectApiError(claim(token), 400, "invalid_request");
      } finally {
        later.mockRestore();
      }
      await expectApiError(claim(token, { replaces: randomUUID() }), 400, "invalid_request");

      // A retry with the same Idempotency-Key gets the same claim back and buys nothing more.
      const scope = { businessId, apiKeyId: key!.id, operation: "createPhoneNumberClaim", key: `claim-${randomUUID()}` };
      const claimOnce = async (transactional: typeof context) => ({ status: 202, body: JSON.stringify({ data: await claimPhoneNumberForApi(transactional, caller, { offerToken: token }, { userId: ownerId, claimTokenSecret: numberClaimSecret }) }) });
      const first = await runIdempotent(context, scope, "claim-hash", claimOnce);
      expect(await runIdempotent(context, scope, "claim-hash", claimOnce)).toEqual({ replayed: true, response: first.response });
      expect(await admin!.db.select({ id: onboardingNumberClaimEvents.id }).from(onboardingNumberClaimEvents).where(eq(onboardingNumberClaimEvents.businessId, businessId))).toHaveLength(1);
      const claimed = (JSON.parse(String(first.response.body)) as { data: Awaited<ReturnType<typeof claimPhoneNumberForApi>> }).data;
      expect(claimed).toMatchObject({ status: "pending", phone_number: firstNumber, phone_number_id: null, replaces_phone_number_id: null, error: null });
      expect(apiPhoneNumberClaimSchema.safeParse(claimed).success).toBe(true);
      expect(await getPhoneNumberClaimForApi(context, caller, claimed.id)).toEqual(claimed);
      await expectApiError(getPhoneNumberClaimForApi(context, a.caller, claimed.id), 404, "not_found");
      expect(await queued("phoneNumber.provision", claimed.id)).toBe(1);
      // A business that isn't on the number step stays on its own step while the number is bought.
      expect((await admin!.db.select({ stage: businesses.onboardingStage }).from(businesses).where(eq(businesses.id, businessId)))[0]?.stage).toBe("create_business");
      // One claim at a time.
      await expectApiError(claim((await search())[0]!.offer_token), 409, "conflict");

      // The worker buys the number.
      expect(await claimNumberProvisioning(context, { businessId, claimId: claimed.id })).toMatchObject({ e164: firstNumber });
      expect(await getPhoneNumberClaimForApi(context, caller, claimed.id)).toMatchObject({ status: "provisioning" });
      const numberId = await completeNumberProvisioning(context, { businessId, claimId: claimed.id, e164: firstNumber, providerPhoneId: `PN${randomUUID().replaceAll("-", "")}`, voiceUrl: "sip-trunk:TK0", smsUrl: "https://app.example.com/api/webhooks/twilio/sms" });
      expect(await getPhoneNumberClaimForApi(context, caller, claimed.id)).toMatchObject({ status: "claimed", phone_number_id: numberId });
      const listed = await listPhoneNumbersForApi(context, caller);
      expect(listed).toEqual([expect.objectContaining({ id: numberId, phone_number: firstNumber, status: "active", release_scheduled_at: null })]);
      expect(apiPhoneNumberSchema.safeParse(listed[0]).success).toBe(true);
      expect(await listPhoneNumbersForApi(context, a.caller)).not.toContainEqual(expect.objectContaining({ id: numberId }));
      // A business keeps one number.
      await expectApiError(claim((await search())[0]!.offer_token), 409, "conflict");

      // A replacement offer is for a different number, and only /replace takes it.
      await expectApiError(search({ replaces: randomUUID() }), 404, "not_found");
      available = secondNumber;
      const replacement = (await search({ replaces: numberId }))[0]!.offer_token;
      await expectApiError(claim(replacement), 400, "invalid_request");
      const replacing = await claim(replacement, { replaces: numberId });
      expect(replacing).toMatchObject({ status: "pending", phone_number: secondNumber, replaces_phone_number_id: numberId });
      await expectApiError(claim((await search({ replaces: numberId }))[0]!.offer_token, { replaces: numberId }), 409, "conflict");
      expect(await audited("api.phone_number.claim_started")).toBe(2);
      // Releasing the old number now would make the replacement fail and leave the business with no number.
      await expectApiError(releasePhoneNumberForApi(context, caller, numberId), 409, "conflict");

      // Once the new number is live, the old one keeps working for 30 days.
      await claimNumberProvisioning(context, { businessId, claimId: replacing.id });
      const newNumberId = await completeNumberProvisioning(context, { businessId, claimId: replacing.id, e164: secondNumber, providerPhoneId: `PN${randomUUID().replaceAll("-", "")}`, voiceUrl: "sip-trunk:TK0", smsUrl: "https://app.example.com/api/webhooks/twilio/sms" });
      const both = await listPhoneNumbersForApi(context, caller);
      expect(both).toEqual(expect.arrayContaining([expect.objectContaining({ id: newNumberId, status: "active", release_scheduled_at: null }), expect.objectContaining({ id: numberId, status: "active", release_scheduled_at: expect.any(String) })]));
      expect(Date.parse(both.find((number) => number.id === numberId)!.release_scheduled_at!)).toBeGreaterThan(Date.now() + 29 * 24 * 60 * 60_000);
      // A business replaces its number once.
      await expectApiError(search({ replaces: newNumberId }), 409, "conflict");

      // Releasing the old number now does it at once, and only once.
      const released = await releasePhoneNumberForApi(context, caller, numberId);
      expect(released).toMatchObject({ id: numberId, status: "active" });
      expect(Date.parse(released.release_scheduled_at!)).toBeLessThanOrEqual(Date.now());
      expect(await releasePhoneNumberForApi(context, caller, numberId)).toEqual(released);
      expect(await audited("api.phone_number.release_scheduled")).toBe(1);
      expect(await queued("phoneNumber.reclaim", numberId)).toBe(1);
      await expectApiError(releasePhoneNumberForApi(context, caller, randomUUID()), 404, "not_found");
      await expectApiError(releasePhoneNumberForApi(context, a.caller, numberId), 404, "not_found");
    } finally {
      // Deleting the business deletes its numbers, claims, keys and memberships; outbox rows only lose their business.
      await admin!.db.delete(outboxMessages).where(eq(outboxMessages.businessId, businessId));
      await admin!.db.delete(businesses).where(eq(businesses.id, businessId));
    }
  });

  it("puts a business back on its own onboarding step when an API claim fails or is abandoned", async () => {
    const context = { db: worker!.db };
    const businessId = randomUUID();
    // An account of its own, so these claims never count against another test's limits.
    const userId = randomUUID();
    await admin!.db.insert(users).values({ id: userId, email: `${userId}@example.invalid`, normalizedEmail: `${userId}@example.invalid` });
    await admin!.db.insert(businesses).values({ id: businessId, slug: `api-claim-stage-${businessId}`, name: "Claim stage", timezone: "America/Toronto", businessType: "test", onboardingStage: "website" });
    await admin!.db.insert(businessMemberships).values({ businessId, userId, role: "business_owner" });
    await admin!.db.insert(billingAccounts).values({ businessId, billingKey: `business:${businessId}`, plan: "pro", subscriptionState: "active", billingInterval: "monthly" });
    const caller: ApiKeyCaller = { businessId, apiKeyId: randomUUID() };
    const inventory = { listAvailablePhoneNumbers: async () => [{ phoneE164: testNumber(), countryCode: "CA", capabilities: { sms: true, voice: true } }] };
    const claim = async () => {
      const [offer] = await searchPhoneNumbersForApi(context, caller, {}, { userId, provider: inventory, claimTokenSecret: numberClaimSecret });
      return await claimPhoneNumberForApi(context, caller, { offerToken: offer!.offer_token }, { userId, claimTokenSecret: numberClaimSecret });
    };
    const stage = async () => (await admin!.db.select({ stage: businesses.onboardingStage }).from(businesses).where(eq(businesses.id, businessId)))[0]?.stage;
    // Moves the business's claims out of the last hour, so the hourly claim limit doesn't apply, and leaves a reserved one abandoned.
    const anHourAgo = async () => { await admin!.db.update(onboardingNumberClaimEvents).set({ reservedAt: new Date(Date.now() - 61 * 60_000), updatedAt: new Date(Date.now() - 61 * 60_000) }).where(eq(onboardingNumberClaimEvents.businessId, businessId)); };
    const failed = async (claimId: string) => {
      await claimNumberProvisioning(context, { businessId, claimId });
      await failNumberProvisioning(context, { businessId, claimId, unavailable: true });
      expect(await getPhoneNumberClaimForApi(context, caller, claimId)).toMatchObject({ status: "failed" });
    };
    const abandoned = async (claimId: string) => {
      await anHourAgo();
      expect(await getPhoneNumberClaimForApi(context, caller, claimId)).toMatchObject({ status: "failed" });
    };
    try {
      // A platform key's business still on its website step stays there through a claim, and after one that fails or is abandoned.
      const first = await claim();
      expect(await stage()).toBe("website");
      await failed(first.id);
      expect(await stage()).toBe("website");
      await anHourAgo();
      await abandoned((await claim()).id);
      expect(await stage()).toBe("website");

      // A business on the number step claims one, and goes back to picking one if that fails or is abandoned.
      await admin!.db.update(businesses).set({ onboardingStage: "phone_number" }).where(eq(businesses.id, businessId));
      const onStep = await claim();
      expect(await stage()).toBe("phone_number_claiming");
      await failed(onStep.id);
      expect(await stage()).toBe("phone_number");
      await anHourAgo();
      await claim();
      expect(await stage()).toBe("phone_number_claiming");
      const [pending] = await admin!.db.select({ id: onboardingNumberClaimEvents.id }).from(onboardingNumberClaimEvents).where(and(eq(onboardingNumberClaimEvents.businessId, businessId), eq(onboardingNumberClaimEvents.status, "reserved")));
      await abandoned(pending!.id);
      expect(await stage()).toBe("phone_number");
    } finally {
      await admin!.db.delete(outboxMessages).where(eq(outboxMessages.businessId, businessId));
      await admin!.db.delete(businesses).where(eq(businesses.id, businessId));
      await admin!.db.delete(users).where(eq(users.id, userId));
    }
  });

  it("fails claims no worker will finish, so polling ends and a late worker buys nothing", async () => {
    const context = { db: worker!.db };
    const businessId = randomUUID();
    // An account of its own, so these claims never count against another test's limits.
    const userId = randomUUID();
    const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);
    const replacementReservedAt = minutesAgo(16);
    await admin!.db.insert(users).values({ id: userId, email: `${userId}@example.invalid`, normalizedEmail: `${userId}@example.invalid` });
    await admin!.db.insert(businesses).values({ id: businessId, slug: `api-stale-claims-${businessId}`, name: "Stale claims", timezone: "America/Toronto", businessType: "test", onboardingStage: "phone_number_claiming", phoneNumberReplacementReservedAt: replacementReservedAt });
    const [number] = await admin!.db.insert(phoneNumbers).values({ businessId, e164: testNumber() }).returning({ id: phoneNumbers.id });
    const caller: ApiKeyCaller = { businessId, apiKeyId: randomUUID() };
    const insertClaim = async (values: { status: string; reservedAt?: Date; updatedAt?: Date; purpose?: string; replacingPhoneNumberId?: string }) => (await admin!.db.insert(onboardingNumberClaimEvents).values({ businessId, userId, requestedE164: testNumber(), selectionContext: {}, claimTokenHash: "test", idempotencyKey: randomUUID(), ...values }).returning({ id: onboardingNumberClaimEvents.id }))[0]!.id;
    const business = async () => (await admin!.db.select({ stage: businesses.onboardingStage, replacementReservedAt: businesses.phoneNumberReplacementReservedAt }).from(businesses).where(eq(businesses.id, businessId)))[0];
    try {
      const unclaimed = await insertClaim({ status: "reserved", reservedAt: minutesAgo(20) });
      const stalled = await insertClaim({ status: "provisioning", reservedAt: minutesAgo(40), updatedAt: minutesAgo(31) });
      const replacement = await insertClaim({ status: "reserved", purpose: "replacement", replacingPhoneNumberId: number!.id, reservedAt: replacementReservedAt });
      const fresh = await insertClaim({ status: "provisioning", reservedAt: minutesAgo(5), updatedAt: minutesAgo(1) });
      // Releasing the number fails its abandoned replacement first, so a worker that takes it up late buys nothing.
      expect(await releasePhoneNumberForApi(context, caller, number!.id)).toMatchObject({ id: number!.id, status: "active", release_scheduled_at: expect.any(String) });
      expect(await claimNumberProvisioning(context, { businessId, claimId: replacement })).toBeNull();
      expect(await claimNumberProvisioning(context, { businessId, claimId: unclaimed })).toBeNull();
      expect(await getPhoneNumberClaimForApi(context, caller, replacement)).toMatchObject({ status: "failed", error: "Number replacement reservation expired." });
      expect(await getPhoneNumberClaimForApi(context, caller, unclaimed)).toMatchObject({ status: "failed", error: "Number claim reservation expired." });
      expect(await getPhoneNumberClaimForApi(context, caller, stalled)).toMatchObject({ status: "failed", error: "Number provisioning stalled." });
      expect(await getPhoneNumberClaimForApi(context, caller, fresh)).toMatchObject({ status: "provisioning", error: null });
      // As after a failed purchase, the business picks a number again and its replacement reservation is freed.
      expect(await business()).toEqual({ stage: "phone_number", replacementReservedAt: null });
    } finally {
      await admin!.db.delete(outboxMessages).where(eq(outboxMessages.businessId, businessId));
      await admin!.db.delete(businesses).where(eq(businesses.id, businessId));
      await admin!.db.delete(users).where(eq(users.id, userId));
    }
  });

  it("reports onboarding in any order and finishes it once, when the business is ready", async () => {
    const context = { db: worker!.db };
    const businessId = randomUUID();
    await admin!.db.insert(businesses).values({ id: businessId, slug: `api-onboarding-${businessId}`, name: "Onboarding test", timezone: "America/Toronto", businessType: "test", onboardingStage: "website" });
    await admin!.db.insert(businessMemberships).values({ businessId, userId: ownerId, role: "business_owner" });
    const caller: ApiKeyCaller = { businessId, apiKeyId: randomUUID() };
    const audited = async (eventType: string) => (await admin!.db.select({ id: auditLogs.id }).from(auditLogs).where(and(eq(auditLogs.businessId, businessId), eq(auditLogs.eventType, eventType)))).length;
    const status = async () => Object.fromEntries((await getOnboardingForApi(context, caller)).checklist.map((entry) => [entry.id, entry.status]));
    try {
      const start = await getOnboardingForApi(context, caller);
      expect(apiOnboardingSchema.safeParse(start).success).toBe(true);
      expect(start).toEqual({
        stage: "website",
        complete: false,
        checklist: [
          { id: "business_details", status: "done", required: true },
          { id: "knowledge", status: "missing", required: false },
          // Without a saved profile the business answers with the default greeting.
          { id: "greeting", status: "done", required: false },
          { id: "plan", status: "skipped", required: false },
          { id: "phone_number", status: "missing", required: false },
          // With no website crawl there is nothing more to read.
          { id: "full_site_read", status: "done", required: false },
          { id: "test_call", status: "missing", required: false },
        ],
        missing: [],
      });

      // Knowledge and an answered call count however they were added.
      await createKnowledgeEntryForApi(context, caller, { type: "text", title: "Hours", content: "Open every day." });
      await admin!.db.insert(calls).values({ businessId, providerCallId: randomUUID(), transport: "voice", startedAt: new Date(), mediaStartedAt: new Date(), endedAt: new Date() });
      expect(await status()).toMatchObject({ knowledge: "done", test_call: "done" });
      // On a paid plan a number is required, so finishing too early says it's missing.
      await admin!.db.insert(billingAccounts).values({ businessId, billingKey: `business:${businessId}`, plan: "pro", subscriptionState: "active", billingInterval: "monthly" });
      expect(await getOnboardingForApi(context, caller)).toMatchObject({ missing: ["phone_number"] });
      expect(await status()).toMatchObject({ plan: "done", phone_number: "missing" });
      // A self-hosted server sells no plan, so the same live account there leaves the plan skipped and the number optional.
      await admin!.db.update(businesses).set({ deploymentMode: "self_hosted_standard" }).where(eq(businesses.id, businessId));
      expect(await getOnboardingForApi(context, caller)).toMatchObject({ missing: [], checklist: expect.arrayContaining([{ id: "plan", status: "skipped", required: false }, { id: "phone_number", status: "missing", required: false }]) });
      await admin!.db.update(businesses).set({ deploymentMode: "cloud" }).where(eq(businesses.id, businessId));
      const early = await completeOnboardingForApi(context, caller, {}).then(() => null, (error: unknown) => error);
      expect(early).toBeInstanceOf(PublicApiError);
      expect(early).toMatchObject({ status: 409, code: "conflict", details: [{ path: "phone_number", message: expect.stringContaining("skip_number") }] });

      // Skipping replaces the list, and the same list again changes nothing.
      expect(await updateOnboardingForApi(context, caller, { skip_steps: ["phone_number", "full_site_read"] })).toMatchObject({ missing: [] });
      expect(await status()).toMatchObject({ phone_number: "skipped", full_site_read: "done" });
      await updateOnboardingForApi(context, caller, { skip_steps: ["full_site_read", "phone_number"] });
      expect(await audited("api.onboarding.updated")).toBe(1);
      expect(await updateOnboardingForApi(context, caller, { skip_steps: [] })).toMatchObject({ missing: ["phone_number"] });
      expect((await admin!.db.select({ skipped: businesses.setupGuideSkippedSteps }).from(businesses).where(eq(businesses.id, businessId)))[0]?.skipped).toEqual([]);

      // skip_number finishes without one.
      const done = await completeOnboardingForApi(context, caller, { source: "podcast", skip_number: true });
      expect(done).toMatchObject({ stage: "complete", complete: true, missing: [] });
      // The dashboard sees a finished business, and its owner gets the founder's check-in.
      expect((await admin!.db.select({ stage: businesses.onboardingStage, attribution: businesses.onboardingAttribution }).from(businesses).where(eq(businesses.id, businessId)))[0]).toEqual({ stage: "complete", attribution: "podcast" });
      expect(await admin!.db.select({ id: outboxMessages.id }).from(outboxMessages).where(and(eq(outboxMessages.businessId, businessId), eq(outboxMessages.topic, "onboarding.sendFollowup")))).toHaveLength(1);
      // Finishing again changes nothing.
      expect(await completeOnboardingForApi(context, caller, { source: "radio" })).toEqual(done);
      expect(await audited("api.onboarding.completed")).toBe(1);
    } finally {
      await admin!.db.delete(outboxMessages).where(eq(outboxMessages.businessId, businessId));
      await admin!.db.delete(calls).where(eq(calls.businessId, businessId));
      await admin!.db.delete(businesses).where(eq(businesses.id, businessId));
    }
  });

  it("credits no referral and sends no founder's check-in for a business someone else onboarded", async () => {
    const context = { db: worker!.db };
    const groupBusinessId = randomUUID();
    const operatorBusinessId = randomUUID();
    for (const [id, label] of [[groupBusinessId, "group"], [operatorBusinessId, "operator"]] as const) {
      await admin!.db.insert(businesses).values({ id, slug: `api-onboarding-${label}-${id}`, name: `Onboarded by ${label}`, timezone: "UTC", businessType: "test" });
    }
    await admin!.db.insert(platformKeyBusinesses).values({ businessId: groupBusinessId, groupId: "acme" });
    const followUps = async (businessId: string) => (await admin!.db.select({ id: outboxMessages.id }).from(outboxMessages).where(and(eq(outboxMessages.businessId, businessId), eq(outboxMessages.topic, "onboarding.sendFollowup")))).length;
    try {
      // A business a group's platform keys onboarded: even a key of the business's own can't credit a referral, and its check-in would reach the key's account.
      const keyCaller: ApiKeyCaller = { businessId: groupBusinessId, apiKeyId: randomUUID() };
      await expectApiError(completeOnboardingForApi(context, keyCaller, { referral_code: "friend" }, { attribution: { context, referredUserId: ownerId } }), 400, "invalid_request");
      expect(await completeOnboardingForApi(context, keyCaller, {})).toMatchObject({ stage: "complete", complete: true });
      expect(await followUps(groupBusinessId)).toBe(0);
      // A business an operator's platform key finished.
      const platform: PlatformKeyCaller = { businessId: operatorBusinessId, platformKeyId: randomUUID(), groupId: "lobbystack", actingUserId: ownerId, actor: "platform_key" };
      expect(await completeOnboardingForApi(context, platform, {})).toMatchObject({ stage: "complete", complete: true });
      expect(await followUps(operatorBusinessId)).toBe(0);
    } finally {
      await admin!.db.delete(outboxMessages).where(inArray(outboxMessages.businessId, [groupBusinessId, operatorBusinessId]));
      await admin!.db.delete(businesses).where(inArray(businesses.id, [groupBusinessId, operatorBusinessId]));
    }
  });

  it("manages the team and hands the business over with a claim link", async () => {
    const context = { db: worker!.db };
    const businessId = randomUUID();
    const customerId = randomUUID();
    const viewerId = randomUUID();
    const coOwnerId = randomUUID();
    const customerEmail = `${customerId}@example.invalid`;
    for (const userId of [customerId, viewerId, coOwnerId]) await admin!.db.insert(users).values({ id: userId, email: `${userId}@example.invalid`, normalizedEmail: `${userId}@example.invalid`, name: userId === viewerId ? "Vic" : "Cam" });
    await admin!.db.insert(businesses).values({ id: businessId, slug: `api-team-${businessId}`, name: "Team test", timezone: "UTC", businessType: "test" });
    // The operator owns what its platform key set up, until it hands it over.
    // Two statements, so the owner joined first.
    await admin!.db.insert(businessMemberships).values({ businessId, userId: ownerId, role: "business_owner" });
    await admin!.db.insert(businessMemberships).values({ businessId, userId: viewerId, role: "viewer" });
    const platform: PlatformKeyCaller = { businessId, platformKeyId: randomUUID(), groupId: "lobbystack", actingUserId: ownerId, actor: "platform_key" };
    const audited = async (eventType: string) => (await admin!.db.select({ id: auditLogs.id }).from(auditLogs).where(and(eq(auditLogs.businessId, businessId), eq(auditLogs.eventType, eventType)))).length;
    try {
      const team = await getTeamForApi(context, platform);
      expect(apiTeamSchema.safeParse(team).success).toBe(true);
      expect(team.members.map((member) => [member.user_id, member.role])).toEqual([[ownerId, "business_owner"], [viewerId, "viewer"]]);
      const owner = team.members.find((member) => member.user_id === ownerId)!;
      const viewer = team.members.find((member) => member.user_id === viewerId)!;
      expect(viewer).toMatchObject({ name: "Vic", email: `${viewerId}@example.invalid` });

      // An invitation emails its link, and can be revoked once.
      const invitation = await createTeamInvitationForApi(context, platform, { email: " Sam@Example.com ", role: "scheduler" }, { userId: ownerId });
      expect(invitation).toMatchObject({ email: "sam@example.com", role: "scheduler", status: "pending", transfers_ownership: false });
      expect(await admin!.db.select({ id: outboxMessages.id }).from(outboxMessages).where(and(eq(outboxMessages.topic, "email.send"), eq(outboxMessages.aggregateId, invitation.id)))).toHaveLength(1);
      await expectApiError(createTeamInvitationForApi(context, platform, { email: "sam@example.com, kai@example.com", role: "viewer" }, { userId: ownerId }), 400, "invalid_request");
      await revokeTeamInvitationForApi(context, platform, invitation.id);
      await expectApiError(revokeTeamInvitationForApi(context, platform, invitation.id), 404, "not_found");

      // Roles change once, and the last owner stays.
      expect(await updateTeamMemberForApi(context, platform, viewer.id, { role: "scheduler" })).toMatchObject({ id: viewer.id, role: "scheduler" });
      await updateTeamMemberForApi(context, platform, viewer.id, { role: "scheduler" });
      expect(await audited("api.team.member_updated")).toBe(1);
      await expectApiError(updateTeamMemberForApi(context, platform, owner.id, { role: "viewer" }), 409, "conflict");
      await expectApiError(removeTeamMemberForApi(context, platform, owner.id), 409, "conflict");
      await expectApiError(updateTeamMemberForApi(context, platform, randomUUID(), { role: "viewer" }), 404, "not_found");

      // Only an owner hands the business over, and a link stops working once its sender isn't one.
      await expectApiError(createClaimLinkForApi(context, platform, { email: customerEmail }, { userId: viewerId }), 409, "conflict");
      const accept = async (url: string) => await acceptInvitation({ db: app!.db }, { userId: customerId, tokenHash: createHash("sha256").update(new URL(url).searchParams.get("token")!).digest("hex"), email: customerEmail, emailVerified: true });
      await admin!.db.insert(businessMemberships).values({ businessId, userId: coOwnerId, role: "business_owner" });
      const coOwner = (await getTeamForApi(context, platform)).members.find((member) => member.user_id === coOwnerId)!;
      const stale = await createClaimLinkForApi(context, platform, { email: customerEmail }, { userId: coOwnerId });
      await updateTeamMemberForApi(context, platform, coOwner.id, { role: "viewer" });
      await expect(accept(stale.url)).rejects.toMatchObject({ status: 409 });
      await removeTeamMemberForApi(context, platform, coOwner.id);
      // A new claim link replaces the open one.
      await createClaimLinkForApi(context, platform, { email: customerEmail }, { userId: ownerId });
      const link = await createClaimLinkForApi(context, platform, { email: customerEmail }, { userId: ownerId });
      expect(link.invitation).toMatchObject({ email: customerEmail, role: "business_owner", status: "pending", transfers_ownership: true });
      expect((await getTeamForApi(context, platform)).invitations.map((open) => open.id)).toEqual([link.invitation.id]);

      // A group's platform key onboarded the business, and the operator's account made an API key for it.
      await admin!.db.insert(platformKeyBusinesses).values({ businessId, groupId: "acme" });
      const generated = generateApiKey();
      const [operatorKey] = await admin!.db.insert(apiKeys).values({ businessId, name: "operator", prefix: generated.prefix, keyHash: generated.keyHash, scopes: ["business:read"], createdByUserId: ownerId }).returning({ id: apiKeys.id });
      const groupAccess = () => requirePlatformBusinessAccess(context, { businessId, groupId: "acme", access: "group" });
      const listed = async () => (await listBusinessesForApi(context, { groupId: "acme", limit: 100 })).data.map((business) => business.id);
      await groupAccess();
      expect(await listed()).toContain(businessId);

      // The owner accepts it in the dashboard: the business is theirs and opens for them, and the operator loses its access.
      expect(await accept(link.url)).toEqual({ businessId, role: "business_owner", partnerId: null });
      expect((await admin!.db.select({ active: users.activeBusinessId }).from(users).where(eq(users.id, customerId)))[0]?.active).toBe(businessId);
      // The claim removes the link, so the group's keys lose the business and GET /businesses stops listing it.
      expect(await admin!.db.select({ groupId: platformKeyBusinesses.groupId }).from(platformKeyBusinesses).where(eq(platformKeyBusinesses.businessId, businessId))).toEqual([]);
      await expectApiError(groupAccess(), 404, "not_found");
      expect(await listed()).not.toContain(businessId);
      // A key with access to every business still reaches it.
      await requirePlatformBusinessAccess(context, { businessId, groupId: "lobbystack", access: "all" });
      expect((await admin!.db.select({ revokedAt: apiKeys.revokedAt }).from(apiKeys).where(eq(apiKeys.id, operatorKey!.id)))[0]?.revokedAt).toBeInstanceOf(Date);
      const handedOver = await getTeamForApi(context, platform);
      expect(handedOver.members.map((member) => [member.user_id, member.role]).sort()).toEqual([[customerId, "business_owner"], [viewerId, "scheduler"]].sort());
      expect(handedOver.invitations).toEqual([]);
      await removeTeamMemberForApi(context, platform, viewer.id);
      expect((await getTeamForApi(context, platform)).members.map((member) => member.user_id)).toEqual([customerId]);
    } finally {
      await admin!.db.delete(outboxMessages).where(eq(outboxMessages.businessId, businessId));
      await admin!.db.delete(businesses).where(eq(businesses.id, businessId));
      await admin!.db.delete(users).where(inArray(users.id, [customerId, viewerId, coOwnerId]));
    }
  });

  it("creates a widget key the widget can resolve, and changes it", async () => {
    const context = { db: worker!.db };
    const businessId = randomUUID();
    await admin!.db.insert(businesses).values({ id: businessId, slug: `api-widget-${businessId}`, name: "Widget test", timezone: "UTC", businessType: "test" });
    const caller: ApiKeyCaller = { businessId, apiKeyId: randomUUID() };
    const audited = async (eventType: string) => (await admin!.db.select({ id: auditLogs.id }).from(auditLogs).where(and(eq(auditLogs.businessId, businessId), eq(auditLogs.eventType, eventType)))).length;
    const resolve = async (key: string) => (await worker!.db.execute<{ business_id: string }>(sql`select business_id from app.resolve_business_by_widget_key(${createHash("sha256").update(key).digest("hex")})`)).rows[0]?.business_id;
    try {
      const created = await createWidgetKeyForApi(context, caller, { label: "Main site", allowed_origins: ["https://example.com/contact", "https://example.com"], config: { color: "#112233", position: "bottom-left", lead_form: { enabled: true, require_email: true } } }, { appOrigin: "https://app.lobbystack.example" });
      expect(apiWidgetKeyCreatedSchema.safeParse(created).success).toBe(true);
      expect(created).toMatchObject({ label: "Main site", status: "active", allowed_origins: ["https://example.com"], config: { color: "#112233", position: "bottom-left", lead_form: { enabled: true, require_email: true } } });
      expect(created.embed_snippet).toBe(`<script src="https://app.lobbystack.example/embed.js?key=${encodeURIComponent(created.key)}" data-widget-key="${created.key}" defer></script>`);
      // The widget finds the business by the key's hash, and the dashboard can show the script tag again.
      expect(await resolve(created.key)).toBe(businessId);
      expect((await admin!.db.select({ keyValue: widgetKeys.keyValue }).from(widgetKeys).where(eq(widgetKeys.id, created.id)))[0]?.keyValue).toBe(created.key);
      const { key: _key, embed_snippet: _snippet, ...listed } = created;
      expect(await listWidgetKeysForApi(context, caller)).toEqual([listed]);

      // Sending back what GET showed, defaults and all, changes nothing.
      await updateWidgetKeyForApi(context, caller, created.id, { label: listed.label, allowed_origins: ["https://example.com/"], config: listed.config });
      expect(await audited("api.widget_key.updated")).toBe(0);
      // A new configuration keeps the dashboard's live chat switch, which the API doesn't show.
      await admin!.db.update(widgetKeys).set({ config: { ...(listed.config as object), liveChat: { enabled: true } } }).where(eq(widgetKeys.id, created.id));
      await updateWidgetKeyForApi(context, caller, created.id, { config: { color: "#445566" } });
      expect((await admin!.db.select({ config: widgetKeys.config }).from(widgetKeys).where(eq(widgetKeys.id, created.id)))[0]?.config).toEqual({ color: "#445566", liveChat: { enabled: true } });
      expect(await updateWidgetKeyForApi(context, caller, created.id, { status: "disabled", label: null })).toMatchObject({ status: "disabled", label: null });
      expect(await updateWidgetKeyForApi(context, caller, created.id, { status: "active" })).toMatchObject({ status: "active" });
      expect(await updateWidgetKeyForApi(context, caller, created.id, { status: "revoked" })).toMatchObject({ status: "revoked" });
      await expectApiError(updateWidgetKeyForApi(context, caller, created.id, { status: "active" }), 409, "conflict");
      await expectApiError(updateWidgetKeyForApi(context, caller, created.id, {}), 400, "invalid_request");
      await expectApiError(updateWidgetKeyForApi(context, a.caller, created.id, { label: "Theirs" }), 404, "not_found");
      expect(await audited("api.widget_key.updated")).toBe(4);
    } finally {
      await admin!.db.delete(businesses).where(eq(businesses.id, businessId));
    }
  });

  it("lists, picks, moves and disconnects calendar connections as the integrations page does", async () => {
    const context = { db: worker!.db };
    const businessId = randomUUID();
    await admin!.db.insert(businesses).values({ id: businessId, slug: `api-calendar-${businessId}`, name: "Calendar test", timezone: "UTC", businessType: "test" });
    const caller: ApiKeyCaller = { businessId, apiKeyId: randomUUID() };
    const audited = async (eventType: string) => (await admin!.db.select({ id: auditLogs.id }).from(auditLogs).where(and(eq(auditLogs.businessId, businessId), eq(auditLogs.eventType, eventType)))).length;
    const listCalendars = vi.fn(async (_input: { accessToken: string }) => [{ id: "main@example.com", summary: "Main", primary: true, accessRole: "owner" }, { id: "holidays", summary: "Holidays", primary: false, accessRole: "reader" }]);
    const access = () => ({ decryptToken: (value: string) => value.replace(/^enc:/, ""), encryptToken: (value: string) => `enc:${value}`, refreshAccessToken: async () => ({ accessToken: "refreshed", expiresIn: 3600 }), listCalendars });
    const noGoogle = () => { throw new Error("Google isn't needed for this change."); };
    try {
      const [member] = await admin!.db.insert(staff).values({ businessId, name: "Robin", timezone: "UTC" }).returning({ id: staff.id });
      const [connection] = await admin!.db.insert(calendarConnections).values({ businessId, ownerUserId: ownerId, provider: "google", externalAccountId: "google-account-1", encryptedAccessToken: "enc:access", encryptedRefreshToken: "enc:refresh", tokenExpiresAt: new Date(Date.now() + 60 * 60_000) }).returning({ id: calendarConnections.id });
      const connectionId = connection!.id;

      const [listed] = await listCalendarConnectionsForApi(context, caller);
      expect(apiCalendarConnectionSchema.parse(listed)).toEqual(listed);
      expect(listed).toMatchObject({ id: connectionId, provider: "google", account_id: "google-account-1", calendar_id: null, staff_id: null, status: "connected" });
      expect(await listAccountCalendarsForApi(context, caller, connectionId, access)).toEqual([{ id: "main@example.com", name: "Main", primary: true, writable: true, selected: false }, { id: "holidays", name: "Holidays", primary: false, writable: false, selected: false }]);
      expect(listCalendars).toHaveBeenCalledWith({ accessToken: "access" });

      await expectApiError(updateCalendarConnectionForApi(context, caller, connectionId, { calendar_id: "holidays" }, access), 400, "invalid_request");
      await expectApiError(updateCalendarConnectionForApi(context, caller, connectionId, { calendar_id: "missing" }, access), 400, "invalid_request");
      expect(await updateCalendarConnectionForApi(context, caller, connectionId, { calendar_id: "main@example.com" }, access)).toMatchObject({ calendar_id: "main@example.com", status: "syncing" });
      // The worker reads the picked calendar, as after a pick in the dashboard.
      expect(await admin!.db.select({ id: outboxMessages.id }).from(outboxMessages).where(and(eq(outboxMessages.businessId, businessId), eq(outboxMessages.topic, "calendar.reconcileBusiness")))).toHaveLength(1);
      // Values it already has change nothing and need no call to Google.
      expect(await updateCalendarConnectionForApi(context, caller, connectionId, { calendar_id: "main@example.com", staff_id: null }, noGoogle)).toMatchObject({ calendar_id: "main@example.com", staff_id: null });
      expect(await audited("api.calendar_connection.updated")).toBe(1);

      expect(await updateCalendarConnectionForApi(context, caller, connectionId, { staff_id: member!.id }, noGoogle)).toMatchObject({ staff_id: member!.id });
      await expectApiError(updateCalendarConnectionForApi(context, caller, connectionId, { staff_id: a.staffId }, noGoogle), 400, "invalid_request");
      await expectApiError(updateCalendarConnectionForApi(context, caller, connectionId, {}, noGoogle), 400, "invalid_request");
      await expectApiError(updateCalendarConnectionForApi(context, a.caller, connectionId, { staff_id: null }, noGoogle), 404, "not_found");
      await expectApiError(listAccountCalendarsForApi(context, a.caller, connectionId, access), 404, "not_found");
      expect(await audited("api.calendar_connection.updated")).toBe(2);

      // Without tokens Google can't be asked, so the connection has to be made again.
      await admin!.db.update(calendarConnections).set({ encryptedAccessToken: null, encryptedRefreshToken: null }).where(eq(calendarConnections.id, connectionId));
      await expectApiError(listAccountCalendarsForApi(context, caller, connectionId, access), 409, "conflict");

      await admin!.db.insert(calendarBusyBlocks).values({ businessId, connectionId, startsAt: new Date("2030-01-01T09:00:00Z"), endsAt: new Date("2030-01-01T10:00:00Z") });
      await deleteCalendarConnectionForApi(context, caller, connectionId);
      expect(await listCalendarConnectionsForApi(context, caller)).toEqual([]);
      expect((await admin!.db.select().from(calendarConnections).where(eq(calendarConnections.id, connectionId)))[0]).toMatchObject({ status: "disconnected", encryptedAccessToken: null, encryptedRefreshToken: null });
      expect(await admin!.db.select().from(calendarBusyBlocks).where(eq(calendarBusyBlocks.connectionId, connectionId))).toEqual([]);
      await expectApiError(deleteCalendarConnectionForApi(context, caller, connectionId), 404, "not_found");
      // A pick would bring a disconnected connection back, so it's gone for good.
      await expectApiError(updateCalendarConnectionForApi(context, caller, connectionId, { staff_id: null }, noGoogle), 404, "not_found");
      expect(await audited("api.calendar_connection.disconnected")).toBe(1);

      const link = await createCalendarConnectLinkForApi(context, caller, { link: ({ businessId: linked }) => ({ url: `https://app.example.test/api/calendar/google/connect?businessId=${linked}`, expiresAt: new Date("2030-01-01T00:00:00.000Z") }) });
      expect(link).toEqual({ url: `https://app.example.test/api/calendar/google/connect?businessId=${businessId}`, expires_at: "2030-01-01T00:00:00.000Z" });
      expect(await audited("api.calendar.connect_link_created")).toBe(1);
    } finally {
      await admin!.db.delete(outboxMessages).where(eq(outboxMessages.businessId, businessId));
      await admin!.db.delete(businesses).where(eq(businesses.id, businessId));
    }
  });

  it("changes only the acting account's own alerts, keeps texts it can't send, and turns texts on only with consent", async () => {
    // Only the person may change their own alerts, so these run with the dashboard's role.
    const context = { db: app!.db };
    const options = { userId: ownerId, phoneVerified: false };
    const own = and(eq(operatorNotificationPreferences.businessId, a.businessId), eq(operatorNotificationPreferences.userId, ownerId));
    const saved = async () => (await admin!.db.select().from(operatorNotificationPreferences).where(own))[0];
    const audited = async () => (await admin!.db.select({ id: auditLogs.id }).from(auditLogs).where(and(eq(auditLogs.businessId, a.businessId), eq(auditLogs.eventType, "api.notification_preferences.updated")))).length;
    const refusal = async (promise: Promise<unknown>) => await promise.then(() => null, (error: unknown) => error);
    // A cloud business texts from the shared sender.
    vi.stubEnv("TWILIO_ALERT_SMS_FROM", "+14165550100");
    try {
      const before = await getNotificationPreferencesForApi(context, a.caller, options);
      expect(apiNotificationPreferencesSchema.parse(before)).toEqual(before);
      expect(before).toMatchObject({ email_enabled: true, sms_enabled: false, events: { voice_message: { email: true, sms: false } }, daily_summary: { enabled: false, send_time: null }, sms: { available: false, unavailable_reason: "phone_unverified" } });
      expect((await getNotificationPreferencesForApi(context, a.caller, { ...options, phoneVerified: true })).sms).toEqual({ available: false, unavailable_reason: "consent_required" });

      const changed = await updateNotificationPreferencesForApi(context, a.caller, { email_enabled: false, events: { voice_message: { email: false } }, daily_summary: { enabled: true, send_time: "08:30" } }, options);
      expect(changed).toMatchObject({ email_enabled: false, events: { voice_message: { email: false, sms: false }, text_message: { email: true, sms: false } }, daily_summary: { enabled: true, send_time: "08:30" } });
      expect(await getNotificationPreferencesForApi(context, a.caller, options)).toEqual(changed);
      // The dashboard reads the same settings.
      expect(await getNotificationPreferences(context, { userId: ownerId, businessId: a.businessId })).toMatchObject({ emailEnabled: false, eventPreferences: { voiceMessage: { email: false, sms: false } }, dailySummaryEnabled: true, dailySummarySendTime: "08:30" });
      // Values it already has change nothing.
      await updateNotificationPreferencesForApi(context, a.caller, { email_enabled: false, events: { voice_message: { email: false } } }, options);
      expect(await audited()).toBe(1);
      await expectApiError(updateNotificationPreferencesForApi(context, a.caller, { daily_summary: { send_time: null } }, options), 400, "invalid_request");
      await expectApiError(updateNotificationPreferencesForApi(context, a.caller, {}, options), 400, "invalid_request");

      // Texts saved before stay saved while they can't be sent, and turning them off sticks.
      await admin!.db.update(operatorNotificationPreferences).set({ smsEnabled: true, eventPreferences: { ...defaultOperatorNotificationEventPreferences(), voiceMessage: { email: false, sms: false }, calendarSync: { email: true, sms: true }, aiReplyFailed: { email: true, sms: true } } }).where(own);
      expect(await updateNotificationPreferencesForApi(context, a.caller, { email_enabled: true }, options)).toMatchObject({ email_enabled: true, sms_enabled: false, events: { calendar_sync: { email: true, sms: false } } });
      expect(await saved()).toMatchObject({ emailEnabled: true, smsEnabled: true, eventPreferences: { calendarSync: { email: true, sms: true }, aiReplyFailed: { email: true, sms: true } } });
      await updateNotificationPreferencesForApi(context, a.caller, { sms_enabled: false, events: { calendar_sync: { sms: false } } }, options);
      expect(await saved()).toMatchObject({ smsEnabled: false, eventPreferences: { calendarSync: { email: true, sms: false }, aiReplyFailed: { email: true, sms: true } } });
      // Turning one on without consent stays refused in the dashboard too.
      await expect(setNotificationPreferences(context, { userId: ownerId, businessId: a.businessId, emailEnabled: true, smsEnabled: true, eventPreferences: defaultOperatorNotificationEventPreferences() })).rejects.toThrow("SMS notification consent is required before enabling SMS alerts.");

      // Turning a text on needs a sender, a verified phone and consent the person gives in the dashboard.
      expect(await refusal(updateNotificationPreferencesForApi(context, a.caller, { sms_enabled: true }, options))).toMatchObject({ status: 409, code: "conflict", message: expect.stringContaining("no verified mobile number") });
      expect(await refusal(updateNotificationPreferencesForApi(context, a.caller, { events: { calendar_sync: { sms: true } } }, { ...options, phoneVerified: true }))).toMatchObject({ status: 409, code: "conflict", message: expect.stringContaining("hasn't agreed to alert texts") });
      vi.stubEnv("TWILIO_ALERT_SMS_FROM", "");
      expect(await refusal(updateNotificationPreferencesForApi(context, a.caller, { sms_enabled: true }, { ...options, phoneVerified: true }))).toMatchObject({ status: 409, code: "conflict", message: expect.stringContaining("no number to send alert texts from") });
      vi.stubEnv("TWILIO_ALERT_SMS_FROM", "+14165550100");
      // With the person's consent on record, texts can be turned on here.
      await admin!.db.update(users).set({ phone: "+14165550199" }).where(eq(users.id, ownerId));
      await admin!.db.update(operatorNotificationPreferences).set({ smsConsentGrantedAt: new Date(), smsConsentDisclosureVersion: OPERATOR_SMS_DISCLOSURE_VERSION, smsConsentPhone: "+14165550199", smsConsentSource: "operator_phone_verification" }).where(own);
      expect(await updateNotificationPreferencesForApi(context, a.caller, { sms_enabled: true, events: { calendar_sync: { sms: true } } }, { ...options, phoneVerified: true })).toMatchObject({ sms_enabled: true, events: { calendar_sync: { email: true, sms: true } }, sms: { available: true, unavailable_reason: null } });
      expect(await audited()).toBe(4);

      // An account that isn't on the team gets no alerts about the business.
      await expectApiError(getNotificationPreferencesForApi(context, b.caller, options), 409, "conflict");
    } finally {
      vi.unstubAllEnvs();
      await admin!.db.update(users).set({ phone: null }).where(eq(users.id, ownerId));
      await admin!.db.delete(operatorNotificationPreferences).where(own);
    }
  });

  it("asks Google with a fresh token when the stored one is stale or revoked", async () => {
    const context = { db: worker!.db };
    const businessId = randomUUID();
    await admin!.db.insert(businesses).values({ id: businessId, slug: `api-calendar-token-${businessId}`, name: "Calendar token test", timezone: "UTC", businessType: "test" });
    const caller: ApiKeyCaller = { businessId, apiKeyId: randomUUID() };
    const listCalendars = vi.fn(async (_input: { accessToken: string }) => [{ id: "main@example.com", summary: "Main", primary: true, accessRole: "owner" }]);
    const refreshAccessToken = vi.fn(async (_input: { refreshToken: string }) => ({ accessToken: "fresh", expiresIn: 3600 }));
    const access = () => ({ decryptToken: (value: string) => value.replace(/^enc:/, ""), encryptToken: (value: string) => `enc:${value}`, refreshAccessToken, listCalendars });
    const googleRefusal = (status: number) => Object.assign(new Error(`Google Calendar discovery failed with status ${status}.`), { responseStatus: status });
    try {
      const [connection] = await admin!.db.insert(calendarConnections).values({ businessId, ownerUserId: ownerId, provider: "google", externalAccountId: "google-account-2", encryptedAccessToken: "enc:expired", encryptedRefreshToken: "enc:refresh", tokenExpiresAt: new Date(Date.now() - 60_000) }).returning({ id: calendarConnections.id });
      const connectionId = connection!.id;
      const storedToken = async () => (await admin!.db.select({ token: calendarConnections.encryptedAccessToken }).from(calendarConnections).where(eq(calendarConnections.id, connectionId)))[0]?.token;

      // An expired token is refreshed first, and only its encrypted form is kept.
      expect(await listAccountCalendarsForApi(context, caller, connectionId, access)).toHaveLength(1);
      expect(refreshAccessToken).toHaveBeenCalledWith({ refreshToken: "refresh" });
      expect(listCalendars).toHaveBeenLastCalledWith({ accessToken: "fresh" });
      expect(await storedToken()).toBe("enc:fresh");

      // A token revoked in the Google account still looks unexpired, so a 401 refreshes it once.
      refreshAccessToken.mockClear();
      listCalendars.mockRejectedValueOnce(googleRefusal(401));
      expect(await listAccountCalendarsForApi(context, caller, connectionId, access)).toHaveLength(1);
      expect(refreshAccessToken).toHaveBeenCalledTimes(1);

      // When Google refuses the grant itself, only connecting again helps.
      listCalendars.mockRejectedValueOnce(googleRefusal(401));
      refreshAccessToken.mockRejectedValueOnce(Object.assign(new Error("Google refused the refresh token."), { reconnectRequired: true }));
      await expectApiError(listAccountCalendarsForApi(context, caller, connectionId, access), 409, "conflict");

      // Google's other failures are ours to report, never passed on as the caller's.
      listCalendars.mockRejectedValueOnce(googleRefusal(503));
      const outage = await listAccountCalendarsForApi(context, caller, connectionId, access).then(() => null, (error: unknown) => error);
      expect(outage).not.toBeInstanceOf(PublicApiError);
      expect(outage).toMatchObject({ message: "Google Calendar couldn't list the account's calendars." });
    } finally {
      await admin!.db.delete(businesses).where(eq(businesses.id, businessId));
    }
  });

  it("counts a platform key's number claims per business, and other keys' per account", async () => {
    const context = { db: worker!.db };
    const businessId = randomUUID();
    const userId = randomUUID();
    await admin!.db.insert(users).values({ id: userId, email: `${userId}@example.invalid`, normalizedEmail: `${userId}@example.invalid` });
    await admin!.db.insert(businesses).values({ id: businessId, slug: `api-number-limits-${businessId}`, name: "Number limits", timezone: "America/Toronto", businessType: "test" });
    await admin!.db.insert(billingAccounts).values({ businessId, billingKey: `business:${businessId}`, source: "managed", plan: "enterprise", subscriptionState: "active" });
    const keyCaller: ApiKeyCaller = { businessId, apiKeyId: randomUUID() };
    const platform: PlatformKeyCaller = { businessId, platformKeyId: randomUUID(), groupId: "lobbystack", actingUserId: userId, actor: "platform_key" };
    const phoneNumber = testNumber();
    const inventory = { listAvailablePhoneNumbers: async () => [{ phoneE164: phoneNumber, countryCode: "CA", capabilities: { sms: true, voice: true } }] };
    const claimAs = async (caller: ApiCaller) => {
      const [offer] = await searchPhoneNumbersForApi(context, caller, {}, { userId, provider: inventory, claimTokenSecret: numberClaimSecret });
      return await claimPhoneNumberForApi(context, caller, { offerToken: offer!.offer_token }, { userId, claimTokenSecret: numberClaimSecret });
    };
    try {
      // The account already reserved 3 numbers this hour, for another business.
      await admin!.db.insert(onboardingNumberClaimEvents).values(Array.from({ length: 3 }, (_, index) => ({ businessId: a.businessId, userId, requestedE164: `+141655599${index}0`, selectionContext: {}, claimTokenHash: "earlier", idempotencyKey: randomUUID(), status: "failed" })));
      await expectApiError(claimAs(keyCaller), 429, "rate_limited");
      // A platform key acts for many businesses as one account, so only this business's claims count.
      expect(await claimAs(platform)).toMatchObject({ status: "pending", phone_number: phoneNumber });
    } finally {
      await admin!.db.delete(outboxMessages).where(eq(outboxMessages.businessId, businessId));
      await admin!.db.delete(businesses).where(eq(businesses.id, businessId));
      // Deleting the account also deletes its claims for business a.
      await admin!.db.delete(users).where(eq(users.id, userId));
    }
  });

  it("prunes old webhook events and API idempotency keys, keeping events that are still being retried", async () => {
    const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);
    const [endpoint] = await admin!.db.insert(webhookEndpoints).values({ businessId: b.businessId, url: "https://prune.example.com/hook", events: ["contact.created"], encryptedSecret: encryptWebhookSecret("whsec_dGVzdHNlY3JldHRlc3RzZWNyZXR0ZXN0c2VjcmV0MTI=") }).returning({ id: webhookEndpoints.id });
    const event = async (businessId: string, createdAt: Date, deliveryStatus?: string) => {
      const [row] = await admin!.db.insert(webhookEvents).values({ businessId, type: "contact.created", payload: { data: { id: randomUUID() } }, createdAt }).returning({ id: webhookEvents.id });
      if (deliveryStatus) await admin!.db.insert(webhookDeliveries).values({ businessId, endpointId: endpoint!.id, eventId: row!.id, status: deliveryStatus });
      return row!.id;
    };
    const oldDelivered = await event(b.businessId, daysAgo(40), "succeeded");
    const oldFailed = await event(b.businessId, daysAgo(40), "failed");
    const oldRetrying = await event(b.businessId, daysAgo(40), "retrying");
    const oldPending = await event(b.businessId, daysAgo(40), "pending");
    const recent = await event(b.businessId, daysAgo(29), "succeeded");
    const otherBusiness = await event(a.businessId, daysAgo(40));
    const key = async (scope: string, createdAt: Date) => (await admin!.db.insert(idempotencyKeys).values({ scope, key: randomUUID(), businessId: b.businessId, createdAt }).returning({ id: idempotencyKeys.id }))[0]!.id;
    const oldApiKey = await key(`api:${b.caller.apiKeyId}:createContact`, daysAgo(2));
    const freshApiKey = await key(`api:${b.caller.apiKeyId}:createContact`, new Date());
    const oldOtherKey = await key("billing:checkout", daysAgo(2));

    expect(await pruneApiHistory({ db: worker!.db }, { businessId: b.businessId })).toEqual({ events: 2, idempotencyKeys: 1 });
    const events = await admin!.db.select({ id: webhookEvents.id }).from(webhookEvents).where(inArray(webhookEvents.id, [oldDelivered, oldFailed, oldRetrying, oldPending, recent, otherBusiness]));
    expect(events.map((row) => row.id).sort()).toEqual([oldRetrying, oldPending, recent, otherBusiness].sort());
    expect(await admin!.db.select({ id: webhookDeliveries.id }).from(webhookDeliveries).where(inArray(webhookDeliveries.eventId, [oldDelivered, oldFailed]))).toEqual([]);
    const keys = await admin!.db.select({ id: idempotencyKeys.id }).from(idempotencyKeys).where(inArray(idempotencyKeys.id, [oldApiKey, freshApiKey, oldOtherKey]));
    expect(keys.map((row) => row.id).sort()).toEqual([freshApiKey, oldOtherKey].sort());
  });

  it("turns off the webhooks a key created when the owner revokes the key", async () => {
    const generated = generateApiKey();
    const [key] = await admin!.db.insert(apiKeys).values({ businessId: a.businessId, name: "leaked", prefix: generated.prefix, keyHash: generated.keyHash, scopes: ["webhooks:manage", "calls:read"] }).returning({ id: apiKeys.id });
    const byKey = await createWebhookEndpoint({ db: worker!.db }, { businessId: a.businessId, manager: { kind: "api_key", apiKeyId: key!.id }, url: "https://leak.example.com/hook", events: ["call.completed"] });
    const byOwner = await createWebhookEndpoint({ db: app!.db }, { businessId: a.businessId, manager: { kind: "operator", userId: ownerId }, url: "https://owner.example.com/hook", events: ["call.completed"] });
    expect(await revokeApiKey({ db: app!.db }, { userId: ownerId, businessId: a.businessId, apiKeyId: key!.id })).toBe(true);
    const rows = await admin!.db.select({ id: webhookEndpoints.id, status: webhookEndpoints.status, disabledReason: webhookEndpoints.disabledReason }).from(webhookEndpoints).where(inArray(webhookEndpoints.id, [byKey.endpoint.id, byOwner.endpoint.id]));
    expect(rows.find((row) => row.id === byKey.endpoint.id)).toMatchObject({ status: "disabled", disabledReason: "manual" });
    expect(rows.find((row) => row.id === byOwner.endpoint.id)).toMatchObject({ status: "enabled", disabledReason: null });
  });

  it("turns off the webhooks the sender's account and API keys set up when the new owner accepts a claim link", async () => {
    const context = { db: worker!.db };
    const businessId = randomUUID();
    const customerId = randomUUID();
    const adminId = randomUUID();
    const customerEmail = `${customerId}@example.invalid`;
    for (const userId of [customerId, adminId]) await admin!.db.insert(users).values({ id: userId, email: `${userId}@example.invalid`, normalizedEmail: `${userId}@example.invalid` });
    await admin!.db.insert(businesses).values({ id: businessId, slug: `api-handover-hooks-${businessId}`, name: "Handover webhooks", timezone: "UTC", businessType: "test" });
    await admin!.db.insert(businessMemberships).values({ businessId, userId: ownerId, role: "business_owner" });
    await admin!.db.insert(businessMemberships).values({ businessId, userId: adminId, role: "business_admin" });
    const platform: PlatformKeyCaller = { businessId, platformKeyId: randomUUID(), groupId: "lobbystack", actingUserId: ownerId, actor: "platform_key" };
    const key = async (createdByUserId: string) => {
      const generated = generateApiKey();
      return (await admin!.db.insert(apiKeys).values({ businessId, name: "hooks", prefix: generated.prefix, keyHash: generated.keyHash, scopes: ["webhooks:manage", "calls:read"], createdByUserId }).returning({ id: apiKeys.id }))[0]!.id;
    };
    const hook = async (manager: WebhookManager, host: string) => (await createWebhookEndpoint(manager.kind === "operator" ? { db: app!.db } : context, { businessId, manager, url: `https://${host}.example.com/hook`, events: ["call.completed"] })).endpoint.id;
    try {
      const bySenderKey = await hook({ kind: "api_key", apiKeyId: await key(ownerId) }, "sender-key");
      const bySender = await hook({ kind: "operator", userId: ownerId }, "sender");
      // The admin stays on the team, so what they set up keeps working.
      const byAdminKey = await hook({ kind: "api_key", apiKeyId: await key(adminId) }, "admin-key");
      const byAdmin = await hook({ kind: "operator", userId: adminId }, "admin");
      // So does any platform key's: the group's keys lose the business with the handover.
      const byGroup = await hook({ kind: "platform_key", platformKeyId: randomUUID(), groupId: "acme", actingUserId: ownerId }, "group");
      const link = await createClaimLinkForApi(context, platform, { email: customerEmail }, { userId: ownerId });
      await acceptInvitation({ db: app!.db }, { userId: customerId, tokenHash: createHash("sha256").update(new URL(link.url).searchParams.get("token")!).digest("hex"), email: customerEmail, emailVerified: true });
      const rows = await admin!.db.select({ id: webhookEndpoints.id, status: webhookEndpoints.status }).from(webhookEndpoints).where(eq(webhookEndpoints.businessId, businessId));
      expect(Object.fromEntries(rows.map((row) => [row.id, row.status]))).toEqual({ [bySenderKey]: "disabled", [bySender]: "disabled", [byAdminKey]: "enabled", [byAdmin]: "enabled", [byGroup]: "disabled" });
    } finally {
      await admin!.db.delete(outboxMessages).where(eq(outboxMessages.businessId, businessId));
      await admin!.db.delete(businesses).where(eq(businesses.id, businessId));
      await admin!.db.delete(users).where(inArray(users.id, [customerId, adminId]));
    }
  });

  it("stops the webhooks of a platform key that is no longer in PLATFORM_API_KEYS", async () => {
    const context = { db: worker!.db };
    const kept = randomUUID();
    const removed = randomUUID();
    const groupKey = (platformKeyId: string): WebhookManager => ({ kind: "platform_key", platformKeyId, groupId: "acme", actingUserId: ownerId });
    const hook = async (businessId: string, manager: WebhookManager, host: string) => (await createWebhookEndpoint(manager.kind === "operator" ? { db: app!.db } : context, { businessId, manager, url: `https://${host}.example.com/hook`, events: ["contact.created"] })).endpoint.id;
    const status = async (ids: string[]) => Object.fromEntries((await admin!.db.select({ id: webhookEndpoints.id, status: webhookEndpoints.status }).from(webhookEndpoints).where(inArray(webhookEndpoints.id, ids))).map((row) => [row.id, row.status]));
    const byKept = await hook(a.businessId, groupKey(kept), "kept");
    const byRemoved = await hook(a.businessId, groupKey(removed), "removed");
    const byRemovedElsewhere = await hook(b.businessId, groupKey(removed), "removed-b");
    const byOwner = await hook(a.businessId, { kind: "operator", userId: ownerId }, "owner-a");
    const ids = [byKept, byRemoved, byRemovedElsewhere, byOwner];
    expect((await admin!.db.select({ platformKeyId: webhookEndpoints.createdByPlatformKeyId }).from(webhookEndpoints).where(eq(webhookEndpoints.id, byRemoved)))[0]?.platformKeyId).toBe(removed);
    try {
      // A delivery queued before the admin restarted without the key never goes out.
      const contact = await createContactForApi(context, a.caller, { phone: testNumber() });
      const [queued] = await admin!.db.select({ id: webhookDeliveries.id }).from(webhookDeliveries).innerJoin(webhookEvents, eq(webhookEvents.id, webhookDeliveries.eventId)).where(and(eq(webhookDeliveries.endpointId, byRemoved), sql`${webhookEvents.payload}->'data'->>'id' = ${contact.id}`));
      expect(await disableRemovedPlatformKeyWebhooks(context, { configuredPlatformKeyIds: [kept] })).toBeGreaterThanOrEqual(2);
      expect(await status(ids)).toEqual({ [byKept]: "enabled", [byRemoved]: "disabled", [byRemovedElsewhere]: "disabled", [byOwner]: "enabled" });
      expect(await admin!.db.select({ entityId: auditLogs.entityId }).from(auditLogs).where(and(eq(auditLogs.eventType, "webhook_endpoint.disabled"), inArray(auditLogs.entityId, ids)))).toHaveLength(2);
      const send = vi.fn(async () => ({ ok: true, status: 200, error: null, durationMs: 1 }));
      expect(await processWebhookDelivery(context, { businessId: a.businessId, deliveryId: queued!.id, attempt: 1, send })).toEqual({ outcome: "skipped", endpointDisabled: false });
      expect(send).not.toHaveBeenCalled();

      // The group's other key turns one back on and answers for it, so the next start leaves it on.
      await updateWebhookEndpoint(context, { businessId: a.businessId, manager: groupKey(kept), endpointId: byRemoved, status: "enabled" });
      expect(await disableRemovedPlatformKeyWebhooks(context, { configuredPlatformKeyIds: [kept] })).toBe(0);
      expect(await status(ids)).toMatchObject({ [byRemoved]: "enabled", [byKept]: "enabled" });
      // With no platform keys configured, none of their webhooks deliver.
      await disableRemovedPlatformKeyWebhooks(context, { configuredPlatformKeyIds: [] });
      expect(await status(ids)).toEqual({ [byKept]: "disabled", [byRemoved]: "disabled", [byRemovedElsewhere]: "disabled", [byOwner]: "enabled" });
      // Only the worker role may run it.
      await expect(app!.db.execute(sql`select app.disable_removed_platform_key_webhooks('{}'::uuid[])`)).rejects.toThrow();
    } finally {
      await admin!.db.delete(webhookEndpoints).where(inArray(webhookEndpoints.id, ids));
    }
  });

  it("audits a platform key's webhook changes with the key, its group and its owner", async () => {
    const context = { db: worker!.db };
    const platformKeyId = randomUUID();
    const manager: WebhookManager = { kind: "platform_key", platformKeyId, groupId: "acme", actingUserId: ownerId };
    const actor = { actor: "platform_key", platformKeyId, groupId: "acme", actingUserId: ownerId };
    const { endpoint } = await createWebhookEndpoint(context, { businessId: a.businessId, manager, url: "https://group-audit.example.com/hook", events: ["contact.created"] });
    try {
      await updateWebhookEndpoint(context, { businessId: a.businessId, manager, endpointId: endpoint.id, description: "Group audit" });
      await rotateWebhookSecret(context, { businessId: a.businessId, manager, endpointId: endpoint.id });
      await deleteWebhookEndpoint(context, { businessId: a.businessId, manager, endpointId: endpoint.id });
      const rows = await admin!.db.select({ eventType: auditLogs.eventType, actorUserId: auditLogs.actorUserId, payload: auditLogs.payload }).from(auditLogs).where(eq(auditLogs.entityId, endpoint.id));
      expect(Object.fromEntries(rows.map((row) => [row.eventType, row]))).toEqual({
        "webhook_endpoint.created": { eventType: "webhook_endpoint.created", actorUserId: null, payload: { ...actor, events: ["contact.created"] } },
        "webhook_endpoint.updated": { eventType: "webhook_endpoint.updated", actorUserId: null, payload: { ...actor, fields: ["description"] } },
        "webhook_endpoint.secret_rotated": { eventType: "webhook_endpoint.secret_rotated", actorUserId: null, payload: actor },
        "webhook_endpoint.deleted": { eventType: "webhook_endpoint.deleted", actorUserId: null, payload: actor },
      });
    } finally {
      await admin!.db.delete(webhookEndpoints).where(eq(webhookEndpoints.id, endpoint.id));
    }
  });
});
