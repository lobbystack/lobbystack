import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { DateTime } from "luxon";
import { afterAll, describe, expect, it } from "vitest";
import { appointments, auditLogs, businessHours, businessMemberships, businesses, contacts, createDatabaseClient, notifications, outboxMessages, services, staff, users, type Database, type DatabaseTransaction } from "@lobbystack/db";

import { BookingUnavailableError } from "../availability";
import { ContactPhoneTakenError, createContact } from "./contacts";
import { bookAppointmentForOperator, findBookingOpenings } from "./operatorBookings";

// Explicit opt-in only; never fall back to DATABASE_URL or load an env file.
const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
    throw new Error("Operator booking integration tests require a dedicated local test database.");
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

const timezone = "America/Toronto";
const local = (days: number, hour: number, minute = 0) => DateTime.now().setZone(timezone).plus({ days }).set({ hour, minute, second: 0, millisecond: 0 });

/**
 * A business open all day with one staff member, a consultation, Milan (who
 * has a phone) and Vera (email only). Ana already has 10 AM the day after
 * tomorrow. The dashboard books as the operator, under RLS.
 */
async function seed(tx: DatabaseTransaction) {
  const businessId = randomUUID();
  const userIds = { owner: randomUUID(), scheduler: randomUUID(), viewer: randomUUID() };
  await tx.insert(businesses).values({ id: businessId, slug: businessId, name: "Operator booking test", timezone, businessType: "test", telemetryEnabled: false });
  const roles = { owner: "business_owner", scheduler: "scheduler", viewer: "viewer" } as const;
  for (const [key, id] of Object.entries(userIds)) {
    await tx.insert(users).values({ id, email: `${id}@example.invalid`, normalizedEmail: `${id}@example.invalid` });
    await tx.insert(businessMemberships).values({ businessId, userId: id, role: roles[key as keyof typeof roles] });
  }
  await tx.insert(businessHours).values(Array.from({ length: 7 }, (_, dayOfWeek) => ({ businessId, dayOfWeek, openMinutes: 0, closeMinutes: 1439 })));
  const [milan] = await tx.insert(contacts).values({ businessId, name: "Milan", phone: "+14165550100" }).returning();
  const [vera] = await tx.insert(contacts).values({ businessId, name: "Vera", email: "vera@example.com" }).returning();
  const [ana] = await tx.insert(contacts).values({ businessId, name: "Ana", phone: "+14165550101" }).returning();
  const [employee] = await tx.insert(staff).values({ businessId, name: "Sam", timezone }).returning();
  const [consultation] = await tx.insert(services).values({ businessId, name: "Consultation", slug: "consultation", durationMinutes: 30 }).returning();
  await tx.insert(appointments).values({ businessId, contactId: ana!.id, staffId: employee!.id, serviceId: consultation!.id, startsAt: local(2, 10).toJSDate(), endsAt: local(2, 10, 30).toJSDate(), timezone, status: "confirmed", sourceChannel: "voice" });
  const context = { db: tx as unknown as Database };
  const asApp = async () => { await tx.execute(sql.raw("set local role lobbystack_app")); };
  return {
    businessId,
    userIds,
    ids: { milan: milan!.id, vera: vera!.id, service: consultation!.id, staff: employee!.id },
    asApp,
    context,
  };
}

