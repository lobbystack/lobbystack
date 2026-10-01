import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { appointments, businessMemberships, businesses, calls, contacts, conversations, createDatabaseClient, services, staff, users, widgetVisitors, withBusinessTransaction, type Database, type DatabaseTransaction } from "@lobbystack/db";

import { getContactDetail, listContacts } from "./contacts";
import { listCurrentAppointments, listRecentCalls, listUpcomingAppointments } from "./operatorActivity";
import { listCalls } from "./voice";

// Explicit opt-in only; never fall back to DATABASE_URL or load an env file.
const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
    throw new Error("Operator activity integration tests require a dedicated local test database.");
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

/** One business with a named phone caller, a phone-only caller, a web caller, and a website chat visitor. */
async function seed(tx: DatabaseTransaction) {
  const businessId = randomUUID();
  const userId = randomUUID();
  const ids = { named: randomUUID(), phoneOnly: randomUUID(), webCaller: randomUUID(), chatVisitor: randomUUID() };
  await tx.insert(businesses).values({ id: businessId, slug: businessId, name: "Contact labels test", timezone: "UTC", businessType: "test", telemetryEnabled: false });
  await tx.insert(users).values({ id: userId, email: `${userId}@example.invalid`, normalizedEmail: `${userId}@example.invalid` });
  await tx.insert(businessMemberships).values({ businessId, userId, role: "business_owner" });
  await tx.insert(contacts).values([
    { id: ids.named, businessId, name: "Marie Tremblay", phone: "+14155550100", email: "marie@example.com" },
    { id: ids.phoneOnly, businessId, phone: "+14155550123" },
    { id: ids.webCaller, businessId },
    { id: ids.chatVisitor, businessId, email: "visitor@example.com" },
  ]);
  const call = async (contactId: string, transport: string, minutesAgo: number) => {
    const conversationId = randomUUID();
    await tx.insert(conversations).values({ id: conversationId, businessId, contactId, channel: "voice" });
    await tx.insert(calls).values({ businessId, conversationId, contactId, provider: "openai_live", providerCallId: `rtc_${randomUUID()}`, transport, status: "completed", startedAt: new Date(Date.now() - minutesAgo * 60_000) });
  };
  await call(ids.named, "voice", 40);
  await call(ids.phoneOnly, "voice", 30);
  await call(ids.webCaller, "web_voice", 20);
  await tx.insert(conversations).values({ businessId, contactId: ids.named, channel: "sms" });
  const visitorId = randomUUID();
  await tx.insert(widgetVisitors).values({ id: visitorId, businessId, contactId: ids.chatVisitor, email: "visitor@example.com" });
  await tx.insert(conversations).values({ businessId, widgetVisitorId: visitorId, channel: "web_chat" });
  const [employee] = await tx.insert(staff).values({ businessId, name: "Sam", timezone: "UTC" }).returning();
  const [service] = await tx.insert(services).values({ businessId, name: "Consultation", slug: "consultation", durationMinutes: 30 }).returning();
  const startsAt = new Date(Date.now() + 86_400_000);
  await tx.insert(appointments).values({ businessId, contactId: ids.webCaller, staffId: employee!.id, serviceId: service!.id, startsAt, endsAt: new Date(startsAt.getTime() + 30 * 60_000), timezone: "UTC", sourceChannel: "web_voice" });
  await tx.execute(sql`set local role lobbystack_app`);
  return { db: tx as unknown as Database, businessId, userId, ids };
}

describe.skipIf(!client)("operator contact and channel data under operator RLS", () => {
  it("lists the channels each contact used without changing names or numbers", async () => {
    await rollbackTest(async (tx) => {
      const { db, businessId, userId, ids } = await seed(tx);
      const result = await listContacts({ db }, { userId, businessId });
      const byId = new Map(result.contacts.map((contact) => [contact.id, contact]));
      expect(byId.get(ids.named)).toMatchObject({ name: "Marie Tremblay", phone: "+14155550100", email: "marie@example.com", channels: ["sms", "voice"] });
      expect(byId.get(ids.phoneOnly)).toMatchObject({ name: null, phone: "+14155550123", email: null, channels: ["voice"] });
      expect(byId.get(ids.webCaller)).toMatchObject({ name: null, phone: null, email: null, channels: ["web_voice"] });
      expect(byId.get(ids.chatVisitor)).toMatchObject({ name: null, phone: null, email: "visitor@example.com", channels: ["web_chat"] });

      const detail = await getContactDetail({ db }, { userId, businessId, contactId: ids.webCaller });
      expect(detail.channels).toEqual(["web_voice"]);
      expect(detail.contact).toMatchObject({ id: ids.webCaller, name: null, phone: null });
    });
  });

  it("returns the call transport and contact details the call lists label callers with", async () => {
    await rollbackTest(async (tx) => {
      const { db, businessId, userId } = await seed(tx);
      const listed = await listCalls({ db }, { userId, businessId });
      expect(listed.calls.map((call) => ({ transport: call.transport, contactPhone: call.contactPhone, contactEmail: call.contactEmail }))).toEqual([
        { transport: "web_voice", contactPhone: null, contactEmail: null },
        { transport: "voice", contactPhone: "+14155550123", contactEmail: null },
        { transport: "voice", contactPhone: "+14155550100", contactEmail: "marie@example.com" },
      ]);

      await withBusinessTransaction(db, { businessId, userId, actorType: "operator" }, async (appTx) => {
        const recent = await listRecentCalls(appTx, businessId);
        expect(recent[0]).toMatchObject({ transport: "web_voice", contactName: null, contactPhone: null, contactEmail: null });
        expect(recent[2]).toMatchObject({ transport: "voice", contactName: "Marie Tremblay", contactEmail: "marie@example.com" });
      });
    });
  });

  it("returns appointment sources with the contact's phone and email", async () => {
    await rollbackTest(async (tx) => {
      const { db, businessId, userId } = await seed(tx);
      await withBusinessTransaction(db, { businessId, userId, actorType: "operator" }, async (appTx) => {
        const expected = { sourceChannel: "web_voice", contactName: null, contactPhone: null, contactEmail: null, serviceName: "Consultation", staffName: "Sam" };
        expect(await listUpcomingAppointments(appTx, businessId, new Date())).toEqual([expect.objectContaining(expected)]);
        expect(await listCurrentAppointments(appTx, businessId, new Date())).toEqual([expect.objectContaining(expected)]);
      });
    });
  });
});
