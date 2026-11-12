import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { DateTime } from "luxon";
import { afterAll, describe, expect, it } from "vitest";
import { agents, appointments, businessHours, businessMemberships, businesses, closures, contacts, createDatabaseClient, notifications, outboxMessages, services, staff, users, webhookEndpoints, webhookEvents, withBusinessTransaction, type Database, type DatabaseTransaction } from "@lobbystack/db";

import { listAppointmentsBetween } from "./operatorActivity";
import { bookAppointmentForOperator, findBookingOpenings, updateAppointmentNotes } from "./operatorBookings";
import { loadAppointmentResource } from "./publicApi/resources";
import { verifyCallerForChange } from "./agentActions";
import { deleteTimeOff, listTimeOffBetween, saveTimeOff } from "./timeOff";
import { replaceBusinessHoursInTransaction } from "./catalog";

// Explicit opt-in only; never fall back to DATABASE_URL or load an env file.
const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
    throw new Error("Appointment notes integration tests require a dedicated local test database.");
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
const INTERNAL = "INTERNAL-ONLY-7d3f";
const VISIBLE = "Bring the referral letter";

/** A business open all day, with an owner, a scheduler, an employee, a consultation, Milan, a webhook for bookings and an agent that verifies callers by phone and one fact. */
async function seed(tx: DatabaseTransaction) {
  const businessId = randomUUID();
  const userIds = { owner: randomUUID(), scheduler: randomUUID() };
  await tx.insert(businesses).values({ id: businessId, slug: businessId, name: "Appointment notes test", timezone, businessType: "test", telemetryEnabled: false });
  for (const [key, id] of Object.entries(userIds)) {
    await tx.insert(users).values({ id, email: `${id}@example.invalid`, normalizedEmail: `${id}@example.invalid` });
    await tx.insert(businessMemberships).values({ businessId, userId: id, role: key === "owner" ? "business_owner" : "scheduler" });
  }
  await tx.insert(businessHours).values(Array.from({ length: 7 }, (_, dayOfWeek) => ({ businessId, dayOfWeek, openMinutes: 0, closeMinutes: 1439 })));
  await tx.insert(agents).values({ businessId, isDefault: true, greeting: "Hi", tone: "warm", bookingPolicy: "Book", transferMode: "never", bookingMode: "instant", appointmentChangePolicy: { enabled: true, verificationMode: "phone_match_and_facts", allowCancel: true, allowReschedule: true } });
  const [milan] = await tx.insert(contacts).values({ businessId, name: "Milan", phone: "+14165550100" }).returning();
  const [business] = await tx.insert(staff).values({ businessId, name: "Front desk", timezone }).returning();
  const [ana] = await tx.insert(staff).values({ businessId, name: "Ana", timezone, isEmployee: true }).returning();
  const [service] = await tx.insert(services).values({ businessId, name: "Consultation", slug: "consultation", durationMinutes: 30 }).returning();
  await tx.insert(webhookEndpoints).values({ businessId, url: "https://hooks.example.invalid/lobbystack", events: ["appointment.booked"], encryptedSecret: "test-secret" });
  const as = async (role: "lobbystack_app" | "lobbystack_worker" | "lobbystack_migrator") => { await tx.execute(sql.raw(role === "lobbystack_migrator" ? "reset role" : `set local role ${role}`)); };
  return { businessId, userIds, ids: { milan: milan!.id, service: service!.id, frontDesk: business!.id, ana: ana!.id }, as, context: { db: tx as unknown as Database } };
}

