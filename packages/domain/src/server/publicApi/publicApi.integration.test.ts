import { randomUUID } from "node:crypto";

import { and, eq, inArray, sql } from "drizzle-orm";
import { DateTime } from "luxon";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { apiKeys, appointments, auditLogs, businessHours, businesses, calendarConnections, calls, contacts, conversations, createDatabaseClient, inboxItems, operatorNotificationDeliveries, outboxMessages, receptionistProfiles, services, staff, staffServiceAssignments, users, businessMemberships, webhookDeliveries, webhookDeliveryAttempts, webhookEndpoints, webhookEvents } from "@lobbystack/db";
import { apiAppointmentSchema, apiCallSchema, apiStaffSchema, WEBHOOK_MAX_ATTEMPTS } from "@lobbystack/shared";

import { finalizeConversationSession } from "../conversations";
import { createVoiceFollowUpTask } from "../voice";
import { generateApiKey, resolveApiKey } from "./apiKeys";
import { runIdempotent } from "./idempotency";
import { cancelAppointmentForApi, createAppointmentForApi, createContactForApi, getAvailabilityForApi, getContactForApi, getMeForApi, listAppointmentsForApi, listContactsForApi, listStaffForApi, rescheduleAppointmentForApi, updateBusinessForApi, type ApiCaller } from "./operations";
import { PublicApiError } from "./errors";
import { createWebhookEndpoint, processWebhookDelivery } from "./webhooks";
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

type Fixture = { businessId: string; serviceId: string; staffId: string; caller: ApiCaller; key: string };
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
    expect(await resolveApiKey({ db: worker!.db }, `${a.key.slice(0, -1)}x`)).toBeNull();
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
});
