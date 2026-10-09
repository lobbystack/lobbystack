import { randomUUID } from "node:crypto";

import { and, asc, eq, sql } from "drizzle-orm";
import { DateTime } from "luxon";
import { afterAll, describe, expect, it } from "vitest";
import { appointments, businessHours, businessMemberships, businesses, calls, contacts, createDatabaseClient, notifications, outboxMessages, phoneNumbers, receptionistProfiles, services, smsConsentEvents, staff, users, type Database, type DatabaseTransaction } from "@lobbystack/db";

import { createAppointmentChangeVerification } from "./appointmentChanges";
import { bookAppointment, cancelAppointment, cancelAppointmentForCaller } from "./booking";
import type { SmsConsentAnswer } from "./contactSmsConsent";
import { CANCELLATION_CONFIRMATION, releaseCallTexts, resolveNotificationDelivery } from "./notifications";
import { cancelAppointmentForApi } from "./publicApi/operations";
import { recordTextConsentForCaller } from "./receptionistActions";

// Explicit opt-in only; never fall back to DATABASE_URL or load an env file.
const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
    throw new Error("Cancellation text integration tests require a dedicated local test database.");
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

const sender = "+14165550000";

/**
 * A self-hosted business open all day that texts from its own local number
 * and lets callers cancel by their number and the service. Bookings and the
 * caller's cancel run as the worker, an operator's cancel as the app role,
 * both under RLS.
 */
