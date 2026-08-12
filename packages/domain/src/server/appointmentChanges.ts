import { createHash, randomInt, timingSafeEqual } from "node:crypto";

import { and, eq, gt, inArray, lt, or } from "drizzle-orm";

import { appointmentChangeVerifications, appointments, contacts, enqueueOutbox, phoneNumbers, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";

import type { DomainContext } from "./context";

const OTP_TTL_MS = 10 * 60_000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_SEND_LEASE_MS = 5 * 60_000;

function otpSecret(): string {
  return process.env.OTP_HASH_SECRET ?? process.env.ENCRYPTION_KEY ?? process.env.BETTER_AUTH_SECRET ?? "development-only-change-me";
}

function hashOtp(code: string): string {
  return createHash("sha256").update(`${otpSecret()}:${code}`).digest("hex");
}

function matchesOtp(expectedHash: string, code: string): boolean {
  const actual = Buffer.from(hashOtp(code), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function newOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export async function createAppointmentChangeVerification(
  context: DomainContext,
  input: { businessId: string; appointmentId: string; callerPhone: string; action: "cancel" | "reschedule" },
): Promise<{ verificationId: string; appointmentId: string; contactId: string; status: string; expiresAt: string } | null> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const appointment = (await tx.select({ id: appointments.id, contactId: appointments.contactId }).from(appointments).innerJoin(contacts, and(eq(contacts.id, appointments.contactId), eq(contacts.businessId, input.businessId))).where(and(eq(appointments.id, input.appointmentId), eq(appointments.businessId, input.businessId), eq(contacts.phone, input.callerPhone), eq(appointments.status, "confirmed"))).limit(1))[0];
    if (!appointment) return null;
    const now = new Date();
    await tx.update(appointmentChangeVerifications).set({ status: "superseded", updatedAt: now }).where(and(eq(appointmentChangeVerifications.businessId, input.businessId), eq(appointmentChangeVerifications.appointmentId, input.appointmentId), eq(appointmentChangeVerifications.callerPhone, input.callerPhone), inArray(appointmentChangeVerifications.status, ["pending", "otp_pending", "otp_queued", "otp_sent"])));
    const expiresAt = new Date(now.getTime() + OTP_TTL_MS);
    const [verification] = await tx.insert(appointmentChangeVerifications).values({ businessId: input.businessId, appointmentId: appointment.id, contactId: appointment.contactId, callerPhone: input.callerPhone, action: input.action, status: "otp_pending", expiresAt, attemptCount: 0 }).returning({ id: appointmentChangeVerifications.id });
    if (!verification) throw new Error("Appointment change verification could not be created.");
    return { verificationId: verification.id, appointmentId: appointment.id, contactId: appointment.contactId, status: "otp_pending", expiresAt: expiresAt.toISOString() };
  });
}

