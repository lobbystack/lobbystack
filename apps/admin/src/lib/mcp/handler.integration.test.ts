import { randomUUID } from "node:crypto";

import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { and, eq, inArray } from "drizzle-orm";
import { DateTime } from "luxon";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { apiKeys, appointments, auditLogs, businessHours, businesses, calls, contacts, createDatabaseClient, outboxMessages, receptionistProfiles, services, staff } from "@lobbystack/db";
import { generateApiKey, type DomainContext } from "@lobbystack/domain";
import type { ApiKeyScope } from "@lobbystack/shared";

import { v1 } from "../public-api/routes";
import { createLobbyStackMcpHttpHandler } from "./handler";

vi.mock("../error-reporting", () => ({ reportServerError: vi.fn(async () => undefined) }));
// The REST routes use the app's context factory; point it at the test worker pool.
const shared = vi.hoisted(() => ({ context: undefined as undefined | (() => unknown) }));
vi.mock("../domain-context", () => ({ createWorkerDomainContext: () => { if (!shared.context) throw new Error("No test database."); return shared.context(); } }));

// The MCP endpoint end to end against PostgreSQL with RLS: a real MCP client,
// real API keys resolved by hash, and the lobbystack_worker role the admin
// uses for /api/v1 and /api/mcp.

// Explicit opt-in only; never fall back to DATABASE_URL or load an env file.
const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
    throw new Error("MCP integration tests require a dedicated local test database.");
  }
}

function roleUrl(role: string): string {
  const url = new URL(testUrl!);
  url.searchParams.set("options", `-c role=${role}`);
  return url.toString();
}

const admin = testUrl ? createDatabaseClient("lobbystack_migrator", { DATABASE_URL: testUrl }) : undefined;
const worker = testUrl ? createDatabaseClient("lobbystack_worker", { DATABASE_URL: roleUrl("lobbystack_worker") }) : undefined;
if (worker) shared.context = () => ({ db: worker.db });

type Fixture = { businessId: string; serviceId: string; apiKeyId: string; key: string };
let a: Fixture;
let b: Fixture;
let readOnlyKey: string;
const clients: Client[] = [];

async function createKey(businessId: string, scopes: ApiKeyScope[]): Promise<{ id: string; key: string }> {
  const generated = generateApiKey();
  const [row] = await admin!.db.insert(apiKeys).values({ businessId, name: "MCP test", prefix: generated.prefix, keyHash: generated.keyHash, scopes }).returning({ id: apiKeys.id });
  return { id: row!.id, key: generated.key };
}

async function createFixture(label: string): Promise<Fixture> {
  const businessId = randomUUID();
  await admin!.db.insert(businesses).values({ id: businessId, slug: `mcp-${label}-${businessId}`, name: `MCP ${label}`, timezone: "America/Toronto", businessType: "test" });
  await admin!.db.insert(receptionistProfiles).values({ businessId, greeting: "Hi", tone: "warm", summary: label, bookingPolicy: "Book", transferMode: "never", bookingMode: "instant" });
  await admin!.db.insert(staff).values({ businessId, name: "Sam", timezone: "America/Toronto" });
  const [service] = await admin!.db.insert(services).values({ businessId, name: "Cleaning", slug: "cleaning", durationMinutes: 30 }).returning({ id: services.id });
  await admin!.db.insert(businessHours).values(Array.from({ length: 7 }, (_, dayOfWeek) => ({ businessId, dayOfWeek, openMinutes: 8 * 60, closeMinutes: 20 * 60 })));
  const key = await createKey(businessId, ["business:read", "business:write", "calls:read", "contacts:read", "contacts:write", "appointments:read", "appointments:write", "messages:read", "knowledge:write"]);
  return { businessId, serviceId: service!.id, apiKeyId: key.id, key: key.key };
}

const handler = testUrl ? createLobbyStackMcpHttpHandler({ context: () => ({ db: worker!.db }) as DomainContext, rateLimit: async () => ({ allowed: true, limit: 120, remaining: 119, resetAt: 0 }), log: () => undefined }) : undefined;

async function connect(key: string): Promise<Client> {
  const transport = new StreamableHTTPClientTransport(new URL("http://localhost/api/mcp"), {
    requestInit: { headers: { authorization: `Bearer ${key}` } },
    fetch: async (input, init) => await handler!(new Request(input, init)),
  });
  const client = new Client({ name: "lobbystack-integration", version: "1.0.0" });
  await client.connect(transport);
  clients.push(client);
  return client;
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args });
  if (result.isError) return { error: (JSON.parse((result.content as Array<{ text: string }>)[0]!.text) as { error: { code: string; message: string } }).error };
  return { data: result.structuredContent as Record<string, unknown> & { data?: Array<Record<string, unknown>> } };
}

function localDayAt(daysAhead: number, hour: number): DateTime {
  return DateTime.now().setZone("America/Toronto").plus({ days: daysAhead }).set({ hour, minute: 0, second: 0, millisecond: 0 });
}