async function seed(tx: DatabaseTransaction) {
  const businessId = randomUUID();
  const userId = randomUUID();
  await tx.insert(businesses).values({ id: businessId, slug: businessId, name: "Javor", timezone: "UTC", businessType: "test", telemetryEnabled: false, deploymentMode: "self_hosted_standard" });
  await tx.insert(users).values({ id: userId, email: `${userId}@example.invalid`, normalizedEmail: `${userId}@example.invalid` });
  await tx.insert(businessMemberships).values({ businessId, userId, role: "scheduler" });
  await tx.insert(receptionistProfiles).values({ businessId, greeting: "Hi", tone: "warm", summary: "Test", bookingPolicy: "Book", transferMode: "never", bookingMode: "instant", appointmentChangePolicy: { enabled: true, verificationMode: "phone_match_and_facts", allowCancel: true, allowReschedule: true } });
  const [member] = await tx.insert(staff).values({ businessId, name: "Sam", timezone: "UTC" }).returning();
  const [service] = await tx.insert(services).values({ businessId, name: "Cut", slug: "cut", durationMinutes: 30 }).returning();
  await tx.insert(businessHours).values(Array.from({ length: 7 }, (_, dayOfWeek) => ({ businessId, dayOfWeek, openMinutes: 0, closeMinutes: 1439 })));
  await tx.insert(phoneNumbers).values({ businessId, e164: sender, providerPhoneId: `PN-${randomUUID()}` });
  const db = tx as unknown as Database;
  const as = async (role: "lobbystack_worker" | "lobbystack_app") => { await tx.execute(sql.raw(`set local role ${role}`)); };
  const asOwner = async () => { await tx.execute(sql`reset role`); };
  let slots = 0;
  const book = async (phone: string, smsConsent?: SmsConsentAnswer, callId?: string) => {
    await as("lobbystack_worker");
    const startsAt = DateTime.utc().plus({ days: 2 + slots++ }).set({ hour: 12, minute: 0, second: 0, millisecond: 0 }).toISO()!;
    return (await bookAppointment({ db }, { businessId, serviceId: service!.id, startsAt, timezone: "UTC", contactPhone: phone, sourceChannel: "voice", ...(smsConsent ? { smsConsent } : {}), ...(callId ? { callId } : {}) })).appointmentId;
  };
  const addContact = async (phone: string, values: { smsConsentStatus?: string; operatorBlockedAt?: Date } = {}) => {
    await asOwner();
    await tx.insert(contacts).values({ businessId, phone, ...values });
  };
  const consent = async (phone: string) => {
    await asOwner();
    const [row] = await tx.select({ status: contacts.smsConsentStatus, source: contacts.smsConsentSource }).from(contacts).where(and(eq(contacts.businessId, businessId), eq(contacts.phone, phone)));
    const events = await tx.select({ action: smsConsentEvents.action, source: smsConsentEvents.source }).from(smsConsentEvents).where(and(eq(smsConsentEvents.businessId, businessId), eq(smsConsentEvents.phone, phone))).orderBy(asc(smsConsentEvents.occurredAt));
    return { status: row?.status ?? null, source: row?.source ?? null, events };
  };
  /** The appointment's cancellation texts, each with its dispatch job. */
  const cancellationTexts = async (appointmentId: string) => {
    await asOwner();
    const rows = await tx.select().from(notifications).where(and(eq(notifications.relatedId, appointmentId), eq(notifications.kind, CANCELLATION_CONFIRMATION)));
    const jobs = await tx.select({ payload: outboxMessages.payload }).from(outboxMessages).where(and(eq(outboxMessages.topic, "notification.dispatch"), eq(outboxMessages.aggregateId, appointmentId)));
    return rows.map((row) => ({ channel: row.channel, status: row.status, dispatches: jobs.filter((job) => job.payload.notificationId === row.id).length, id: row.id }));
  };
  const deliver = async (appointmentId: string, kind = CANCELLATION_CONFIRMATION) => {
    await asOwner();
    const [row] = await tx.update(notifications).set({ scheduledFor: new Date(Date.now() - 1000) }).where(and(eq(notifications.relatedId, appointmentId), eq(notifications.kind, kind))).returning({ id: notifications.id });
    await as("lobbystack_worker");
    return await resolveNotificationDelivery({ db }, { businessId, notificationId: row!.id });
  };
  const operatorCancel = async (appointmentId: string) => {
    await as("lobbystack_app");
    return await cancelAppointment({ db }, { userId, businessId, appointmentId });
  };
  const callerCancel = async (appointmentId: string, phone: string, callId?: string) => {
    await as("lobbystack_worker");
    const verification = await createAppointmentChangeVerification({ db }, { businessId, callerPhone: phone, action: "cancel", appointmentId, serviceName: "Cut" });
    if (!verification) return { verification, cancelled: null };
    return { verification, cancelled: await cancelAppointmentForCaller({ db }, { businessId, appointmentId, callerPhone: phone, verificationId: verification.verificationId, ...(callId ? { callId } : {}) }) };
  };
  const apiCancel = async (appointmentId: string, actor: "api_key" | "mcp") => {
    await as("lobbystack_worker");
    const caller = actor === "api_key" ? { businessId, apiKeyId: randomUUID() } : { businessId, grantId: randomUUID(), userId, actor: "mcp" as const };
    return (await cancelAppointmentForApi({ db }, caller, appointmentId)).status;
  };
  const pastAppointment = async (phone: string) => {
    await asOwner();
    const [contact] = await tx.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.businessId, businessId), eq(contacts.phone, phone)));
    const startsAt = DateTime.utc().minus({ days: 1 }).toJSDate();
    return (await tx.insert(appointments).values({ businessId, contactId: contact!.id, staffId: member!.id, serviceId: service!.id, startsAt, endsAt: new Date(startsAt.getTime() + 30 * 60_000), timezone: "UTC", status: "confirmed", sourceChannel: "voice" }).returning())[0]!.id;
  };
  /** A phone call from this number, which has its contact as the call's own. */
  const startCall = async (phone: string, startedAt = new Date(Date.now() - 60_000)) => {
    await asOwner();
    const [contact] = await tx.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.businessId, businessId), eq(contacts.phone, phone)));
    const contactId = contact?.id ?? (await tx.insert(contacts).values({ businessId, phone }).returning({ id: contacts.id }))[0]!.id;
    return (await tx.insert(calls).values({ businessId, contactId, providerCallId: randomUUID(), transport: "pstn", startedAt }).returning({ id: calls.id }))[0]!.id;
  };
  const answerTexts = async (callId: string, phone: string, answer: "agreed" | "declined") => {
    await as("lobbystack_worker");
    return await recordTextConsentForCaller({ db }, { businessId, callId, callerPhone: phone, answer });
  };
  /** The text's dispatch job: whether it waits for a call to end, and for which call. */
  const job = async (appointmentId: string, kind: string) => {
    await asOwner();
    const [row] = await tx.select({ id: notifications.id }).from(notifications).where(and(eq(notifications.relatedId, appointmentId), eq(notifications.kind, kind)));
    const jobs = (await tx.select({ payload: outboxMessages.payload, availableAt: outboxMessages.availableAt }).from(outboxMessages).where(eq(outboxMessages.topic, "notification.dispatch"))).filter((item) => item.payload.notificationId === row!.id);
    return jobs.map((item) => ({ held: item.availableAt.getTime() > Date.now(), callId: item.payload.callId }));
  };
  const endCall = async (callId: string) => {
    await as("lobbystack_worker");
    await releaseCallTexts({ db }, { businessId, callId });
  };
  return { book, addContact, consent, cancellationTexts, deliver, operatorCancel, callerCancel, apiCancel, pastAppointment, startCall, answerTexts, job, endCall };
}

