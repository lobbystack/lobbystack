import { randomInt, randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { DateTime } from "luxon";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { billingAccounts,businessContextSnapshots, businessHours, businessMemberships, businesses, contacts, createDatabaseClient, notifications, operatorNotificationDeliveries, operatorNotificationPreferences, outboxMessages, phoneNumbers, receptionistProfiles, services, smsConsentEvents, staff, users, type Database, type DatabaseTransaction } from "@lobbystack/db";
import { OPERATOR_SMS_DISCLOSURE_VERSION } from "@lobbystack/shared";

import { createAppointmentChangeVerification, issueAppointmentChangeOtp } from "./appointmentChanges";
import { bookAppointment, cancelAppointment } from "./booking";
import type { SmsConsentAnswer } from "./contactSmsConsent";
import { refreshBusinessSnapshot } from "./knowledge";
import { CANCELLATION_CONFIRMATION, defaultOperatorNotificationEventPreferences, queueOperatorAlert, resolveNotificationDelivery } from "./notifications";
import { createAppointmentForApi } from "./publicApi/operations";
import { bookForCaller, type ReceptionistChannel } from "./receptionistActions";
import { receiveSharedSenderSms, SHARED_SENDER_HELP_REPLY, SHARED_SENDER_START_REPLY } from "./sms";

// Explicit opt-in only; never fall back to DATABASE_URL or load an env file.
const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
    throw new Error("Shared SMS sender integration tests require a dedicated local test database.");
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

// The toll-free number LobbyStack verified for every cloud business.
const SHARED = "+18446562290";
/** A North American number no other fixture uses, so a STOP finds only this test's contacts. */
const phone = () => `+1647${String(randomInt(0, 10_000_000)).padStart(7, "0")}`;

// The worker's resolvers trust its login identity, so worker steps switch the
// session user. Operator steps run as the app role. Fixtures run as the owner.
async function asWorker(tx: DatabaseTransaction) { await tx.execute(sql`reset role`); await tx.execute(sql`reset session authorization`); await tx.execute(sql`set local session authorization lobbystack_worker`); }
async function asApp(tx: DatabaseTransaction) { await tx.execute(sql`reset session authorization`); await tx.execute(sql`set local role lobbystack_app`); }
async function asOwner(tx: DatabaseTransaction) { await tx.execute(sql`reset role`); await tx.execute(sql`reset session authorization`); }

/**
 * A business open all day with its own local number, an owner who agreed to
 * SMS alerts, and callers who verify changes with a texted code. Cloud runs on
 * a Starter plan, self-hosted on the self-hosted plan.
 */
async function seed(tx: DatabaseTransaction, options: { selfHosted: boolean }) {
  await asOwner(tx);
  const businessId = randomUUID();
  const userId = randomUUID();
  const ownNumber = `+1416555${String(randomInt(0, 10_000)).padStart(4, "0")}`;
  const ownerPhone = phone();
  await tx.insert(businesses).values({ id: businessId, slug: businessId, name: "Javor", timezone: "UTC", businessType: "test", telemetryEnabled: false, deploymentMode: options.selfHosted ? "self_hosted_standard" : "cloud" });
  await tx.insert(billingAccounts).values({ businessId, billingKey: `business:${businessId}`, plan: options.selfHosted ? "self_hosted_standard" : "starter", subscriptionState: "active" });
  await tx.insert(users).values({ id: userId, email: `${userId}@example.invalid`, normalizedEmail: `${userId}@example.invalid`, phone: ownerPhone });
  await tx.insert(businessMemberships).values({ businessId, userId, role: "business_owner" });
  const eventPreferences = defaultOperatorNotificationEventPreferences();
  eventPreferences.voiceMessage.sms = true;
  await tx.insert(operatorNotificationPreferences).values({ businessId, userId, emailEnabled: false, smsEnabled: true, eventPreferences, smsConsentGrantedAt: new Date(), smsConsentDisclosureVersion: OPERATOR_SMS_DISCLOSURE_VERSION, smsConsentPhone: ownerPhone, smsConsentSource: "operator_settings" });
  await tx.insert(receptionistProfiles).values({ businessId, greeting: "Hi", tone: "warm", summary: "Test", bookingPolicy: "Book", transferMode: "never", bookingMode: "instant", appointmentChangePolicy: { enabled: true, verificationMode: "otp_required", allowCancel: true, allowReschedule: true } });
  const [member] = await tx.insert(staff).values({ businessId, name: "Sam", timezone: "UTC" }).returning();
  const [service] = await tx.insert(services).values({ businessId, name: "Cut", slug: "cut", durationMinutes: 30 }).returning();
  await tx.insert(businessHours).values(Array.from({ length: 7 }, (_, dayOfWeek) => ({ businessId, dayOfWeek, openMinutes: 0, closeMinutes: 1439 })));
  await tx.insert(phoneNumbers).values({ businessId, e164: ownNumber, providerPhoneId: `PN-${randomUUID()}` });
  const db = tx as unknown as Database;
  let slots = 0;
  const nextStart = () => DateTime.utc().plus({ days: 3 + slots++ }).set({ hour: 12, minute: 0, second: 0, millisecond: 0 }).toISO()!;
  const book = async (contactPhone: string, smsConsent?: SmsConsentAnswer) => {
    await asWorker(tx);
    return (await bookAppointment({ db }, { businessId, serviceId: service!.id, startsAt: nextStart(), timezone: "UTC", contactPhone, sourceChannel: "voice", ...(smsConsent ? { smsConsent } : {}) })).appointmentId;
  };
  const bookByAgent = async (contactPhone: string, channel: ReceptionistChannel, smsConsent: SmsConsentAnswer) => {
    await asWorker(tx);
    return await bookForCaller({ db }, { businessId, serviceName: "Cut", startsAt: nextStart(), timezone: "UTC", contactPhone, channel, smsConsent });
  };
  const addContact = async (contactPhone: string, values: { smsConsentStatus?: string | null; smsConsentSource?: string } = {}) => {
    await asOwner(tx);
    await tx.insert(contacts).values({ businessId, phone: contactPhone, ...values });
  };
  /** Resolves the appointment's text of this kind, as the worker does when it's due. */
  const deliver = async (appointmentId: string, kind: string) => {
    await asOwner(tx);
    const [row] = await tx.update(notifications).set({ scheduledFor: new Date(Date.now() - 1000) }).where(and(eq(notifications.relatedId, appointmentId), eq(notifications.kind, kind))).returning({ id: notifications.id });
    await asWorker(tx);
    return await resolveNotificationDelivery({ db }, { businessId, notificationId: row!.id });
  };
  const operatorCancel = async (appointmentId: string) => {
    await asApp(tx);
    return await cancelAppointment({ db }, { userId, businessId, appointmentId });
  };
  const operatorAlertSender = async () => {
    await asWorker(tx);
    const [deliveryId] = await queueOperatorAlert({ db }, { businessId, eventKind: "voiceMessage", eventKey: `voiceMessage:${randomUUID()}`, subject: "New message", body: "A caller left a message." });
    await asOwner(tx);
    return (await tx.select({ sender: operatorNotificationDeliveries.sender }).from(operatorNotificationDeliveries).where(eq(operatorNotificationDeliveries.id, deliveryId!)))[0]?.sender;
  };
  /** Asks for a change code for the appointment, and returns the number it goes out from. */
  const changeCode = async (appointmentId: string, callerPhone: string) => {
    await asWorker(tx);
    const verification = await createAppointmentChangeVerification({ db }, { businessId, appointmentId, callerPhone, action: "cancel", serviceName: "Cut" });
    const issued = await issueAppointmentChangeOtp({ db }, { businessId, verificationId: verification!.verificationId });
    await asOwner(tx);
    const [job] = await tx.select({ payload: outboxMessages.payload }).from(outboxMessages).where(and(eq(outboxMessages.topic, "appointment.sendChangeOtp"), eq(outboxMessages.aggregateId, verification!.verificationId)));
    return { issued, from: job?.payload.from };
  };
  const snapshotSmsNumber = async () => {
    await asWorker(tx);
    await refreshBusinessSnapshot({ db }, { businessId });
    await asOwner(tx);
    const [row] = await tx.select({ snapshot: businessContextSnapshots.snapshot }).from(businessContextSnapshots).where(eq(businessContextSnapshots.businessId, businessId));
    return (row?.snapshot as { contactChannels?: { smsNumber?: string } } | undefined)?.contactChannels?.smsNumber;
  };
  // A booking through the public API, as a Zapier zap or the MCP sends it, saying the customer agreed to texts.
  const bookByApi = async (contactPhone: string) => {
    await asWorker(tx);
    return await createAppointmentForApi({ db }, { businessId, apiKeyId: randomUUID() }, { service_id: service!.id, starts_at: nextStart(), contact_phone: contactPhone, sms_consent: true });
  };
  const consent = async (contactPhone: string) => {
    await asOwner(tx);
    const [row] = await tx.select({ status: contacts.smsConsentStatus, source: contacts.smsConsentSource }).from(contacts).where(and(eq(contacts.businessId, businessId), eq(contacts.phone, contactPhone)));
    const events = await tx.select({ action: smsConsentEvents.action, source: smsConsentEvents.source }).from(smsConsentEvents).where(and(eq(smsConsentEvents.businessId, businessId), eq(smsConsentEvents.phone, contactPhone)));
    // Every event in the test's one transaction has the same timestamp, so compare them as a set.
    return { status: row?.status ?? null, source: row?.source ?? null, events: events.map((event) => `${event.action} ${event.source}`).sort() };
  };
  return { businessId, ownNumber, book, bookByAgent, bookByApi, addContact, deliver, operatorCancel, operatorAlertSender, changeCode, snapshotSmsNumber, consent };
}

/** A text from this phone to the shared sender, applied as the webhook applies it. */
async function textShared(tx: DatabaseTransaction, from: string, body: string) {
  await asWorker(tx);
  const result = await receiveSharedSenderSms({ db: tx as unknown as Database }, { from, body });
  await asOwner(tx);
  return result;
}

describe.skipIf(!client)("the number a business texts from", () => {
  it("is the shared sender on cloud, for every customer text, change codes, operator alerts and the agent's snapshot", async () => {
    vi.stubEnv("TWILIO_ALERT_SMS_FROM", SHARED);
    await rollbackTest(async (tx) => {
      const business = await seed(tx, { selfHosted: false });
      const customer = phone();
      const appointmentId = await business.book(customer, "agreed");
      for (const kind of ["booking_confirmation", "appointment_reminder"]) {
        expect(await business.deliver(appointmentId, kind)).toMatchObject({ kind: "ready", delivery: { kind, to: customer, from: SHARED } });
      }
      expect(await business.changeCode(await business.book(customer), customer)).toMatchObject({ issued: { ok: true }, from: SHARED });
      await business.operatorCancel(appointmentId);
      expect(await business.deliver(appointmentId, CANCELLATION_CONFIRMATION)).toMatchObject({ kind: "ready", delivery: { kind: CANCELLATION_CONFIRMATION, from: SHARED } });
      expect(await business.operatorAlertSender()).toBe(SHARED);
      expect(await business.snapshotSmsNumber()).toBe(SHARED);
    });
  });

  it("is the business's own number when self-hosted, for the same texts", async () => {
    vi.stubEnv("TWILIO_ALERT_SMS_FROM", SHARED);
    await rollbackTest(async (tx) => {
      const business = await seed(tx, { selfHosted: true });
      const customer = phone();
      const appointmentId = await business.book(customer, "agreed");
      for (const kind of ["booking_confirmation", "appointment_reminder"]) {
        expect(await business.deliver(appointmentId, kind)).toMatchObject({ kind: "ready", delivery: { kind, from: business.ownNumber } });
      }
      expect(await business.changeCode(await business.book(customer), customer)).toMatchObject({ issued: { ok: true }, from: business.ownNumber });
      await business.operatorCancel(appointmentId);
      expect(await business.deliver(appointmentId, CANCELLATION_CONFIRMATION)).toMatchObject({ kind: "ready", delivery: { from: business.ownNumber } });
      expect(await business.operatorAlertSender()).toBe(business.ownNumber);
      expect(await business.snapshotSmsNumber()).toBe(business.ownNumber);
    });
  });

  it("can't reach a number outside North America from the toll-free shared sender", async () => {
    vi.stubEnv("TWILIO_ALERT_SMS_FROM", SHARED);
    await rollbackTest(async (tx) => {
      const abroad = `+38169${String(randomInt(0, 10_000_000)).padStart(7, "0")}`;
      const cloud = await seed(tx, { selfHosted: false });
      const cloudAppointment = await cloud.book(abroad, "agreed");
      expect(await cloud.deliver(cloudAppointment, "booking_confirmation")).toMatchObject({ kind: "skipped" });
      expect((await cloud.changeCode(await cloud.book(abroad), abroad)).issued).toMatchObject({ ok: false, status: "unavailable" });
      // A self-hosted business's local number can.
      const selfHosted = await seed(tx, { selfHosted: true });
      expect(await selfHosted.deliver(await selfHosted.book(abroad, "agreed"), "booking_confirmation")).toMatchObject({ kind: "ready", delivery: { to: abroad, from: selfHosted.ownNumber } });
    });
  });

  it("sends nothing on cloud when no shared sender is configured", async () => {
    vi.stubEnv("TWILIO_ALERT_SMS_FROM", "");
    await rollbackTest(async (tx) => {
      const cloud = await seed(tx, { selfHosted: false });
      expect(await cloud.deliver(await cloud.book(phone(), "agreed"), "booking_confirmation")).toMatchObject({ kind: "skipped" });
      expect(await cloud.snapshotSmsNumber()).toBeUndefined();
    });
  });
});

describe.skipIf(!client)("STOP and START to the shared sender", () => {
  it("STOP opts the phone out at every business and START restores each contact, keeping a declined one declined", async () => {
    vi.stubEnv("TWILIO_ALERT_SMS_FROM", SHARED);
    await rollbackTest(async (tx) => {
      const customer = phone();
      const subscribedAt = await seed(tx, { selfHosted: false });
      const declinedAt = await seed(tx, { selfHosted: false });
      const neverAskedAt = await seed(tx, { selfHosted: false });
      const appointmentId = await subscribedAt.book(customer, "agreed");
      await declinedAt.book(customer, "declined");
      await neverAskedAt.book(customer);

      expect(await textShared(tx, customer, "Stop")).toEqual({ reply: null, contactsChanged: 3 });
      for (const business of [subscribedAt, declinedAt, neverAskedAt]) expect(await business.consent(customer)).toMatchObject({ status: "opted_out", source: "shared_sender:STOP" });
      expect((await subscribedAt.consent(customer)).events).toEqual(["opted_out shared_sender:STOP", "reminder_consent_granted appointment_booking"]);
      // Queued texts stop at delivery.
      expect(await subscribedAt.deliver(appointmentId, "appointment_reminder")).toMatchObject({ kind: "skipped" });

      expect(await textShared(tx, customer, "START")).toEqual({ reply: SHARED_SENDER_START_REPLY, contactsChanged: 3 });
      expect(await subscribedAt.consent(customer)).toMatchObject({ status: "subscribed", source: "shared_sender:START" });
      expect(await declinedAt.consent(customer)).toMatchObject({ status: "declined", events: ["opt_out_cleared shared_sender:START", "opted_out shared_sender:STOP", "reminder_consent_declined appointment_booking"] });
      expect(await neverAskedAt.consent(customer)).toMatchObject({ status: null, events: ["opt_out_cleared shared_sender:START", "opted_out shared_sender:STOP"] });
      expect((await subscribedAt.consent(customer)).events).toContain("resubscribed shared_sender:START");
      expect(await subscribedAt.deliver(appointmentId, "appointment_reminder")).toMatchObject({ kind: "ready", delivery: { from: SHARED } });
    });
  });

  it("takes a repeated STOP or START once, so START still restores the first status", async () => {
    await rollbackTest(async (tx) => {
      const customer = phone();
      const business = await seed(tx, { selfHosted: false });
      await business.book(customer, "agreed");
      expect((await textShared(tx, customer, "STOP")).contactsChanged).toBe(1);
      expect((await textShared(tx, customer, "UNSUBSCRIBE")).contactsChanged).toBe(0);
      expect((await textShared(tx, customer, "START")).contactsChanged).toBe(1);
      expect((await textShared(tx, customer, "START")).contactsChanged).toBe(0);
      expect(await business.consent(customer)).toMatchObject({ status: "subscribed", events: ["opted_out shared_sender:STOP", "reminder_consent_granted appointment_booking", "resubscribed shared_sender:START"] });
    });
  });

  it("leaves a contact that opted out another way opted out", async () => {
    await rollbackTest(async (tx) => {
      const customer = phone();
      const business = await seed(tx, { selfHosted: true });
      // STOP to the business's own number.
      await business.addContact(customer, { smsConsentStatus: "opted_out", smsConsentSource: "keyword:STOP" });
      expect((await textShared(tx, customer, "STOP")).contactsChanged).toBe(0);
      expect((await textShared(tx, customer, "START")).contactsChanged).toBe(0);
      expect(await business.consent(customer)).toEqual({ status: "opted_out", source: "keyword:STOP", events: [] });
    });
  });

  it("answers HELP and START, and nothing else", async () => {
    await rollbackTest(async (tx) => {
      const customer = phone();
      const business = await seed(tx, { selfHosted: false });
      await business.book(customer, "agreed");
      expect(await textShared(tx, customer, "help")).toEqual({ reply: SHARED_SENDER_HELP_REPLY, contactsChanged: 0 });
      expect(await textShared(tx, customer, "Can I move my appointment?")).toEqual({ reply: null, contactsChanged: 0 });
      expect(await business.consent(customer)).toMatchObject({ status: "subscribed" });
    });
  });

  it("lets only the worker list a phone's businesses", async () => {
    await rollbackTest(async (tx) => {
      const customer = phone();
      const business = await seed(tx, { selfHosted: false });
      await business.book(customer, "agreed");
      await asWorker(tx);
      const asWorkerRows = await tx.transaction(async (inner) => {
        await inner.execute(sql`select set_config('app.actor_type', 'worker', true)`);
        return (await inner.execute<{ business_id: string }>(sql`select app.list_businesses_by_contact_phone(${customer}) as business_id`)).rows;
      });
      expect(asWorkerRows).toEqual([{ business_id: business.businessId }]);
      await asApp(tx);
      await expect(tx.transaction(async (inner) => await inner.execute(sql`select app.list_businesses_by_contact_phone(${customer})`))).rejects.toThrow();
      await asOwner(tx);
    });
  });
});

describe.skipIf(!client)("text consent a business sends through the API or MCP", () => {
  // The shared number's toll-free verification covers consent the receptionist collects on a call only.
  it("doesn't count on cloud, where texts come from the shared number, and counts when self-hosted", async () => {
    vi.stubEnv("TWILIO_ALERT_SMS_FROM", SHARED);
    await rollbackTest(async (tx) => {
      const cloud = await seed(tx, { selfHosted: false });
      const customer = phone();
      await cloud.bookByApi(customer);
      expect(await cloud.consent(customer)).toEqual({ status: null, source: null, events: [] });
      const selfHosted = await seed(tx, { selfHosted: true });
      await selfHosted.bookByApi(customer);
      expect(await selfHosted.consent(customer)).toMatchObject({ status: "subscribed", events: ["reminder_consent_granted appointment_booking"] });
    });
  });
});

describe.skipIf(!client)("text consent the receptionist records", () => {
  it.each(["web_chat", "web_voice"] as const)("ignores an answer given in a %s and records one given on a phone call", async (channel) => {
    vi.stubEnv("TWILIO_ALERT_SMS_FROM", SHARED);
    await rollbackTest(async (tx) => {
      const business = await seed(tx, { selfHosted: false });
      const visitor = phone();
      expect(await business.bookByAgent(visitor, channel, "agreed")).toMatchObject({ ok: true });
      expect(await business.consent(visitor)).toEqual({ status: null, source: null, events: [] });
      expect(await business.bookByAgent(visitor, channel, "declined")).toMatchObject({ ok: true });
      expect(await business.consent(visitor)).toEqual({ status: null, source: null, events: [] });
      expect(await business.bookByAgent(visitor, "voice", "agreed")).toMatchObject({ ok: true });
      expect(await business.consent(visitor)).toMatchObject({ status: "subscribed", events: ["reminder_consent_granted appointment_booking"] });
    });
  });
});