export async function issueAppointmentChangeOtp(
  context: DomainContext,
  input: { businessId: string; verificationId: string },
): Promise<{ ok: true; status: string; verificationId: string; otpPhone: string } | { ok: false; status: string; reason: string }> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const current = (await tx.select({ id: appointmentChangeVerifications.id, callerPhone: appointmentChangeVerifications.callerPhone, status: appointmentChangeVerifications.status, expiresAt: appointmentChangeVerifications.expiresAt, attemptCount: appointmentChangeVerifications.attemptCount }).from(appointmentChangeVerifications).where(and(eq(appointmentChangeVerifications.id, input.verificationId), eq(appointmentChangeVerifications.businessId, input.businessId))).limit(1))[0];
    const now = new Date();
    if (!current) return { ok: false, status: "missing", reason: "The verification session was not found." };
    if (current.expiresAt <= now || ["expired", "superseded", "used", "failed"].includes(current.status)) {
      await tx.update(appointmentChangeVerifications).set({ status: "expired", updatedAt: now }).where(eq(appointmentChangeVerifications.id, current.id));
      return { ok: false, status: "expired", reason: "The verification session has expired." };
    }
    if (current.attemptCount >= OTP_MAX_ATTEMPTS) return { ok: false, status: "failed", reason: "Too many verification attempts." };
    const sender = (await tx.select({ e164: phoneNumbers.e164 }).from(phoneNumbers).where(and(eq(phoneNumbers.businessId, input.businessId), eq(phoneNumbers.status, "active"), eq(phoneNumbers.smsEnabled, true))).limit(1))[0];
    if (!sender) return { ok: false, status: "unavailable", reason: "SMS delivery is not configured for this business." };
    const code = newOtp();
    await tx.update(appointmentChangeVerifications).set({ codeHash: hashOtp(code), status: "otp_queued", expiresAt: new Date(now.getTime() + OTP_TTL_MS), updatedAt: now }).where(and(eq(appointmentChangeVerifications.id, current.id), inArray(appointmentChangeVerifications.status, ["otp_pending", "otp_sent"])));
    await enqueueOutbox(tx, { topic: "appointment.sendChangeOtp", businessId: input.businessId, aggregateType: "appointment_change_verification", aggregateId: current.id, dedupeKey: `appointment-change-otp:${current.id}:${now.getTime()}`, payload: { verificationId: current.id, code, to: current.callerPhone, from: sender.e164 } });
    return { ok: true, status: "otp_queued", verificationId: current.id, otpPhone: current.callerPhone };
  });
}

export async function claimAppointmentChangeOtp(
  context: DomainContext,
  input: { businessId: string; verificationId: string },
): Promise<boolean> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const staleBefore = new Date(Date.now() - OTP_SEND_LEASE_MS);
    const rows = await tx.update(appointmentChangeVerifications).set({ status: "otp_sending", updatedAt: new Date() }).where(and(eq(appointmentChangeVerifications.id, input.verificationId), eq(appointmentChangeVerifications.businessId, input.businessId), or(eq(appointmentChangeVerifications.status, "otp_queued"), and(eq(appointmentChangeVerifications.status, "otp_sending"), lt(appointmentChangeVerifications.updatedAt, staleBefore))))).returning({ id: appointmentChangeVerifications.id });
    return rows.length > 0;
  });
}

export async function loadAppointmentChangeOtpTarget(
  context: DomainContext,
  input: { businessId: string; verificationId: string; to: string; from: string; code: string },
): Promise<{ to: string; from: string; code: string } | null> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const row = (await tx.select({ id: appointmentChangeVerifications.id, expiresAt: appointmentChangeVerifications.expiresAt, status: appointmentChangeVerifications.status }).from(appointmentChangeVerifications).where(and(eq(appointmentChangeVerifications.id, input.verificationId), eq(appointmentChangeVerifications.businessId, input.businessId), eq(appointmentChangeVerifications.callerPhone, input.to), eq(appointmentChangeVerifications.status, "otp_sending"))).limit(1))[0];
    if (!row || row.expiresAt <= new Date()) return null;
    return { to: input.to, from: input.from, code: input.code };
  });
}

export async function markAppointmentChangeOtpSent(
  context: DomainContext,
  input: { businessId: string; verificationId: string },
): Promise<boolean> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const rows = await tx.update(appointmentChangeVerifications).set({ status: "otp_sent", updatedAt: new Date() }).where(and(eq(appointmentChangeVerifications.id, input.verificationId), eq(appointmentChangeVerifications.businessId, input.businessId), eq(appointmentChangeVerifications.status, "otp_sending"))).returning({ id: appointmentChangeVerifications.id });
    return rows.length > 0;
  });
}

export async function releaseAppointmentChangeOtp(
  context: DomainContext,
  input: { businessId: string; verificationId: string },
): Promise<void> {
  await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    await tx.update(appointmentChangeVerifications).set({ status: "otp_queued", updatedAt: new Date() }).where(and(eq(appointmentChangeVerifications.id, input.verificationId), eq(appointmentChangeVerifications.businessId, input.businessId), eq(appointmentChangeVerifications.status, "otp_sending")));
  });
}

