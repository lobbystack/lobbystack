import { randomInt, randomUUID } from "node:crypto";

import { and, eq, like, sql } from "drizzle-orm";
import { DateTime } from "luxon";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { appointments, businessHours, businessMemberships, businesses, calendarConnections, contacts, createDatabaseClient, notifications, operatorNotificationDeliveries, outboxMessages, services, staff, users, type Database, type DatabaseTransaction } from "@lobbystack/db";

import { bookAppointment, followCalendarBookingChanges, followCalendarVideoLinks, rescheduleAppointmentInTransaction } from "./booking";
import type { SmsConsentAnswer } from "./contactSmsConsent";
import { updateAppointmentSyncState } from "./calendar";
import { VIDEO_LINK_UPDATE, confirmationRetryAt, resolveNotificationDelivery } from "./notifications";
import { deliverOutbound } from "./outboundDelivery";

// Explicit opt-in only; never fall back to DATABASE_URL or load an env file.
const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
    throw new Error("Video link integration tests require a dedicated local test database.");
  }
}
const client = testUrl ? createDatabaseClient("lobbystack_migrator", { DATABASE_URL: testUrl }) : undefined;
afterAll(async () => { await client?.pool.end(); });
afterEach(() => { vi.unstubAllEnvs(); });

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

async function asWorker(tx: DatabaseTransaction) { await tx.execute(sql`reset session authorization`); await tx.execute(sql`set local session authorization lobbystack_worker`); }
async function asOwner(tx: DatabaseTransaction) { await tx.execute(sql`reset session authorization`); }

const OLD_LINK = "https://app.cal.com/video/old";
const NEW_LINK = "https://app.cal.com/video/new";

/** A business open all day that books into a Cal.com event type, or with `provider`. */
async function seed(tx: DatabaseTransaction, provider = "calcom") {
  vi.stubEnv("TWILIO_ALERT_SMS_FROM", "+18446562290");
  await asOwner(tx);
  const businessId = randomUUID();
  await tx.insert(businesses).values({ id: businessId, slug: businessId, name: "Javor", timezone: "UTC", businessType: "test", telemetryEnabled: false, deploymentMode: "cloud" });
  const [member] = await tx.insert(staff).values({ businessId, name: "Sam", timezone: "UTC" }).returning();
  const [service] = await tx.insert(services).values({ businessId, name: "Consult", slug: "consult", durationMinutes: 30 }).returning();
  await tx.insert(businessHours).values(Array.from({ length: 7 }, (_, dayOfWeek) => ({ businessId, dayOfWeek, openMinutes: 0, closeMinutes: 1439 })));
  const ownerUserId = randomUUID();
  await tx.insert(users).values({ id: ownerUserId, email: `${ownerUserId}@example.invalid`, normalizedEmail: `${ownerUserId}@example.invalid` });
  await tx.insert(businessMemberships).values({ businessId, userId: ownerUserId, role: "business_owner" });
  await tx.insert(calendarConnections).values({ businessId, ownerUserId, provider, externalAccountId: "account", status: "connected", selectedCalendarId: "42", lastSyncedAt: new Date() });
  const db = tx as unknown as Database;
  const context = { db };
  const start = (days: number) => DateTime.utc().plus({ days }).set({ hour: 12, minute: 0, second: 0, millisecond: 0 }).toISO()!;
  const book = async (smsConsent?: SmsConsentAnswer, email?: string) => {
    const contactPhone = `+1647${String(randomInt(0, 10_000_000)).padStart(7, "0")}`;
    if (email) {
      await asOwner(tx);
      await tx.insert(contacts).values({ businessId, phone: contactPhone, email });
    }
    await asWorker(tx);
    return (await bookAppointment(context, { businessId, serviceId: service!.id, startsAt: start(3), timezone: "UTC", contactPhone, sourceChannel: "voice", ...(smsConsent ? { smsConsent } : {}) })).appointmentId;
  };
  /** What the sync job saves once the provider has answered. */
  const synced = async (appointmentId: string, videoUrl: string | null, externalEventId = `uid-${appointmentId}`) => {
    await asWorker(tx);
    await updateAppointmentSyncState(context, { businessId, appointmentId, state: "synced", externalEventId, videoUrl });
  };
  /** Resolves the appointment's text of this kind, as the worker does when it's due. */
  const deliver = async (appointmentId: string, kind: string) => {
    await asOwner(tx);
    const [row] = await tx.update(notifications).set({ scheduledFor: new Date(Date.now() - 1000) }).where(and(eq(notifications.relatedId, appointmentId), kind.endsWith("%") ? like(notifications.kind, kind) : eq(notifications.kind, kind))).returning({ id: notifications.id });
    await asWorker(tx);
    return await resolveNotificationDelivery(context, { businessId, notificationId: row!.id });
  };
  const markSent = async (appointmentId: string, kind: string) => {
    await asOwner(tx);
    await tx.update(notifications).set({ status: "sent" }).where(and(eq(notifications.relatedId, appointmentId), eq(notifications.kind, kind)));
  };
  const updates = async (appointmentId: string) => {
    await asOwner(tx);
    return await tx.select({ id: notifications.id }).from(notifications).where(and(eq(notifications.relatedId, appointmentId), like(notifications.kind, `${VIDEO_LINK_UPDATE}:%`)));
  };
  /** The email alerts the team got. */
  const alerts = async (business: string) => {
    await asOwner(tx);
    return await tx.select({ body: operatorNotificationDeliveries.body }).from(operatorNotificationDeliveries).where(eq(operatorNotificationDeliveries.businessId, business));
  };
  const saved = async (appointmentId: string) => {
    await asOwner(tx);
    return (await tx.select({ videoUrl: appointments.videoUrl }).from(appointments).where(eq(appointments.id, appointmentId)))[0]?.videoUrl;
  };
  return { businessId, context, start, book, synced, deliver, markSent, updates, saved, alerts, staffId: member!.id };
}