describe.skipIf(!client)("the answer to texts given while booking", () => {
  it("records agreed and declined with an event each, and leaves not_asked alone", async () => {
    await rollbackTest(async (tx) => {
      const { book, consent } = await seed(tx);
      await book("+14165550101", "agreed");
      expect(await consent("+14165550101")).toEqual({ status: "subscribed", source: "appointment_booking", events: [{ action: "reminder_consent_granted", source: "appointment_booking" }] });
      await book("+14165550102", "declined");
      expect(await consent("+14165550102")).toEqual({ status: "declined", source: "appointment_booking", events: [{ action: "reminder_consent_declined", source: "appointment_booking" }] });
      await book("+14165550103", "not_asked");
      await book("+14165550104");
      for (const phone of ["+14165550103", "+14165550104"]) expect(await consent(phone)).toEqual({ status: null, source: null, events: [] });
    });
  });

  it("keeps the latest answer, and not_asked keeps the one on file", async () => {
    await rollbackTest(async (tx) => {
      const { book, consent } = await seed(tx);
      await book("+14165550101", "agreed");
      await book("+14165550101", "declined");
      expect((await consent("+14165550101")).status).toBe("declined");
      await book("+14165550101", "not_asked");
      expect((await consent("+14165550101")).status).toBe("declined");
      await book("+14165550101", "agreed");
      expect(await consent("+14165550101")).toMatchObject({ status: "subscribed", events: [{ action: "reminder_consent_granted" }, { action: "reminder_consent_declined" }, { action: "reminder_consent_granted" }] });
    });
  });

  it("never overrides STOP or the business's block", async () => {
    await rollbackTest(async (tx) => {
      const { book, addContact, consent } = await seed(tx);
      await addContact("+14165550105", { smsConsentStatus: "opted_out" });
      await addContact("+14165550106", { smsConsentStatus: "declined", operatorBlockedAt: new Date() });
      for (const answer of ["agreed", "declined"] as const) {
        await book("+14165550105", answer);
        await book("+14165550106", answer);
      }
      expect(await consent("+14165550105")).toMatchObject({ status: "opted_out", events: [] });
      expect(await consent("+14165550106")).toMatchObject({ status: "declined", events: [] });
    });
  });
});