describe.skipIf(!testUrl)("MCP server against PostgreSQL with RLS", () => {
  beforeAll(async () => {
    a = await createFixture("a");
    b = await createFixture("b");
    readOnlyKey = (await createKey(a.businessId, ["calls:read"])).key;
  });

  afterEach(async () => {
    await Promise.all(clients.splice(0).map(async (client) => await client.close().catch(() => undefined)));
  });

  afterAll(async () => {
    if (a && b) {
      const ids = [a.businessId, b.businessId];
      await admin!.db.delete(outboxMessages).where(inArray(outboxMessages.businessId, ids));
      await admin!.db.delete(appointments).where(inArray(appointments.businessId, ids));
      await admin!.db.delete(businesses).where(inArray(businesses.id, ids));
    }
    await Promise.all([admin?.pool.end(), worker?.pool.end()]);
  });

  it("authenticates with a real key and lists only the key's tools", async () => {
    const client = await connect(readOnlyKey);
    expect((await client.listTools()).tools.map((tool) => tool.name).sort()).toEqual(["get_call", "list_calls"]);
    const revoked = await createKey(a.businessId, ["calls:read"]);
    await admin!.db.update(apiKeys).set({ revokedAt: new Date() }).where(eq(apiKeys.id, revoked.id));
    await expect(connect(revoked.key)).rejects.toThrow();
  });

  it("never lets a key for business A read or change business B", async () => {
    const clientA = await connect(a.key);
    const clientB = await connect(b.key);
    const created = await call(clientB, "create_contact", { name: "Only in B", phone: "+14165550199" });
    const contactB = created.data!;
    expect(await call(clientA, "get_contact", { contact_id: contactB.id })).toEqual({ error: expect.objectContaining({ code: "not_found" }) });
    expect(await call(clientA, "update_contact", { contact_id: contactB.id, name: "Hijacked" })).toEqual({ error: expect.objectContaining({ code: "not_found" }) });
    const search = await call(clientA, "search_contacts", { phone: "+14165550199" });
    expect(search.data!.data).toEqual([]);
    expect((await call(clientA, "get_business")).data).toMatchObject({ id: a.businessId });
  });

  it("lists staff with the services they take", async () => {
    const client = await connect(a.key);
    const staff = (await call(client, "list_staff")).data!.data!;
    expect(staff).toEqual([expect.objectContaining({ name: "Sam", active: true })]);
  });

  it("finds contacts by part of their name", async () => {
    const client = await connect(a.key);
    await call(client, "create_contact", { name: "Marguerite O'Hara", phone: "+14165550101" });
    await call(client, "create_contact", { name: "Paul 100% Real", phone: "+14165550102" });
    const found = await call(client, "search_contacts", { name: "margUERITE" });
    expect(found.data!.data!.map((contact) => contact.name)).toEqual(["Marguerite O'Hara"]);
    // LIKE wildcards in the search term match literally.
    expect((await call(client, "search_contacts", { name: "100%" })).data!.data!.map((contact) => contact.name)).toEqual(["Paul 100% Real"]);
    expect((await call(client, "search_contacts", { name: "%" })).data!.data!.map((contact) => contact.name)).toEqual(["Paul 100% Real"]);
  });

  it("filters calls by start time", async () => {
    const yesterday = localDayAt(-1, 10);
    const [contact] = await admin!.db.insert(contacts).values({ businessId: a.businessId, phone: "+14165550150", name: "Caller" }).returning({ id: contacts.id });
    for (const startedAt of [yesterday, localDayAt(-3, 10)]) {
      await admin!.db.insert(calls).values({ businessId: a.businessId, contactId: contact!.id, providerCallId: `mcp-${randomUUID()}`, transport: "sip", status: "completed", startedAt: startedAt.toJSDate(), endedAt: startedAt.plus({ minutes: 2 }).toJSDate() });
    }
    const client = await connect(readOnlyKey);
    const result = await call(client, "list_calls", { started_after: yesterday.startOf("day").toISO(), started_before: yesterday.plus({ days: 1 }).startOf("day").toISO() });
    expect(result.data!.data!.map((row) => row.started_at)).toEqual([yesterday.toUTC().toISO()]);
  });

  it("books, reschedules and cancels, and audits each change with actor mcp", async () => {
    const client = await connect(a.key);
    const day = localDayAt(2, 0).toISODate()!;
    const slots = await call(client, "check_availability", { service_id: a.serviceId, start_date: day });
    const [first, second] = slots.data!.data! as Array<{ starts_at: string }>;
    expect(first && second).toBeTruthy();

    const booked = await call(client, "book_appointment", { service_id: a.serviceId, starts_at: first!.starts_at, contact_phone: "+14165550177", contact_name: "Booker", idempotency_key: "mcp-booking-1" });
    expect(booked.data).toMatchObject({ status: "confirmed", source: "api", starts_at: first!.starts_at });
    const replay = await call(client, "book_appointment", { service_id: a.serviceId, starts_at: first!.starts_at, contact_phone: "+14165550177", contact_name: "Booker", idempotency_key: "mcp-booking-1" });
    expect(replay.data).toEqual(booked.data);
    expect(await admin!.db.select({ id: appointments.id }).from(appointments).where(eq(appointments.businessId, a.businessId))).toHaveLength(1);

    const appointmentId = booked.data!.id as string;
    expect((await call(client, "reschedule_appointment", { appointment_id: appointmentId, starts_at: second!.starts_at })).data).toMatchObject({ starts_at: second!.starts_at });
    expect((await call(client, "cancel_appointment", { appointment_id: appointmentId })).data).toMatchObject({ status: "cancelled" });

    const rows = await admin!.db.select({ eventType: auditLogs.eventType, payload: auditLogs.payload }).from(auditLogs).where(and(eq(auditLogs.businessId, a.businessId), eq(auditLogs.entityId, appointmentId)));
    expect(rows.map((row) => row.eventType).sort()).toEqual(["api.appointment.booked", "appointment_change.canceled", "appointment_change.rescheduled"]);
    for (const row of rows) {
      expect(row.payload).toMatchObject({ actor: "mcp", apiKeyId: a.apiKeyId });
      expect(JSON.stringify(row.payload)).not.toContain("lsk_");
    }
  });

  it("shares idempotency keys between REST and MCP", async () => {
    const client = await connect(a.key);
    const day = localDayAt(4, 0).toISODate()!;
    const slots = (await call(client, "check_availability", { service_id: a.serviceId, start_date: day })).data!.data! as Array<{ starts_at: string }>;
    const body = { service_id: a.serviceId, starts_at: slots[0]!.starts_at, contact_phone: "+14165550166" };
    const post = (key: string, payload: unknown) => v1.createAppointment(new Request("http://localhost/api/v1/appointments", { method: "POST", headers: { authorization: `Bearer ${a.key}`, "content-type": "application/json", "idempotency-key": key }, body: JSON.stringify(payload) }));

    // REST first, then an MCP retry with the same key replays it.
    const restResponse = await post("cross-1", body);
    expect(restResponse.status).toBe(201);
    const restAppointment = ((await restResponse.json()) as { data: { id: string } }).data;
    const replayed = await call(client, "book_appointment", { ...body, idempotency_key: "cross-1" });
    expect(replayed.data).toEqual(restAppointment);

    // MCP first, then a REST retry replays it.
    const second = { ...body, starts_at: slots[1]!.starts_at, contact_phone: "+14165550167" };
    const mcpBooked = await call(client, "book_appointment", { ...second, idempotency_key: "cross-2" });
    const restReplay = await post("cross-2", second);
    expect(restReplay.headers.get("idempotent-replayed")).toBe("true");
    expect(((await restReplay.json()) as { data: unknown }).data).toEqual(mcpBooked.data);

    // Two bookings in total, and the key with another body is rejected on both sides.
    const ids = (await admin!.db.select({ id: appointments.id }).from(appointments).where(and(eq(appointments.businessId, a.businessId), inArray(appointments.id, [restAppointment.id, mcpBooked.data!.id as string])))).map((row) => row.id);
    expect(ids).toHaveLength(2);
    expect(await call(client, "book_appointment", { ...body, contact_phone: "+14165550168", idempotency_key: "cross-2" })).toEqual({ error: expect.objectContaining({ code: "idempotency_key_reused" }) });
    const reused = await post("cross-1", { ...body, contact_phone: "+14165550169" });
    expect(reused.status).toBe(422);
  });

  it("refuses to book outside instant booking mode", async () => {
    const client = await connect(a.key);
    await admin!.db.update(receptionistProfiles).set({ bookingMode: "request" }).where(eq(receptionistProfiles.businessId, a.businessId));
    try {
      const startsAt = localDayAt(3, 11).toUTC().toISO()!;
      expect(await call(client, "book_appointment", { service_id: a.serviceId, starts_at: startsAt, contact_phone: "+14165550188" })).toEqual({ error: expect.objectContaining({ code: "booking_requires_confirmation" }) });
      expect((await call(client, "get_business")).data).toMatchObject({ booking_mode: "request" });
    } finally {
      await admin!.db.update(receptionistProfiles).set({ bookingMode: "instant" }).where(eq(receptionistProfiles.businessId, a.businessId));
    }
  });

  it("updates hours and adds knowledge, audited with actor mcp", async () => {
    const client = await connect(a.key);
    const updated = await call(client, "update_business_hours", { hours: [{ day: "monday", open: "09:00", close: "17:00" }, { day: "saturday", open: "10:00", close: "14:00" }] });
    expect(updated.data!.hours).toEqual([{ day: "monday", open: "09:00", close: "17:00" }, { day: "saturday", open: "10:00", close: "14:00" }]);
    const knowledge = await call(client, "add_knowledge", { type: "faq", question: "Is there parking?", answer: "Yes, behind the building." });
    expect(knowledge.data).toMatchObject({ type: "faq", title: "Is there parking?" });
    const rows = await admin!.db.select({ eventType: auditLogs.eventType, payload: auditLogs.payload }).from(auditLogs).where(and(eq(auditLogs.businessId, a.businessId), inArray(auditLogs.eventType, ["api.business.updated", "api.knowledge.created"])));
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row.payload).toMatchObject({ actor: "mcp", apiKeyId: a.apiKeyId });
  });
});
