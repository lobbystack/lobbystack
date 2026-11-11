import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { appointments, businesses, calls, contacts, conversations, createDatabaseClient, inboxItems, services, staff, withBusinessTransaction, type Database, type DatabaseTransaction } from "@lobbystack/db";

import { closePassedAppointmentRequests } from "./appointmentRequests";
import { CANCELLATION_REQUEST, countOpenVoiceFollowUps, RESCHEDULE_REQUEST } from "./voice";

// Explicit opt-in only; never fall back to DATABASE_URL or load an env file.
const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
    throw new Error("Appointment request integration tests require a dedicated local test database.");
  }
}
const client = testUrl ? createDatabaseClient("lobbystack_migrator", { DATABASE_URL: testUrl }) : undefined;
afterAll(async () => { await client?.pool.end(); });

async function rollbackTest(run: (tx: DatabaseTransaction) => Promise<void>) {
  const rollback = new Error("rollback test fixture");
  await expect(client!.db.transaction(async (tx) => {
    await run(tx);
    throw rollback;
  })).rejects.toBe(rollback);
}

const HOUR = 60 * 60_000;

/** A business with an appointment an hour ago and one tomorrow. */
async function seedBusiness(tx: DatabaseTransaction) {
  const businessId = randomUUID();
  await tx.insert(businesses).values({ id: businessId, slug: businessId, name: "Request sweep test", timezone: "America/Toronto", businessType: "test", telemetryEnabled: false });
  const [contact] = await tx.insert(contacts).values({ businessId, name: "Milan", phone: "+14165550100" }).returning();
  const [employee] = await tx.insert(staff).values({ businessId, name: "Sam", timezone: "America/Toronto" }).returning();
  const [service] = await tx.insert(services).values({ businessId, name: "Consultation", slug: "consultation", durationMinutes: 30 }).returning();
  const book = async (startsAt: Date) => (await tx.insert(appointments).values({ businessId, contactId: contact!.id, staffId: employee!.id, serviceId: service!.id, startsAt, endsAt: new Date(startsAt.getTime() + 30 * 60_000), timezone: "America/Toronto", status: "confirmed", sourceChannel: "voice" }).returning())[0]!.id;
  return { businessId, past: await book(new Date(Date.now() - HOUR)), upcoming: await book(new Date(Date.now() + 24 * HOUR)) };
}

describe.skipIf(!client)("closing requests about appointments that have passed", () => {
  it("closes open requests whose appointment has started, as the worker, and leaves the rest open", async () => {
    await rollbackTest(async (tx) => {
      const own = await seedBusiness(tx);
      const other = await seedBusiness(tx);
      const request = async (businessId: string, metadata: Record<string, unknown> | null, status = "open") => (await tx.insert(inboxItems).values({ businessId, kind: "voice_message", title: "Voice message from Milan", body: "Cancellation request: appointment", status, ...(metadata ? { metadata } : {}) }).returning({ id: inboxItems.id }))[0]!.id;
      const ids = {
        passed: await request(own.businessId, { request: CANCELLATION_REQUEST, appointmentId: own.past }),
        passedReschedule: await request(own.businessId, { request: RESCHEDULE_REQUEST, appointmentId: own.past }),
        upcoming: await request(own.businessId, { request: CANCELLATION_REQUEST, appointmentId: own.upcoming }),
        unlinked: await request(own.businessId, { request: CANCELLATION_REQUEST }),
        badId: await request(own.businessId, { request: CANCELLATION_REQUEST, appointmentId: "not-a-uuid" }),
        // An id from another business never matches.
        foreign: await request(own.businessId, { request: CANCELLATION_REQUEST, appointmentId: other.past }),
        message: await request(own.businessId, { appointmentId: own.past }),
        otherBusiness: await request(other.businessId, { request: CANCELLATION_REQUEST, appointmentId: other.past }),
      };

      await tx.execute(sql`set local role lobbystack_worker`);
      const context = { db: tx as unknown as Database };
      expect(await closePassedAppointmentRequests(context, { businessId: own.businessId })).toEqual({ closed: 2 });
      // A second run finds nothing left to close.
      expect(await closePassedAppointmentRequests(context, { businessId: own.businessId })).toEqual({ closed: 0 });
      // Once tomorrow's appointment has started too, its request closes.
      expect(await closePassedAppointmentRequests(context, { businessId: own.businessId, now: new Date(Date.now() + 25 * HOUR) })).toEqual({ closed: 1 });

      await tx.execute(sql`reset role`);
      const status = async (id: string) => (await tx.select({ status: inboxItems.status }).from(inboxItems).where(eq(inboxItems.id, id)))[0]!.status;
      const statuses: Record<string, string> = {};
      for (const [name, id] of Object.entries(ids)) statuses[name] = await status(id);
      expect(statuses).toEqual({
        passed: "done", passedReschedule: "done", upcoming: "done", unlinked: "open", badId: "open", foreign: "open", message: "open", otherBusiness: "open",
      });
    });
  });

  it("counts a call's messages once and each request on its own, as Home lists them", async () => {
    await rollbackTest(async (tx) => {
      const { businessId, past } = await seedBusiness(tx);
      const conversationId = randomUUID();
      await tx.insert(conversations).values({ id: conversationId, businessId, channel: "voice" });
      const [call] = await tx.insert(calls).values({ businessId, conversationId, provider: "openai_live", providerCallId: `rtc_${randomUUID()}`, transport: "voice", status: "completed", startedAt: new Date() }).returning();
      const item = (values: Partial<typeof inboxItems.$inferInsert>) => ({ businessId, kind: "voice_message", title: "Voice message from Milan", body: "Please call back.", ...values });
      await tx.insert(inboxItems).values([
        item({ relatedCallId: call!.id }),
        item({ relatedCallId: call!.id }),
        item({ relatedCallId: call!.id, metadata: { request: CANCELLATION_REQUEST, appointmentId: past } }),
        item({}),
        item({ status: "done" }),
      ]);
      await tx.execute(sql`set local role lobbystack_worker`);
      const count = await withBusinessTransaction(tx as unknown as Database, { businessId, actorType: "worker" }, async (inner) => await countOpenVoiceFollowUps(inner, businessId));
      expect(count).toBe(3);
    });
  });
});
