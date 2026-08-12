import { createHash } from "node:crypto";

import { and, desc, eq, lt, or, sql } from "drizzle-orm";

import { businesses, enqueueOutbox, onboardingPhoneVerifications, withBusinessTransaction } from "@lobbystack/db";

import { requireBusinessAdmin } from "../authz";
import type { DomainContext } from "./context";

const supportedCountries = new Set(["US", "CA", "GB", "AU"]);

export type PhoneLookupProvider = { lookupPhoneNumber(input: { phoneNumber: string; includeLineType?: boolean }): Promise<{ phoneE164: string; countryCode: string; valid: boolean; lineType?: string }> };
export type PhoneVerificationCheckProvider = { checkPhone(input: { serviceSid: string; verificationSid: string; code: string }): Promise<{ status: string; approved: boolean }> };

export async function requestPhoneVerification(context: DomainContext, input: { userId: string; businessId: string; phoneNumber: string }, provider: PhoneLookupProvider): Promise<string> {
  await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => { await requireBusinessAdmin(tx, input); });
  const lookup = await provider.lookupPhoneNumber({ phoneNumber: input.phoneNumber, includeLineType: true });
  const countryCode = lookup.countryCode.trim().toUpperCase();
  const lineType = lookup.lineType?.trim().toLowerCase();
  if (!lookup.valid || !/^\+[1-9]\d{7,14}$/.test(lookup.phoneE164)) throw new Error("A valid mobile phone number is required.");
  if (!supportedCountries.has(countryCode)) throw new Error("Phone verification is not supported in this country.");
  if (lineType && lineType !== "mobile") throw new Error("A mobile phone number is required.");
  const fingerprint = createHash("sha256").update(`${input.userId}:${lookup.phoneE164}`).digest("hex");
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    const result = await tx.execute(sql`SELECT app.reserve_phone_verification_attempt(${input.businessId}::uuid, ${input.userId}::uuid, ${lookup.phoneE164}, ${countryCode}, ${lineType ?? null}, ${fingerprint}) AS id`);
    const attemptId = String((result.rows[0] as { id?: unknown } | undefined)?.id ?? "");
    if (!attemptId) throw new Error("Phone verification could not be reserved.");
    await tx.update(businesses).set({ onboardingStage: "verify_phone_code", updatedAt: new Date() }).where(and(eq(businesses.id, input.businessId), eq(businesses.onboardingStage, "verify_phone")));
    await enqueueOutbox(tx, { topic: "phoneVerification.send", businessId: input.businessId, aggregateType: "phone_verification", aggregateId: attemptId, dedupeKey: `phone-verification:${attemptId}:send`, payload: { attemptId } });
    return attemptId;
  });
}

export async function getLatestPhoneVerificationAttempt(context: DomainContext, input: { userId: string; businessId: string }) {
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    return (await tx.select({ id: onboardingPhoneVerifications.id, phoneE164: onboardingPhoneVerifications.phoneE164, countryCode: onboardingPhoneVerifications.countryCode, status: onboardingPhoneVerifications.status, expiresAt: onboardingPhoneVerifications.expiresAt, attemptCount: onboardingPhoneVerifications.attemptCount }).from(onboardingPhoneVerifications).where(and(eq(onboardingPhoneVerifications.businessId, input.businessId), eq(onboardingPhoneVerifications.userId, input.userId))).orderBy(desc(onboardingPhoneVerifications.startedAt)).limit(1))[0] ?? null;
  });
}

export async function claimPhoneVerificationSend(context: DomainContext, input: { businessId: string; attemptId: string }) {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const staleBefore = new Date(Date.now() - 10 * 60_000);
    return (await tx.update(onboardingPhoneVerifications).set({ status: "processing", updatedAt: new Date() }).where(and(eq(onboardingPhoneVerifications.id, input.attemptId), eq(onboardingPhoneVerifications.businessId, input.businessId), or(eq(onboardingPhoneVerifications.status, "queued"), and(eq(onboardingPhoneVerifications.status, "processing"), lt(onboardingPhoneVerifications.updatedAt, staleBefore))))).returning({ id: onboardingPhoneVerifications.id, phoneE164: onboardingPhoneVerifications.phoneE164 }))[0] ?? null;
  });
}

export async function markPhoneVerificationSent(context: DomainContext, input: { businessId: string; attemptId: string; providerVerificationId: string; status: string }): Promise<void> {
  await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => { await tx.update(onboardingPhoneVerifications).set({ providerVerificationId: input.providerVerificationId, status: input.status === "pending" ? "pending" : "failed", updatedAt: new Date() }).where(and(eq(onboardingPhoneVerifications.id, input.attemptId), eq(onboardingPhoneVerifications.businessId, input.businessId), eq(onboardingPhoneVerifications.status, "processing"))); });
}

export async function markPhoneVerificationSendFailed(context: DomainContext, input: { businessId: string; attemptId: string }): Promise<void> {
  await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => { await tx.update(onboardingPhoneVerifications).set({ status: "failed", lastError: "Verification delivery failed.", updatedAt: new Date() }).where(and(eq(onboardingPhoneVerifications.id, input.attemptId), eq(onboardingPhoneVerifications.businessId, input.businessId))); });
}

export async function checkPhoneVerification(context: DomainContext, input: { userId: string; businessId: string; attemptId: string; code: string; serviceSid: string }, provider: PhoneVerificationCheckProvider): Promise<{ approved: boolean; status: string }> {
  if (!/^\d{4,10}$/.test(input.code)) throw new Error("A valid verification code is required.");
  const target = await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    const result = await tx.execute(sql`SELECT provider_verification_id AS "providerVerificationId", phone_e164 AS "phoneE164" FROM app.claim_phone_verification_check(${input.businessId}::uuid, ${input.userId}::uuid, ${input.attemptId}::uuid)`);
    return result.rows[0] as { providerVerificationId: string; phoneE164: string } | undefined;
  });
  if (!target?.providerVerificationId) throw new Error("This verification attempt is not available.");
  const result = await provider.checkPhone({ serviceSid: input.serviceSid, verificationSid: target.providerVerificationId, code: input.code });
  await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    if (result.approved) await tx.execute(sql`SELECT app.complete_phone_verification(${input.businessId}::uuid, ${input.userId}::uuid, ${input.attemptId}::uuid, ${result.status})`);
    else await tx.execute(sql`SELECT app.record_phone_verification_check_failure(${input.businessId}::uuid, ${input.userId}::uuid, ${input.attemptId}::uuid, ${result.status})`);
  });
  return result;
}

export async function reuseVerifiedPhoneForOnboarding(context: DomainContext, input: { userId: string; businessId: string }): Promise<string> {
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    const result = await tx.execute(sql`SELECT app.reuse_verified_phone_for_business(${input.businessId}::uuid, ${input.userId}::uuid) AS id`);
    const id = String((result.rows[0] as { id?: unknown } | undefined)?.id ?? "");
    if (!id) throw new Error("No verified phone is available to reuse.");
    return id;
  });
}
