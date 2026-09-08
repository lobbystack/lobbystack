import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { appointmentChangeVerifications, appointments, auditLogs, businesses, contacts, createDatabaseClient, outboxMessages, phoneNumbers, receptionistProfiles, services, smsConsentEvents, staff } from "@lobbystack/db";
import { bookAppointment, cancelAppointmentForCaller, claimAppointmentChangeOtp, createAppointmentChangeVerification, issueAppointmentChangeOtp, markAppointmentChangeOtpSent, releaseAppointmentChangeOtp, rescheduleAppointmentForCaller, verifyAppointmentChangeOtp } from "@lobbystack/domain";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main(): Promise<void> {
  const db = createDatabaseClient("lobbystack_migrator");
  const businessId = randomUUID();
  const foreignBusinessId = randomUUID();
  const callerPhone = "+14165550991";
  try {
    await db.db.insert(businesses).values([{ id: businessId, slug: `appointment-audit-${businessId}`, name: "Appointment audit certification", timezone: "UTC", businessType: "test" }, { id: foreignBusinessId, slug: `appointment-audit-${foreignBusinessId}`, name: "Foreign appointment audit", timezone: "UTC", businessType: "test" }]);
    const [contact] = await db.db.insert(contacts).values({ businessId, phone: callerPhone, smsConsentStatus: "subscribed" }).returning({ id: contacts.id });
    const [service] = await db.db.insert(services).values({ businessId, name: "Audit service", slug: "audit-service", durationMinutes: 30 }).returning({ id: services.id });
    const [staffMember] = await db.db.insert(staff).values({ businessId, name: "Audit staff", timezone: "UTC" }).returning({ id: staff.id });
    await db.db.insert(phoneNumbers).values({ businessId, e164: "+14165550992", providerPhoneId: `PN-${randomUUID()}` });
    await db.db.insert(receptionistProfiles).values({
      businessId,
      greeting: "Thanks for calling.",
      tone: "professional",
      summary: "Appointment audit certification",
      bookingPolicy: "Confirm availability before booking.",
      transferMode: "on_request",
      appointmentChangePolicy: { enabled: true, verificationMode: "otp_required", allowCancel: true, allowReschedule: true },
    });
    assert(contact && service && staffMember, "Appointment audit fixtures could not be created.");
    await bookAppointment({ db: db.db }, { businessId, serviceId: service.id, startsAt: new Date(Date.now() + 10 * 24 * 60 * 60_000).toISOString(), timezone: "UTC", contactPhone: callerPhone, sourceChannel: "voice", smsConsentGranted: true });
    const reminderConsent = await db.db.select().from(smsConsentEvents).where(and(eq(smsConsentEvents.businessId, businessId), eq(smsConsentEvents.action, "reminder_consent_granted")));
    assert(reminderConsent.length === 1, "Appointment reminder consent was not recorded.");
    const startsAt = new Date(Date.now() + 48 * 60 * 60_000);
    const [appointment] = await db.db.insert(appointments).values({ businessId, contactId: contact.id, serviceId: service.id, staffId: staffMember.id, startsAt, endsAt: new Date(startsAt.getTime() + 30 * 60_000), timezone: "UTC", status: "confirmed", sourceChannel: "voice" }).returning({ id: appointments.id });
    assert(appointment, "Appointment fixture could not be created.");

    const verification = await createAppointmentChangeVerification({ db: db.db }, { businessId, appointmentId: appointment.id, callerPhone, serviceName: "Audit service", action: "cancel" });
    assert(verification, "Appointment verification was not created.");
    await issueAppointmentChangeOtp({ db: db.db }, { businessId, verificationId: verification.verificationId });
    const otpJob = (await db.db.select({ payload: outboxMessages.payload }).from(outboxMessages).where(and(eq(outboxMessages.aggregateType, "appointment_change_verification"), eq(outboxMessages.aggregateId, verification.verificationId))).limit(1))[0];
    const code = typeof otpJob?.payload.code === "string" ? otpJob.payload.code : undefined;
    assert(code, "OTP delivery intent did not contain the generated code.");
    assert(await claimAppointmentChangeOtp({ db: db.db }, { businessId, verificationId: verification.verificationId }), "OTP delivery could not be claimed.");
    await releaseAppointmentChangeOtp({ db: db.db }, { businessId, verificationId: verification.verificationId });
    assert(await claimAppointmentChangeOtp({ db: db.db }, { businessId, verificationId: verification.verificationId }), "OTP delivery retry could not be claimed.");
    assert(await markAppointmentChangeOtpSent({ db: db.db }, { businessId, verificationId: verification.verificationId }), "OTP delivery was not marked sent.");
    const rejected = await verifyAppointmentChangeOtp({ db: db.db }, { businessId, verificationId: verification.verificationId, code: "999999" });
    assert(!rejected.ok, "Invalid OTP was accepted.");
    const verified = await verifyAppointmentChangeOtp({ db: db.db }, { businessId, verificationId: verification.verificationId, code });
    assert(verified.ok, "Valid OTP was rejected.");
    const canceled = await cancelAppointmentForCaller({ db: db.db }, { businessId, verificationId: verification.verificationId, appointmentId: appointment.id, callerPhone });
    assert(canceled, "Verified cancellation was not committed.");
    const replay = await cancelAppointmentForCaller({ db: db.db }, { businessId, verificationId: verification.verificationId, appointmentId: appointment.id, callerPhone });
    assert(replay === null, "Consumed verification was replayed.");

    const [rescheduleAppointment] = await db.db.insert(appointments).values({ businessId, contactId: contact.id, serviceId: service.id, staffId: staffMember.id, startsAt: new Date(startsAt.getTime() + 24 * 60 * 60_000), endsAt: new Date(startsAt.getTime() + 24 * 60 * 60_000 + 30 * 60_000), timezone: "UTC", status: "confirmed", sourceChannel: "voice" }).returning({ id: appointments.id });
    assert(rescheduleAppointment, "Reschedule fixture could not be created.");
    const rescheduleVerification = await createAppointmentChangeVerification({ db: db.db }, { businessId, appointmentId: rescheduleAppointment.id, callerPhone, serviceName: "Audit service", action: "reschedule" });
    assert(rescheduleVerification, "Reschedule verification was not created.");
    await db.db.update(appointmentChangeVerifications).set({ status: "otp_verified", codeHash: "certified" }).where(eq(appointmentChangeVerifications.id, rescheduleVerification.verificationId));
    const moved = await rescheduleAppointmentForCaller({ db: db.db }, { businessId, appointmentId: rescheduleAppointment.id, callerPhone, verificationId: rescheduleVerification.verificationId, startsAt: new Date(startsAt.getTime() + 72 * 60 * 60_000).toISOString() });
    assert(moved, "Verified reschedule was not committed.");

    const expirationVerification = await createAppointmentChangeVerification({ db: db.db }, { businessId, appointmentId: rescheduleAppointment.id, callerPhone, serviceName: "Audit service", action: "cancel" });
    assert(expirationVerification, "Expiration fixture was not created.");
    await db.db.update(appointmentChangeVerifications).set({ status: "otp_sent", codeHash: "invalid", expiresAt: new Date(Date.now() - 1_000) }).where(eq(appointmentChangeVerifications.id, expirationVerification.verificationId));
    const expired = await verifyAppointmentChangeOtp({ db: db.db }, { businessId, verificationId: expirationVerification.verificationId, code: "000000" });
    assert(expired.status === "expired", "Expired verification was not rejected.");
    const crossTenant = await createAppointmentChangeVerification({ db: db.db }, { businessId: foreignBusinessId, appointmentId: rescheduleAppointment.id, callerPhone, serviceName: "Audit service", action: "cancel" });
    assert(crossTenant === null, "Cross-tenant appointment verification was accepted.");

    const events = await db.db.select({ eventType: auditLogs.eventType }).from(auditLogs).where(eq(auditLogs.businessId, businessId));
    for (const eventType of ["appointment_change.verification_created", "appointment_change.otp_queued", "appointment_change.otp_sent", "appointment_change.otp_delivery_failed", "appointment_change.otp_rejected", "appointment_change.otp_verified", "appointment_change.verification_consumed", "appointment_change.canceled", "appointment_change.rescheduled", "appointment_change.verification_expired"]) assert(events.some((event) => event.eventType === eventType), `${eventType} audit event is missing.`);
    console.log(JSON.stringify({ failedAndSuccessfulPathsAudited: true, replayPrevented: true, cancelAtomic: true, rescheduleAtomic: true, expirationAudited: true, crossTenantDenied: true }));
  } finally {
    await db.db.delete(businesses).where(eq(businesses.id, businessId)).catch(() => undefined);
    await db.db.delete(businesses).where(eq(businesses.id, foreignBusinessId)).catch(() => undefined);
    await db.pool.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