describe.skipIf(!testUrl)("operator bookings", () => {
  it("lists a service's open times for a day, without the taken ones, for schedulers only", async () => {
    await rollbackTest(async (tx) => {
      const { businessId, userIds, ids, asApp, context } = await seed(tx);
      await asApp();
      const day = await findBookingOpenings(context, { userId: userIds.scheduler, businessId, serviceId: ids.service, date: local(2, 0).toISODate()! });
      expect(day.timezone).toBe(timezone);
      expect(day.openings).toContain(local(2, 11).toUTC().toISO());
      expect(day.openings).not.toContain(local(2, 10).toUTC().toISO());
      await expect(findBookingOpenings(context, { userId: userIds.viewer, businessId, serviceId: ids.service, date: local(2, 0).toISODate()! })).rejects.toMatchObject({ status: 403 });
      await expect(findBookingOpenings(context, { userId: userIds.scheduler, businessId, serviceId: randomUUID(), date: local(2, 0).toISODate()! })).rejects.toMatchObject({ status: 409, code: "service_unavailable" });
    });
  });

  it("books an existing contact through the shared booking path, with the operator in the audit log", async () => {
    await rollbackTest(async (tx) => {
      const { businessId, userIds, ids, asApp, context } = await seed(tx);
      await asApp();
      const startsAt = local(3, 14).toUTC().toISO()!;
      const { appointmentId } = await bookAppointmentForOperator(context, { userId: userIds.scheduler, businessId, serviceId: ids.service, startsAt, contactId: ids.milan });
      const [booked] = await tx.select().from(appointments).where(eq(appointments.id, appointmentId));
      expect(booked).toMatchObject({ contactId: ids.milan, staffId: ids.staff, status: "confirmed", sourceChannel: "dashboard", calendarSyncState: "pending" });
      expect(booked!.startsAt.toISOString()).toBe(new Date(startsAt).toISOString());
      const [audit] = await tx.select().from(auditLogs).where(and(eq(auditLogs.businessId, businessId), eq(auditLogs.entityId, appointmentId), eq(auditLogs.eventType, "appointment_change.booked")));
      expect(audit).toMatchObject({ actorUserId: userIds.scheduler, payload: { source: "operator" } });
      const kinds = (await tx.select({ kind: notifications.kind }).from(notifications).where(eq(notifications.relatedId, appointmentId))).map((row) => row.kind).sort();
      expect(kinds).toEqual(["appointment_reminder", "booking_confirmation"]);
      const topics = (await tx.select({ topic: outboxMessages.topic }).from(outboxMessages).where(and(eq(outboxMessages.businessId, businessId), eq(outboxMessages.aggregateId, appointmentId)))).map((row) => row.topic);
      expect(topics).toEqual(expect.arrayContaining(["calendar.syncAppointment", "realtime.publish", "notification.dispatch"]));
      // The time is gone for the next booking.
      await expect(bookAppointmentForOperator(context, { userId: userIds.scheduler, businessId, serviceId: ids.service, startsAt, contact: { name: "Lea", phone: "+14165550199" } })).rejects.toBeInstanceOf(BookingUnavailableError);
    });
  });

  it("books a new contact by name and phone, and refuses viewers and contacts without a phone", async () => {
    await rollbackTest(async (tx) => {
      const { businessId, userIds, ids, asApp, context } = await seed(tx);
      await asApp();
      const startsAt = local(3, 15).toUTC().toISO()!;
      await expect(bookAppointmentForOperator(context, { userId: userIds.viewer, businessId, serviceId: ids.service, startsAt, contactId: ids.milan })).rejects.toMatchObject({ status: 403 });
      await expect(bookAppointmentForOperator(context, { userId: userIds.scheduler, businessId, serviceId: ids.service, startsAt, contactId: ids.vera })).rejects.toMatchObject({ status: 400, code: "contact_no_phone" });
      const { appointmentId } = await bookAppointmentForOperator(context, { userId: userIds.scheduler, businessId, serviceId: ids.service, startsAt, contact: { name: "Lea", phone: "+14165550199" } });
      const [row] = await tx.select({ name: contacts.name, phone: contacts.phone }).from(appointments).innerJoin(contacts, eq(contacts.id, appointments.contactId)).where(eq(appointments.id, appointmentId));
      expect(row).toEqual({ name: "Lea", phone: "+14165550199" });
    });
  });

  it("lets owners and admins create contacts and names the contact a phone belongs to", async () => {
    await rollbackTest(async (tx) => {
      const { businessId, userIds, ids, asApp, context } = await seed(tx);
      await asApp();
      const { contactId } = await createContact(context, { userId: userIds.owner, businessId, name: "Lea", phone: "+14165550199", email: "lea@example.com" });
      const [created] = await tx.select().from(contacts).where(eq(contacts.id, contactId));
      expect(created).toMatchObject({ businessId, name: "Lea", phone: "+14165550199", email: "lea@example.com" });
      const [audit] = await tx.select().from(auditLogs).where(and(eq(auditLogs.entityId, contactId), eq(auditLogs.eventType, "contact.created")));
      expect(audit).toMatchObject({ actorUserId: userIds.owner, payload: { source: "operator" } });
      const taken = await createContact(context, { userId: userIds.owner, businessId, name: "Milan again", phone: "+14165550100" }).catch((error: unknown) => error);
      expect(taken).toBeInstanceOf(ContactPhoneTakenError);
      expect(taken).toMatchObject({ status: 409, code: "contact_exists", contactId: ids.milan });
      await expect(createContact(context, { userId: userIds.scheduler, businessId, name: "Nope", email: "nope@example.com" })).rejects.toMatchObject({ status: 403 });
    });
  });
});