const textOf = (resolution: Awaited<ReturnType<typeof resolveNotificationDelivery>>) => resolution?.kind === "ready" ? resolution.delivery.body : null;

describe.skipIf(!testUrl)("video links in appointment texts", () => {
  it("puts the link in the confirmation and the reminder, with no extra text", async () => {
    await rollbackTest(async (tx) => {
      const { book, synced, deliver, updates } = await seed(tx);
      const appointmentId = await book("agreed");
      await synced(appointmentId, OLD_LINK);
      expect(textOf(await deliver(appointmentId, "booking_confirmation"))).toContain(`Join: ${OLD_LINK}`);
      expect(textOf(await deliver(appointmentId, "appointment_reminder"))).toContain(`Join: ${OLD_LINK}`);
      expect(await updates(appointmentId)).toEqual([]);
    });
  });

  it("sends the same texts as before for a booking without a link", async () => {
    await rollbackTest(async (tx) => {
      const { book, synced, deliver, updates } = await seed(tx);
      const appointmentId = await book("agreed");
      await synced(appointmentId, null);
      expect(textOf(await deliver(appointmentId, "booking_confirmation"))).toMatch(/^Javor: your Consult appointment is confirmed for .+\. Msg & data rates/);
      expect(await updates(appointmentId)).toEqual([]);
    });
  });

  it("texts the link on its own when it arrives after the confirmation went out", async () => {
    await rollbackTest(async (tx) => {
      const { businessId, context, book, synced, markSent, deliver, updates, saved } = await seed(tx);
      const appointmentId = await book("agreed");
      await synced(appointmentId, null);
      await markSent(appointmentId, "booking_confirmation");
      await asWorker(tx);
      await followCalendarVideoLinks(context, { businessId, links: [{ eventId: `uid-${appointmentId}`, videoUrl: OLD_LINK }] });
      expect(await saved(appointmentId)).toBe(OLD_LINK);
      expect(await updates(appointmentId)).toHaveLength(1);
      await asOwner(tx);
      expect(await tx.select().from(outboxMessages).where(and(eq(outboxMessages.aggregateId, appointmentId), eq(outboxMessages.topic, "notification.dispatch"), sql`${outboxMessages.payload}->>'notificationId' = ${(await updates(appointmentId))[0]!.id}`))).toHaveLength(1);
      expect(textOf(await deliver(appointmentId, `${VIDEO_LINK_UPDATE}:%`))).toContain(`: ${OLD_LINK} Msg & data`);
      await asWorker(tx);
      await followCalendarVideoLinks(context, { businessId, links: [{ eventId: `uid-${appointmentId}`, videoUrl: OLD_LINK }] });
      expect(await updates(appointmentId)).toHaveLength(1);
    });
  });

  it("sends the new link after a reschedule changes it, and the reminder carries it", async () => {
    await rollbackTest(async (tx) => {
      const { businessId, start, book, synced, markSent, deliver, updates } = await seed(tx);
      const appointmentId = await book("agreed");
      await synced(appointmentId, OLD_LINK);
      await markSent(appointmentId, "booking_confirmation");
      await asWorker(tx);
      await rescheduleAppointmentInTransaction(tx, { businessId, appointmentId, startsAt: start(5), change: { source: "caller" } });
      await synced(appointmentId, NEW_LINK, "moved-uid");
      expect(await updates(appointmentId)).toHaveLength(1);
      const text = textOf(await deliver(appointmentId, `${VIDEO_LINK_UPDATE}:%`));
      expect(text).toContain(NEW_LINK);
      expect(text).not.toContain(OLD_LINK);
      expect(textOf(await deliver(appointmentId, "appointment_reminder"))).toContain(`Join: ${NEW_LINK}`);
    });
  });

  it("sends nothing new when a reschedule keeps the link", async () => {
    await rollbackTest(async (tx) => {
      const { businessId, start, book, synced, markSent, updates } = await seed(tx);
      const appointmentId = await book("agreed");
      await synced(appointmentId, OLD_LINK);
      await markSent(appointmentId, "booking_confirmation");
      await asWorker(tx);
      await rescheduleAppointmentInTransaction(tx, { businessId, appointmentId, startsAt: start(5), change: { source: "caller" } });
      await synced(appointmentId, OLD_LINK, "moved-uid");
      expect(await updates(appointmentId)).toEqual([]);
    });
  });

  it("follows a booking moved in Cal.com to its new link", async () => {
    await rollbackTest(async (tx) => {
      const { businessId, context, start, book, synced, markSent, deliver } = await seed(tx);
      const appointmentId = await book("agreed");
      await synced(appointmentId, OLD_LINK);
      await markSent(appointmentId, "booking_confirmation");
      const startsAt = start(5);
      await asWorker(tx);
      await followCalendarBookingChanges(context, { businessId, provider: "Cal.com", changes: { cancelled: [], moved: [{ eventId: `uid-${appointmentId}`, toEventId: "moved-uid", startsAt, endsAt: DateTime.fromISO(startsAt).plus({ minutes: 30 }).toISO()! }] } });
      await followCalendarVideoLinks(context, { businessId, links: [{ eventId: "moved-uid", videoUrl: NEW_LINK }] });
      expect(textOf(await deliver(appointmentId, `${VIDEO_LINK_UPDATE}:%`))).toContain(NEW_LINK);
    });
  });

  it("emails a caller who declined texts their real address, for the confirmation, reminder and changed link", async () => {
    await rollbackTest(async (tx) => {
      const { businessId, context, book, synced, deliver, alerts } = await seed(tx);
      const appointmentId = await book("declined", "caller@example.com");
      await synced(appointmentId, OLD_LINK);
      const providers = { email: { sendTemplate: vi.fn(async () => ({ messageId: "email-1" })) } };
      for (const kind of ["booking_confirmation", "appointment_reminder"]) {
        const resolved = await deliver(appointmentId, kind);
        expect(resolved).toMatchObject({ kind: "ready", delivery: { channel: "email", to: "caller@example.com" } });
        expect(textOf(resolved)).toContain(`Join: ${OLD_LINK}`);
        expect(textOf(resolved)).not.toContain("Reply STOP");
        await asOwner(tx);
        await tx.update(notifications).set({ status: "sent" }).where(and(eq(notifications.relatedId, appointmentId), eq(notifications.kind, kind)));
      }
      await synced(appointmentId, NEW_LINK, "moved-uid");
      await asOwner(tx);
      const [update] = await tx.update(notifications).set({ scheduledFor: new Date(Date.now() - 1000) }).where(and(eq(notifications.relatedId, appointmentId), like(notifications.kind, `${VIDEO_LINK_UPDATE}:%`))).returning({ id: notifications.id });
      await asWorker(tx);
      await expect(deliverOutbound(context, providers, { kind: "notification", businessId, notificationId: update!.id })).resolves.toMatchObject({ status: "completed" });
      expect(providers.email.sendTemplate).toHaveBeenCalledWith(expect.objectContaining({ to: "caller@example.com", variables: { message: expect.stringContaining(NEW_LINK) } }));
      await asOwner(tx);
      expect((await tx.select({ channel: notifications.channel, status: notifications.status }).from(notifications).where(eq(notifications.id, update!.id)))[0]).toEqual({ channel: "email", status: "sent" });
      expect(await alerts(businessId)).toEqual([]);
    });
  });

  it.each([
    ["no email", undefined],
    ["only a stand-in address", "booking+6f1c3a52-9b3d-4f6e-8a51-2c0e7d9b1a44@placeholder.example"],
  ])("alerts the team once with the link when the caller declined texts and has %s", async (_case, email) => {
    await rollbackTest(async (tx) => {
      vi.stubEnv("CALCOM_PLACEHOLDER_EMAIL_DOMAIN", "placeholder.example");
      const { businessId, book, synced, deliver, alerts } = await seed(tx);
      const appointmentId = await book("declined", email);
      await synced(appointmentId, OLD_LINK);
      expect((await deliver(appointmentId, "booking_confirmation"))?.kind).toBe("skipped");
      expect((await deliver(appointmentId, "appointment_reminder"))?.kind).toBe("skipped");
      const sent = await alerts(businessId);
      expect(sent).toHaveLength(1);
      expect(sent[0]!.body).toContain(OLD_LINK);
      expect(sent[0]!.body).not.toContain("@placeholder.example");
    });
  });

  it("alerts the team when a caller who declined texts has a new link and no email", async () => {
    await rollbackTest(async (tx) => {
      const { businessId, book, synced, deliver, alerts } = await seed(tx);
      const appointmentId = await book("declined");
      await synced(appointmentId, OLD_LINK);
      await deliver(appointmentId, "booking_confirmation");
      await asOwner(tx);
      await tx.update(notifications).set({ status: "skipped" }).where(and(eq(notifications.relatedId, appointmentId), eq(notifications.kind, "booking_confirmation")));
      await synced(appointmentId, NEW_LINK, "moved-uid");
      await deliver(appointmentId, `${VIDEO_LINK_UPDATE}:%`);
      const bodies = (await alerts(businessId)).map(({ body }) => body);
      expect(bodies).toHaveLength(2);
      expect(bodies).toEqual(expect.arrayContaining([expect.stringContaining(NEW_LINK)]));
    });
  });

  it("alerts the team when no email provider can carry the link", async () => {
    await rollbackTest(async (tx) => {
      const { businessId, context, book, synced, alerts } = await seed(tx);
      const appointmentId = await book("declined", "caller@example.com");
      await synced(appointmentId, OLD_LINK);
      await asOwner(tx);
      const [row] = await tx.update(notifications).set({ scheduledFor: new Date(Date.now() - 1000) }).where(and(eq(notifications.relatedId, appointmentId), eq(notifications.kind, "booking_confirmation"))).returning({ id: notifications.id });
      await asWorker(tx);
      await deliverOutbound(context, {}, { kind: "notification", businessId, notificationId: row!.id });
      expect(await alerts(businessId)).toHaveLength(1);
    });
  });

  it("leaves a booking without a link as it was: no email, and no alert", async () => {
    await rollbackTest(async (tx) => {
      const { businessId, book, synced, deliver, alerts } = await seed(tx);
      const appointmentId = await book("declined", "caller@example.com");
      await synced(appointmentId, null);
      expect((await deliver(appointmentId, "booking_confirmation"))?.kind).toBe("skipped");
      expect(await alerts(businessId)).toEqual([]);
    });
  });

  it("sends nothing to a contact the team blocked", async () => {
    await rollbackTest(async (tx) => {
      const { businessId, book, synced, deliver, alerts } = await seed(tx);
      const appointmentId = await book("agreed", "caller@example.com");
      await synced(appointmentId, OLD_LINK);
      await asOwner(tx);
      await tx.update(contacts).set({ operatorBlockedAt: new Date() }).where(eq(contacts.businessId, businessId));
      expect((await deliver(appointmentId, "booking_confirmation"))?.kind).toBe("skipped");
      expect(await alerts(businessId)).toEqual([]);
    });
  });

  it("queues no link text for a cancelled appointment", async () => {
    await rollbackTest(async (tx) => {
      const { businessId, context, book, synced, markSent, updates } = await seed(tx);
      const appointmentId = await book("agreed");
      await synced(appointmentId, null);
      await markSent(appointmentId, "booking_confirmation");
      await asOwner(tx);
      await tx.update(appointments).set({ status: "canceled" }).where(eq(appointments.id, appointmentId));
      await asWorker(tx);
      await updateAppointmentSyncState(context, { businessId, appointmentId, state: "synced", videoUrl: OLD_LINK });
      expect(await updates(appointmentId)).toEqual([]);
    });
  });

  it("holds a Cal.com confirmation for the sync, up to a limit, and no other", async () => {
    await rollbackTest(async (tx) => {
      const { businessId, context, book, synced } = await seed(tx);
      const appointmentId = await book("agreed");
      const confirmation = async () => (await tx.select({ id: notifications.id }).from(notifications).where(and(eq(notifications.relatedId, appointmentId), eq(notifications.kind, "booking_confirmation"))))[0]!.id;
      await asOwner(tx);
      const notificationId = await confirmation();
      await asWorker(tx);
      expect(await confirmationRetryAt(context, { businessId, notificationId })).toBeInstanceOf(Date);
      await asOwner(tx);
      await tx.update(notifications).set({ scheduledFor: new Date(Date.now() - 3 * 60_000) }).where(eq(notifications.id, notificationId));
      await asWorker(tx);
      expect(await confirmationRetryAt(context, { businessId, notificationId })).toBeNull();
      await asOwner(tx);
      await tx.update(notifications).set({ scheduledFor: new Date() }).where(eq(notifications.id, notificationId));
      await synced(appointmentId, OLD_LINK);
      expect(await confirmationRetryAt(context, { businessId, notificationId })).toBeNull();
    });
    await rollbackTest(async (tx) => {
      const { businessId, context, book } = await seed(tx, "google");
      const appointmentId = await book("agreed");
      await asOwner(tx);
      const [row] = await tx.select({ id: notifications.id }).from(notifications).where(and(eq(notifications.relatedId, appointmentId), eq(notifications.kind, "booking_confirmation")));
      await asWorker(tx);
      expect(await confirmationRetryAt(context, { businessId, notificationId: row!.id })).toBeNull();
    });
  });
});