describe.skipIf(!testUrl)("appointment notes", () => {
  it("books with a custom length and both notes, and keeps internal notes out of the agent, the API, webhooks, texts and the outbox", async () => {
    await rollbackTest(async (tx) => {
      const { businessId, userIds, ids, as, context } = await seed(tx);
      await as("lobbystack_app");
      const startsAt = local(3, 14).toUTC().toISO()!;
      const openings = await findBookingOpenings(context, { userId: userIds.scheduler, businessId, serviceId: ids.service, date: local(3, 0).toISODate()!, durationMinutes: 50 });
      expect(openings.durationMinutes).toBe(50);
      const { appointmentId } = await bookAppointmentForOperator(context, { userId: userIds.scheduler, businessId, serviceId: ids.service, startsAt, contactId: ids.milan, durationMinutes: 50, notes: ` ${VISIBLE} `, internalNotes: INTERNAL });

      await as("lobbystack_migrator");
      const [row] = await tx.select().from(appointments).where(eq(appointments.id, appointmentId));
      expect(row).toMatchObject({ notes: VISIBLE, internalNotes: INTERNAL });
      expect(row!.endsAt.getTime() - row!.startsAt.getTime()).toBe(50 * 60_000);
      // Nothing the booking queued or sent carries the internal notes: outbox jobs (realtime, calendar sync, texts, telemetry), webhook events, notifications.
      const outbox = await tx.select({ payload: outboxMessages.payload }).from(outboxMessages).where(eq(outboxMessages.businessId, businessId));
      expect(outbox.length).toBeGreaterThan(0);
      expect(JSON.stringify(outbox)).not.toContain(INTERNAL);
      const events = await tx.select({ payload: webhookEvents.payload }).from(webhookEvents).where(eq(webhookEvents.businessId, businessId));
      expect(events).toHaveLength(1);
      expect(JSON.stringify(events)).toContain(VISIBLE);
      expect(JSON.stringify(events)).not.toContain(INTERNAL);
      expect(JSON.stringify(await tx.select().from(notifications).where(eq(notifications.relatedId, appointmentId)))).not.toContain(INTERNAL);

      // The public API shows the notes, not the internal ones.
      const resource = await loadAppointmentResource(tx, businessId, appointmentId);
      expect(resource).toMatchObject({ notes: VISIBLE });
      expect(JSON.stringify(resource)).not.toContain(INTERNAL);

      // The agent reads the notes once the caller is verified, never the internal ones.
      await as("lobbystack_worker");
      const verified = await verifyCallerForChange(context, { businessId, callerPhone: "+14165550100", action: "reschedule", serviceName: "Consultation" });
      expect(verified).toMatchObject({ verified: true, appointmentNotes: VISIBLE });
      expect(JSON.stringify(verified)).not.toContain(INTERNAL);
    });
  });

  it("lets schedulers change the notes, lists them for the calendar with cancellations, and refuses other businesses' appointments", async () => {
    await rollbackTest(async (tx) => {
      const { businessId, userIds, ids, as, context } = await seed(tx);
      await as("lobbystack_app");
      const startsAt = local(4, 9).toUTC().toISO()!;
      const { appointmentId } = await bookAppointmentForOperator(context, { userId: userIds.scheduler, businessId, serviceId: ids.service, startsAt, contactId: ids.milan });
      expect(await updateAppointmentNotes(context, { userId: userIds.scheduler, businessId, appointmentId, notes: "Parking at the back", internalNotes: "  " })).toBe(true);
      expect(await updateAppointmentNotes(context, { userId: userIds.scheduler, businessId, appointmentId: randomUUID(), notes: null, internalNotes: null })).toBe(false);
      await as("lobbystack_migrator");
      await tx.update(appointments).set({ status: "canceled" }).where(eq(appointments.id, appointmentId));
      await as("lobbystack_app");
      const listed = await withBusinessTransaction(context.db, { businessId, userId: userIds.scheduler, actorType: "operator" }, async (appTx) => await listAppointmentsBetween(appTx, businessId, local(4, 0).toJSDate(), local(5, 0).toJSDate()));
      expect(listed).toEqual([expect.objectContaining({ id: appointmentId, status: "canceled", notes: "Parking at the back", internalNotes: null, serviceId: ids.service })]);
    });
  });
});