describe.skipIf(!client)("the cancellation text", () => {
  it("is queued once with its dispatch job by every cancel path, and not again for an appointment already cancelled", async () => {
    await rollbackTest(async (tx) => {
      const { book, cancellationTexts, operatorCancel, callerCancel, apiCancel } = await seed(tx);
      const phone = "+14165550101";
      const byOperator = await book(phone, "agreed");
      const byCaller = await book(phone);
      const byApi = await book(phone);
      const byMcp = await book(phone);
      await expect(operatorCancel(byOperator)).resolves.toBe("cancelled");
      expect((await callerCancel(byCaller, phone)).cancelled).not.toBeNull();
      await expect(apiCancel(byApi, "api_key")).resolves.toBe("cancelled");
      await expect(apiCancel(byMcp, "mcp")).resolves.toBe("cancelled");
      // Cancelling again changes nothing.
      await expect(operatorCancel(byOperator)).resolves.toBe("already");
      await expect(apiCancel(byApi, "api_key")).resolves.toBe("cancelled");
      await expect(apiCancel(byMcp, "mcp")).resolves.toBe("cancelled");
      expect((await callerCancel(byCaller, phone)).verification).toBeNull();
      for (const appointmentId of [byOperator, byCaller, byApi, byMcp]) {
        expect(await cancellationTexts(appointmentId)).toEqual([{ channel: "sms", status: "pending", dispatches: 1, id: expect.any(String) }]);
      }
    });
  });

  it("goes to a subscribed contact although the appointment is cancelled, and the booking texts don't", async () => {
    await rollbackTest(async (tx) => {
      const { book, deliver, operatorCancel } = await seed(tx);
      const appointmentId = await book("+14165550101", "agreed");
      await operatorCancel(appointmentId);
      const delivery = await deliver(appointmentId);
      expect(delivery).toMatchObject({ kind: "ready", delivery: { channel: "sms", kind: CANCELLATION_CONFIRMATION, to: "+14165550101", from: sender, subject: "Appointment cancelled" } });
      expect(delivery?.kind === "ready" && delivery.delivery.body).toMatch(/^Javor: your Cut appointment on .+ is cancelled\. Msg & data rates may apply\. Reply STOP to opt out or HELP for help\.$/);
      expect(await deliver(appointmentId, "booking_confirmation")).toMatchObject({ kind: "skipped" });
    });
  });

  it("is skipped for a contact who declined, opted out, was never asked, or is blocked", async () => {
    await rollbackTest(async (tx) => {
      const { book, addContact, deliver, operatorCancel } = await seed(tx);
      await addContact("+14165550103", { smsConsentStatus: "opted_out" });
      await addContact("+14165550104", { smsConsentStatus: "subscribed", operatorBlockedAt: new Date() });
      const declined = await book("+14165550101", "declined");
      const neverAsked = await book("+14165550102");
      const optedOut = await book("+14165550103", "agreed");
      const blocked = await book("+14165550104");
      for (const appointmentId of [declined, neverAsked, optedOut, blocked]) {
        await operatorCancel(appointmentId);
        expect(await deliver(appointmentId)).toMatchObject({ kind: "skipped" });
      }
    });
  });

  it("isn't queued for an appointment that already started", async () => {
    await rollbackTest(async (tx) => {
      const { book, cancellationTexts, operatorCancel, pastAppointment } = await seed(tx);
      await book("+14165550101", "agreed");
      const past = await pastAppointment("+14165550101");
      await expect(operatorCancel(past)).resolves.toBe("cancelled");
      expect(await cancellationTexts(past)).toEqual([]);
    });
  });
});

describe.skipIf(!client)("a caller cancelling on the phone", () => {
  it("shows the answer on file once verified, and follows it when the agent didn't ask", async () => {
    await rollbackTest(async (tx) => {
      const { book, consent, deliver, callerCancel } = await seed(tx);
      const appointmentId = await book("+14165550101", "agreed");
      const { verification, cancelled } = await callerCancel(appointmentId, "+14165550101");
      expect(verification?.smsConsent).toBe("subscribed");
      expect(cancelled?.smsConsentOnFile).toBe("subscribed");
      expect((await consent("+14165550101")).events).toHaveLength(1);
      expect(await deliver(appointmentId)).toMatchObject({ kind: "ready" });
    });
  });

  it("sends nothing after STOP, and cancels nothing for a caller who isn't verified", async () => {
    await rollbackTest(async (tx) => {
      const { book, addContact, deliver, callerCancel } = await seed(tx);
      await addContact("+14165550103", { smsConsentStatus: "opted_out" });
      const optedOut = await book("+14165550103");
      expect((await callerCancel(optedOut, "+14165550103")).cancelled?.smsConsentOnFile).toBe("opted_out");
      expect(await deliver(optedOut)).toMatchObject({ kind: "skipped" });

      const someoneElses = await book("+14165550104");
      expect(await callerCancel(someoneElses, "+14165550199")).toEqual({ verification: null, cancelled: null });
    });
  });
});

