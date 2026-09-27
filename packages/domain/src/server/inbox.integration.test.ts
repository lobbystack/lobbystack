import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { appointments, businesses, calls, contacts, conversations, createDatabaseClient, messages, services, staff, users, widgetVisitors, type Database, type DatabaseTransaction } from "@lobbystack/db";

import { listAppointmentsInRange } from "./calendarView";
import { listInboxItems } from "./inbox";
import { createReceptionist, setStaffEnabled } from "./receptionists";
import { createStaffMember, listStaff, updateStaffMember } from "./staff";
import { createBusiness } from "./tenancy";

// Explicit opt-in only; never fall back to DATABASE_URL or load an env file.
const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
    throw new Error("Inbox integration tests require a dedicated local test database.");
  }
}
const client = testUrl ? createDatabaseClient("lobbystack_migrator", { DATABASE_URL: testUrl }) : undefined;
afterAll(async () => { await client?.pool.end(); });

async function rollbackTest(run: (tx: DatabaseTransaction) => Promise<void>) {
  const rollback = new Error("rollback test fixture");
  try {
    await client!.db.transaction(async (tx) => { await run(tx); throw rollback; });
  } catch (error) {
    if (error !== rollback) throw error;
  }
}

async function seed(tx: DatabaseTransaction) {
  const userId = randomUUID();
  await tx.insert(users).values({ id: userId, email: `${userId}@example.invalid`, normalizedEmail: `${userId}@example.invalid`, name: "Owner" });
  await tx.execute(sql`set local role lobbystack_app`);
  const context = { db: tx as unknown as Database };
  const { businessId } = await createBusiness(context, { userId, name: "Inbox Clinic", timezone: "America/Toronto", businessType: "clinic" });
  const night = await createReceptionist(context, { userId, businessId, name: "Night" });
  await tx.execute(sql`reset role`);
  return { userId, businessId, context, nightId: night.id };
}

describe.skipIf(!client)("inbox, calendar and staff against PostgreSQL", () => {
  it("merges calls, chats and texts and filters them by channel and receptionist", async () => {
    await rollbackTest(async (tx) => {
      const { userId, businessId, context, nightId } = await seed(tx);
      const [contact] = await tx.insert(contacts).values({ businessId, name: "Marie", phone: "+15145550100" }).returning({ id: contacts.id });
      const visitorId = randomUUID();
      await tx.insert(widgetVisitors).values({ id: visitorId, businessId, name: "Web visitor" });
      const [callConversation] = await tx.insert(conversations).values({ businessId, contactId: contact!.id, channel: "voice" }).returning({ id: conversations.id });
      await tx.insert(calls).values({ businessId, conversationId: callConversation!.id, contactId: contact!.id, providerCallId: `call-${randomUUID()}`, transport: "voice", startedAt: new Date("2030-01-08T14:00:00Z"), agentId: nightId });
      const [chat] = await tx.insert(conversations).values({ businessId, widgetVisitorId: visitorId, channel: "web_chat" }).returning({ id: conversations.id });
      const [text] = await tx.insert(conversations).values({ businessId, contactId: contact!.id, channel: "sms" }).returning({ id: conversations.id });
      await tx.insert(conversations).values({ businessId, contactId: contact!.id, channel: "sms" });
      await tx.insert(messages).values([
        { businessId, conversationId: chat!.id, direction: "inbound", channel: "web_chat", body: "Do you have parking?", createdAt: new Date("2030-01-08T15:00:00Z") },
        { businessId, conversationId: text!.id, direction: "inbound", channel: "sms", body: "Running late", createdAt: new Date("2030-01-08T16:00:00Z") },
      ]);

      await tx.execute(sql`set local role lobbystack_app`);
      const all = await listInboxItems(context, { userId, businessId });
      expect(all.map((item) => [item.channel, item.preview ?? null])).toEqual([["text", "Running late"], ["chat", "Do you have parking?"], ["call", null]]);
      expect(all.find((item) => item.channel === "chat")?.contactName).toBe("Web visitor");
      expect((await listInboxItems(context, { userId, businessId, channel: "call" })).map((item) => item.agentId)).toEqual([nightId]);
      expect(await listInboxItems(context, { userId, businessId, agentId: nightId })).toHaveLength(1);
      expect((await listInboxItems(context, { userId, businessId, search: "parking" })).map((item) => item.channel)).toEqual(["chat"]);
      await tx.execute(sql`reset role`);
    });
  });

  it("lists a calendar range and keeps one staff member active", async () => {
    await rollbackTest(async (tx) => {
      const { userId, businessId, context } = await seed(tx);
      const [service] = await tx.insert(services).values({ businessId, name: "Cleaning", slug: "cleaning", durationMinutes: 30 }).returning({ id: services.id });
      await tx.execute(sql`set local role lobbystack_app`);
      await setStaffEnabled(context, { userId, businessId, enabled: true });
      const leeId = await createStaffMember(context, { userId, businessId, name: "  Dr.  Lee " });
      const team = await listStaff(context, { userId, businessId });
      expect(team.map((member) => member.name)).toEqual(["Inbox Clinic", "Dr. Lee"]);
      expect(team.find((member) => member.id === leeId)?.serviceIds).toEqual([service!.id]);
      const businessMember = team.find((member) => member.name === "Inbox Clinic")!;
      await updateStaffMember(context, { userId, businessId, staffId: businessMember.id, active: false });
      await expect(updateStaffMember(context, { userId, businessId, staffId: leeId, active: false })).rejects.toMatchObject({ code: "staff_last_active" });
      await tx.execute(sql`reset role`);
      const [business] = await tx.select({ staffEnabled: businesses.staffEnabled }).from(businesses).where(eq(businesses.id, businessId));
      expect(business?.staffEnabled).toBe(true);

      const [contact] = await tx.insert(contacts).values({ businessId, name: "Paul", phone: "+15145550199" }).returning({ id: contacts.id });
      await tx.insert(appointments).values([
        { businessId, contactId: contact!.id, staffId: leeId, serviceId: service!.id, startsAt: new Date("2030-01-08T14:00:00Z"), endsAt: new Date("2030-01-08T14:30:00Z"), timezone: "America/Toronto", sourceChannel: "voice" },
        { businessId, contactId: contact!.id, staffId: leeId, serviceId: service!.id, startsAt: new Date("2030-01-09T14:00:00Z"), endsAt: new Date("2030-01-09T14:30:00Z"), timezone: "America/Toronto", sourceChannel: "voice", status: "canceled" },
        { businessId, contactId: contact!.id, staffId: leeId, serviceId: service!.id, startsAt: new Date("2030-01-20T14:00:00Z"), endsAt: new Date("2030-01-20T14:30:00Z"), timezone: "America/Toronto", sourceChannel: "voice" },
      ]);
      await tx.execute(sql`set local role lobbystack_app`);
      const week = await listAppointmentsInRange(context, { userId, businessId, from: new Date("2030-01-07T05:00:00Z"), to: new Date("2030-01-14T05:00:00Z") });
      expect(week.map((row) => [row.staffName, row.serviceName, row.contactName])).toEqual([["Dr. Lee", "Cleaning", "Paul"]]);
      await expect(listAppointmentsInRange(context, { userId, businessId, from: new Date("2030-01-01"), to: new Date("2030-06-01") })).rejects.toMatchObject({ status: 400 });
      await tx.execute(sql`reset role`);
      expect(await tx.select({ id: staff.id }).from(staff).where(eq(staff.businessId, businessId))).toHaveLength(2);
    });
  });
});