describe.skipIf(!testUrl)("time off", () => {
  it("adds, lists, moves and deletes a closure and an employee's time off, which booking then treats as busy", async () => {
    await rollbackTest(async (tx) => {
      const { businessId, userIds, ids, as, context } = await seed(tx);
      await as("lobbystack_app");
      const day = local(5, 0).toISODate()!;
      const closure = await saveTimeOff(context, { userId: userIds.owner, businessId, staffId: null, startsAt: `${day}T12:00`, endsAt: `${day}T14:00`, name: "Staff training", note: "Room B" });
      expect(closure).toMatchObject({ staffId: null, name: "Staff training", note: "Room B" });
      const off = await saveTimeOff(context, { userId: userIds.owner, businessId, staffId: ids.ana, startsAt: `${day}T00:00`, endsAt: `${local(6, 0).toISODate()}T00:00`, name: "Vacation" });
      expect(off).toMatchObject({ staffId: ids.ana, staffName: "Ana" });
      await expect(saveTimeOff(context, { userId: userIds.owner, businessId, staffId: null, startsAt: `${day}T13:00`, endsAt: `${day}T15:00`, name: "Overlap" })).rejects.toMatchObject({ status: 400, code: "time_off_overlap" });
      await expect(saveTimeOff(context, { userId: userIds.scheduler, businessId, staffId: null, startsAt: `${day}T16:00`, endsAt: `${day}T17:00`, name: "Not allowed" })).rejects.toMatchObject({ status: 403 });
      await expect(saveTimeOff(context, { userId: userIds.owner, businessId, staffId: null, startsAt: "2020-01-01T00:00", endsAt: "2020-01-02T00:00", name: "Past" })).rejects.toMatchObject({ status: 400 });

      // The closure blocks the business's own slot.
      const openings = await findBookingOpenings(context, { userId: userIds.scheduler, businessId, serviceId: ids.service, date: day });
      expect(openings.openings).not.toContain(local(5, 12).toUTC().toISO());
      expect(openings.openings).toContain(local(5, 15).toUTC().toISO());

      const listed = await withBusinessTransaction(context.db, { businessId, userId: userIds.scheduler, actorType: "operator" }, async (appTx) => await listTimeOffBetween(appTx, businessId, local(5, 0).toJSDate(), local(6, 0).toJSDate()));
      expect(listed.map((entry) => entry.name)).toEqual(["Vacation", "Staff training"]);
      const moved = await saveTimeOff(context, { userId: userIds.owner, businessId, id: closure!.id, staffId: null, startsAt: `${day}T15:00`, endsAt: `${day}T16:00`, name: "Staff training" });
      expect(moved!.startsAt.toISOString()).toBe(local(5, 15).toUTC().toISO());
      expect(await deleteTimeOff(context, { userId: userIds.owner, businessId, id: off!.id })).toBe(true);
      expect(await deleteTimeOff(context, { userId: userIds.owner, businessId, id: off!.id })).toBe(false);
    });
  });

  it("keeps a closure's staff-only note when the hours editor saves the same closure", async () => {
    await rollbackTest(async (tx) => {
      const { businessId, userIds, as, context } = await seed(tx);
      await as("lobbystack_app");
      const day = local(7, 0).toISODate()!;
      await saveTimeOff(context, { userId: userIds.owner, businessId, staffId: null, startsAt: `${day}T00:00`, endsAt: `${local(8, 0).toISODate()}T00:00`, name: "Holiday", note: "Owner away" });
      await as("lobbystack_migrator");
      await replaceBusinessHoursInTransaction(tx, { businessId, hours: [{ dayOfWeek: 1, openMinutes: 540, closeMinutes: 1020 }], closures: [{ startsAt: `${day}T00:00`, endsAt: `${local(8, 0).toISODate()}T00:00`, reason: "Holiday" }] });
      const [row] = await tx.select({ note: closures.note }).from(closures).where(and(eq(closures.businessId, businessId), eq(closures.reason, "Holiday")));
      expect(row).toEqual({ note: "Owner away" });
    });
  });
});