export async function verifyAppointmentChangeOtp(
  context: DomainContext,
  input: { businessId: string; verificationId: string; code: string },
): Promise<{ ok: boolean; status: string; verificationId: string; reason?: string }> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const current = (await tx.select({ id: appointmentChangeVerifications.id, status: appointmentChangeVerifications.status, codeHash: appointmentChangeVerifications.codeHash, expiresAt: appointmentChangeVerifications.expiresAt, attemptCount: appointmentChangeVerifications.attemptCount }).from(appointmentChangeVerifications).where(and(eq(appointmentChangeVerifications.id, input.verificationId), eq(appointmentChangeVerifications.businessId, input.businessId))).limit(1))[0];
    if (!current) return { ok: false, status: "missing", verificationId: input.verificationId, reason: "The verification session was not found." };
    const now = new Date();
    if (current.expiresAt <= now || ["expired", "superseded", "used"].includes(current.status)) {
      await tx.update(appointmentChangeVerifications).set({ status: "expired", updatedAt: now }).where(eq(appointmentChangeVerifications.id, current.id));
      return { ok: false, status: "expired", verificationId: current.id, reason: "The verification session has expired." };
    }
    if (current.attemptCount >= OTP_MAX_ATTEMPTS) return { ok: false, status: "failed", verificationId: current.id, reason: "Too many verification attempts." };
    if (current.status === "otp_pending" || current.status === "otp_queued" || current.status === "otp_sending" || current.status === "failed" || !current.codeHash) return { ok: false, status: current.status, verificationId: current.id, reason: "A verification code has not been sent yet." };
    if (!matchesOtp(current.codeHash, input.code.trim())) {
      const attemptCount = current.attemptCount + 1;
      await tx.update(appointmentChangeVerifications).set({ attemptCount, status: attemptCount >= OTP_MAX_ATTEMPTS ? "failed" : "otp_sent", updatedAt: now }).where(eq(appointmentChangeVerifications.id, current.id));
      return { ok: false, status: attemptCount >= OTP_MAX_ATTEMPTS ? "failed" : "otp_sent", verificationId: current.id, reason: "The verification code is invalid." };
    }
    await tx.update(appointmentChangeVerifications).set({ status: "otp_verified", attemptCount: current.attemptCount + 1, updatedAt: now }).where(eq(appointmentChangeVerifications.id, current.id));
    return { ok: true, status: "otp_verified", verificationId: current.id };
  });
}

export async function consumeAppointmentChangeVerification(
  context: DomainContext,
  input: { businessId: string; verificationId: string; appointmentId: string; callerPhone: string; action: "cancel" | "reschedule" },
): Promise<boolean> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => await consumeAppointmentChangeVerificationInTransaction(tx, input));
}

export async function consumeAppointmentChangeVerificationInTransaction(
  tx: DatabaseTransaction,
  input: { businessId: string; verificationId: string; appointmentId: string; callerPhone: string; action: "cancel" | "reschedule" },
): Promise<boolean> {
  const rows = await tx.update(appointmentChangeVerifications).set({ status: "used", updatedAt: new Date() }).where(and(eq(appointmentChangeVerifications.id, input.verificationId), eq(appointmentChangeVerifications.businessId, input.businessId), eq(appointmentChangeVerifications.appointmentId, input.appointmentId), eq(appointmentChangeVerifications.callerPhone, input.callerPhone), eq(appointmentChangeVerifications.action, input.action), eq(appointmentChangeVerifications.status, "otp_verified"), gt(appointmentChangeVerifications.expiresAt, new Date()))).returning({ id: appointmentChangeVerifications.id });
  return rows.length > 0;
}