describe.skipIf(!client)("the caller's answer about texts on a phone call", () => {
  it("holds the confirmation of a booking made on the call until the call ends, so a later no wins", async () => {
    await rollbackTest(async (tx) => {
      const { book, addContact, consent, deliver, startCall, answerTexts, job, endCall } = await seed(tx);
      const phone = "+14165550101";
      await addContact(phone, { smsConsentStatus: "subscribed" });
      const callId = await startCall(phone);
      const appointmentId = await book(phone, undefined, callId);
      expect(await job(appointmentId, "booking_confirmation")).toEqual([{ held: true, callId }]);
      expect(await answerTexts(callId, phone, "declined")).toBe("declined");
      expect(await consent(phone)).toEqual({ status: "declined", source: "voice_call", events: [{ action: "reminder_consent_declined", source: "voice_call" }] });
      await endCall(callId);
      expect(await job(appointmentId, "booking_confirmation")).toEqual([{ held: false, callId }]);
      expect(await deliver(appointmentId, "booking_confirmation")).toMatchObject({ kind: "skipped" });
      expect(await deliver(appointmentId, "appointment_reminder")).toMatchObject({ kind: "skipped" });

      // A booking made off a call goes out at once.
      const offCall = await book("+14165550102", "agreed");
      expect(await job(offCall, "booking_confirmation")).toEqual([{ held: false, callId: undefined }]);
    });
  });

  it("sends the confirmation when the caller says yes after the booking", async () => {
    await rollbackTest(async (tx) => {
      const { book, deliver, startCall, answerTexts, endCall } = await seed(tx);
      const phone = "+14165550101";
      const callId = await startCall(phone);
      const appointmentId = await book(phone, undefined, callId);
      expect(await answerTexts(callId, phone, "agreed")).toBe("subscribed");
      await endCall(callId);
      expect(await deliver(appointmentId, "booking_confirmation")).toMatchObject({ kind: "ready", delivery: { to: phone } });
    });
  });

  it("holds a caller's cancellation text until the call ends, so a yes after cancelling counts", async () => {
    await rollbackTest(async (tx) => {
      const { book, deliver, callerCancel, startCall, answerTexts, job, endCall } = await seed(tx);
      const phone = "+14165550102";
      const appointmentId = await book(phone);
      const callId = await startCall(phone);
      expect((await callerCancel(appointmentId, phone, callId)).cancelled?.smsConsentOnFile).toBe("not_asked");
      expect(await job(appointmentId, CANCELLATION_CONFIRMATION)).toEqual([{ held: true, callId }]);
      await answerTexts(callId, phone, "agreed");
      await endCall(callId);
      expect(await job(appointmentId, CANCELLATION_CONFIRMATION)).toEqual([{ held: false, callId }]);
      expect(await deliver(appointmentId)).toMatchObject({ kind: "ready", delivery: { kind: CANCELLATION_CONFIRMATION } });
    });
  });

  it("never undoes STOP or answers for another number", async () => {
    await rollbackTest(async (tx) => {
      const { addContact, consent, startCall, answerTexts } = await seed(tx);
      await addContact("+14165550103", { smsConsentStatus: "opted_out" });
      expect(await answerTexts(await startCall("+14165550103"), "+14165550103", "agreed")).toBe("opted_out");
      expect(await consent("+14165550103")).toMatchObject({ status: "opted_out", events: [] });

      expect(await answerTexts(await startCall("+14165550104"), "+14165550199", "agreed")).toBeNull();
      expect(await consent("+14165550199")).toEqual({ status: null, source: null, events: [] });
    });
  });
});
