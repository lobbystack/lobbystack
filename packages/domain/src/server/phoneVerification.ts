import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { and, eq, inArray, isNotNull, lt, or, sql } from "drizzle-orm";

import { canTextNumber, type InterfaceLocale } from "@lobbystack/shared";
import { enqueueOutbox, onboardingPhoneVerifications, withBusinessTransaction } from "@lobbystack/db";

import { requireBusinessMembership } from "../authz";
import type { DomainContext } from "./context";
import { enableOperatorSmsAlertsWithConsent } from "./notifications";
import { resolveSmsSender } from "./smsSender";
import { VERIFICATION_CODE_TTL_MS, newVerificationCode, verificationCodeSecret } from "./verificationCode";

// Personal phone verification is no longer part of onboarding. This drains any
// verification send that was already queued before retirement so the worker
// never reintroduces the removed onboarding stages or contacts a personal phone.
// Approved historical records are left untouched; they still back SMS consent
// and legacy email-verification grandfathering.
export async function cancelRetiredPhoneVerificationSend(
  context: DomainContext,
  input: { businessId: string; attemptId: string },
): Promise<boolean> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const changed = await tx.update(onboardingPhoneVerifications)
      .set({ status: "canceled", lastError: "Personal phone verification was retired from onboarding.", updatedAt: new Date() })
      .where(and(
        eq(onboardingPhoneVerifications.id, input.attemptId),
        eq(onboardingPhoneVerifications.businessId, input.businessId),
        inArray(onboardingPhoneVerifications.status, ["queued", "processing", "pending"]),
      ))
      .returning({ id: onboardingPhoneVerifications.id });
    return changed.length > 0;
  });
}

// Operators verify the phone that receives SMS alerts from notification
// settings. Attempts reuse onboarding_phone_verifications and its database
// rate limits (app.reserve_phone_verification_attempt: 5 per user and 3 per
// phone each hour, 30 seconds between codes to one phone). The worker
// generates each code and texts it from the alert SMS sender; only a keyed
// hash is stored. app.complete_phone_verification then sets users.phone and
// users.phone_verified_at.

export const PHONE_VERIFICATION_CODE_TTL_MS = VERIFICATION_CODE_TTL_MS;
export const PHONE_VERIFICATION_MAX_CHECKS = 5;
const PHONE_VERIFICATION_SEND_LEASE_MS = 5 * 60_000;
const E164_PATTERN = /^\+[1-9]\d{7,14}$/;
const CODE_PATTERN = /^\d{6}$/;

type PhoneVerificationError = Error & { status: number; code: string };

function phoneVerificationError(status: number, code: string, message: string): PhoneVerificationError {
  return Object.assign(new Error(message), { status, code });
}

/** Binds the code to its attempt, so a hash copied to another attempt never matches. */
export function hashPhoneVerificationCode(attemptId: string, code: string, secret = verificationCodeSecret()): string {
  return createHmac("sha256", secret).update(`${attemptId}:${code}`).digest("hex");
}

export function phoneVerificationCodeMatches(expectedHash: string, attemptId: string, code: string, secret = verificationCodeSecret()): boolean {
  const actual = Buffer.from(hashPhoneVerificationCode(attemptId, code, secret), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export type PhoneVerificationAttemptState = { id: string; status: string; expiresAt: Date; attemptCount: number; codeHash: string | null };
export type PhoneVerificationCheckOutcome =
  | { status: "approved" }
  | { status: "invalid"; remainingAttempts: number }
  | { status: "locked"; usedCheck?: true }
  | { status: "expired" }
  | { status: "unavailable" };

/** Decides a code check without touching storage. A wrong code that uses the last allowed check locks the attempt and reports `usedCheck`. */
export function evaluatePhoneVerificationCode(attempt: PhoneVerificationAttemptState, code: string, now: Date, secret = verificationCodeSecret()): PhoneVerificationCheckOutcome {
  if (attempt.status === "failed" && attempt.attemptCount >= PHONE_VERIFICATION_MAX_CHECKS) return { status: "locked" };
  if (attempt.status === "expired") return { status: "expired" };
  if (attempt.status !== "pending" || !attempt.codeHash) return { status: "unavailable" };
  if (attempt.expiresAt.getTime() <= now.getTime()) return { status: "expired" };
  if (attempt.attemptCount >= PHONE_VERIFICATION_MAX_CHECKS) return { status: "locked" };
  if (phoneVerificationCodeMatches(attempt.codeHash, attempt.id, code, secret)) return { status: "approved" };
  const remainingAttempts = PHONE_VERIFICATION_MAX_CHECKS - (attempt.attemptCount + 1);
  return remainingAttempts <= 0 ? { status: "locked", usedCheck: true } : { status: "invalid", remainingAttempts };
}

const reservationErrors: Record<string, () => PhoneVerificationError> = {
  verification_cooldown: () => phoneVerificationError(429, "verification_cooldown", "Wait 30 seconds before you request another code."),
  verification_user_rate_limited: () => phoneVerificationError(429, "verification_rate_limited", "Too many codes requested. Try again later."),
  verification_phone_rate_limited: () => phoneVerificationError(429, "verification_rate_limited", "Too many codes requested. Try again later."),
};

// Drizzle wraps the PostgreSQL error, and its message lists the query
// parameters, phone number included. Return only the raised reason.
function reservationError(error: unknown): PhoneVerificationError | undefined {
  for (let current: unknown = error, depth = 0; current && typeof current === "object" && depth < 4; current = (current as { cause?: unknown }).cause, depth += 1) {
    const message = (current as { message?: unknown }).message;
    if (typeof message === "string" && message in reservationErrors) return reservationErrors[message]!();
  }
  return undefined;
}

/**
 * Starts verifying the signed-in operator's phone for SMS alerts and queues the
 * code. Starting again, to resend or change the number, cancels the previous
 * open attempt.
 */
export async function startOperatorPhoneVerification(
  context: DomainContext,
  input: { userId: string; businessId: string; phoneE164: string; countryCode: string; locale?: InterfaceLocale },
): Promise<{ attemptId: string }> {
  const countryCode = input.countryCode.trim().toUpperCase();
  if (!E164_PATTERN.test(input.phoneE164) || !/^[A-Z]{2}$/.test(countryCode)) throw phoneVerificationError(422, "phone_number_invalid", "Enter a valid mobile number.");
  const fingerprint = createHash("sha256").update(`${input.userId}:${input.phoneE164}`).digest("hex");
  try {
    return await withBusinessTransaction(context.db, { userId: input.userId, businessId: input.businessId, actorType: "operator" }, async (tx) => {
      await requireBusinessMembership(tx, input);
      const sender = await resolveSmsSender(tx, input.businessId);
      if (!sender) throw phoneVerificationError(409, "sms_sender_missing", "An alert SMS sender is required for SMS notifications.");
      if (!canTextNumber(sender, input.phoneE164)) throw phoneVerificationError(422, "phone_unreachable", "The alert SMS sender can't text this number.");
      await tx.update(onboardingPhoneVerifications)
        .set({ status: "canceled", codeHash: null, lastError: "Replaced by a newer verification.", updatedAt: new Date() })
        .where(and(
          eq(onboardingPhoneVerifications.businessId, input.businessId),
          eq(onboardingPhoneVerifications.userId, input.userId),
          inArray(onboardingPhoneVerifications.status, ["queued", "processing", "pending"]),
        ));
      const result = await tx.execute(sql`SELECT app.reserve_phone_verification_attempt(${input.businessId}::uuid, ${input.userId}::uuid, ${input.phoneE164}, ${countryCode}, ${null}, ${fingerprint}) AS id`);
      const attemptId = String((result.rows[0] as { id?: unknown } | undefined)?.id ?? "");
      if (!attemptId) throw new Error("Phone verification could not be reserved.");
      await enqueueOutbox(tx, { topic: "phoneVerification.sendCode", businessId: input.businessId, aggregateType: "phone_verification", aggregateId: attemptId, dedupeKey: `phone-verification:${attemptId}:send-code`, payload: { attemptId, locale: input.locale ?? "en" } });
      return { attemptId };
    });
  } catch (error) {
    throw reservationError(error) ?? error;
  }
}

export type OperatorPhoneVerificationStatus = "sending" | "sent" | "approved" | "expired" | "failed" | "canceled";

/** The state of one of the operator's own attempts, for the code screen. Never includes the code or its hash. */
export async function getOperatorPhoneVerification(
  context: DomainContext,
  input: { userId: string; businessId: string; attemptId: string; now?: Date },
): Promise<{ id: string; status: OperatorPhoneVerificationStatus; expiresAt: Date } | null> {
  const now = input.now ?? new Date();
  return await withBusinessTransaction(context.db, { userId: input.userId, businessId: input.businessId, actorType: "operator" }, async (tx) => {
    await requireBusinessMembership(tx, input);
    const row = (await tx.select({ id: onboardingPhoneVerifications.id, status: onboardingPhoneVerifications.status, expiresAt: onboardingPhoneVerifications.expiresAt })
      .from(onboardingPhoneVerifications)
      .where(and(eq(onboardingPhoneVerifications.id, input.attemptId), eq(onboardingPhoneVerifications.businessId, input.businessId), eq(onboardingPhoneVerifications.userId, input.userId)))
      .limit(1))[0];
    if (!row) return null;
    return { id: row.id, status: operatorVerificationStatus(row.status, row.expiresAt, now), expiresAt: row.expiresAt };
  });
}

function operatorVerificationStatus(status: string, expiresAt: Date, now: Date): OperatorPhoneVerificationStatus {
  if (status === "queued" || status === "processing") return "sending";
  if (status === "pending") return expiresAt.getTime() <= now.getTime() ? "expired" : "sent";
  if (status === "approved" || status === "expired" || status === "canceled") return status;
  return "failed";
}

/** Checks a code for the signed-in operator. A correct code verifies the phone on their account and turns SMS alerts on with the consent given at the phone step. */
export async function checkOperatorPhoneVerificationCode(
  context: DomainContext,
  input: { userId: string; businessId: string; attemptId: string; code: string; now?: Date },
): Promise<{ approved: boolean } & PhoneVerificationCheckOutcome> {
  const code = input.code.trim();
  if (!CODE_PATTERN.test(code)) throw phoneVerificationError(400, "verification_code_invalid", "Enter the 6-digit code.");
  const now = input.now ?? new Date();
  return await withBusinessTransaction(context.db, { userId: input.userId, businessId: input.businessId, actorType: "operator" }, async (tx) => {
    await requireBusinessMembership(tx, input);
    const scope = and(eq(onboardingPhoneVerifications.id, input.attemptId), eq(onboardingPhoneVerifications.businessId, input.businessId), eq(onboardingPhoneVerifications.userId, input.userId));
    const attempt = (await tx.select({ id: onboardingPhoneVerifications.id, phoneE164: onboardingPhoneVerifications.phoneE164, status: onboardingPhoneVerifications.status, expiresAt: onboardingPhoneVerifications.expiresAt, attemptCount: onboardingPhoneVerifications.attemptCount, codeHash: onboardingPhoneVerifications.codeHash })
      .from(onboardingPhoneVerifications).where(scope).limit(1).for("update"))[0];
    if (!attempt) return { approved: false, status: "unavailable" };
    const outcome = evaluatePhoneVerificationCode(attempt, code, now);
    if (outcome.status === "approved") {
      await tx.update(onboardingPhoneVerifications).set({ attemptCount: attempt.attemptCount + 1, codeHash: null, updatedAt: now }).where(scope);
      const completed = await tx.execute(sql`SELECT app.complete_phone_verification(${input.businessId}::uuid, ${input.userId}::uuid, ${input.attemptId}::uuid, ${"approved"}) AS approved`);
      const approved = (completed.rows[0] as { approved?: unknown } | undefined)?.approved === true;
      if (!approved) return { approved: false, status: "unavailable" };
      await enableOperatorSmsAlertsWithConsent(tx, { businessId: input.businessId, userId: input.userId, phone: attempt.phoneE164, now });
      return { approved: true, status: "approved" };
    }
    if (outcome.status === "invalid") {
      await tx.update(onboardingPhoneVerifications).set({ attemptCount: attempt.attemptCount + 1, lastError: "Verification code was not approved.", updatedAt: now }).where(scope);
    } else if (outcome.status === "locked" && attempt.status === "pending") {
      await tx.update(onboardingPhoneVerifications).set({ attemptCount: outcome.usedCheck ? attempt.attemptCount + 1 : attempt.attemptCount, status: "failed", codeHash: null, lastError: "Too many incorrect codes.", updatedAt: now }).where(scope);
    } else if (outcome.status === "expired" && attempt.status === "pending") {
      await tx.update(onboardingPhoneVerifications).set({ status: "expired", codeHash: null, updatedAt: now }).where(scope);
    }
    return outcome.status === "locked" ? { approved: false, status: "locked" } : { approved: false, ...outcome };
  });
}

/**
 * Worker: claims a queued attempt, generates its code, and stores only the
 * hash. Returns the code to text, or null when the attempt is gone, was
 * replaced, or no alert sender can reach the number (the attempt then fails).
 */
export async function issueOperatorPhoneVerificationCode(
  context: DomainContext,
  input: { businessId: string; attemptId: string; now?: Date },
): Promise<{ to: string; from: string; code: string } | null> {
  const now = input.now ?? new Date();
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const scope = and(eq(onboardingPhoneVerifications.id, input.attemptId), eq(onboardingPhoneVerifications.businessId, input.businessId));
    const claimed = (await tx.update(onboardingPhoneVerifications)
      .set({ status: "processing", updatedAt: now })
      .where(and(scope, or(eq(onboardingPhoneVerifications.status, "queued"), and(eq(onboardingPhoneVerifications.status, "processing"), lt(onboardingPhoneVerifications.updatedAt, new Date(now.getTime() - PHONE_VERIFICATION_SEND_LEASE_MS))))))
      .returning({ phoneE164: onboardingPhoneVerifications.phoneE164 }))[0];
    if (!claimed) return null;
    const sender = await resolveSmsSender(tx, input.businessId);
    if (!sender || !canTextNumber(sender, claimed.phoneE164)) {
      await tx.update(onboardingPhoneVerifications).set({ status: "failed", codeHash: null, lastError: "No alert SMS sender can reach this number.", updatedAt: now }).where(scope);
      return null;
    }
    const code = newVerificationCode();
    await tx.update(onboardingPhoneVerifications).set({ codeHash: hashPhoneVerificationCode(input.attemptId, code), attemptCount: 0, expiresAt: new Date(now.getTime() + PHONE_VERIFICATION_CODE_TTL_MS), updatedAt: now }).where(scope);
    return { to: claimed.phoneE164, from: sender, code };
  });
}

/** Worker: the code was handed to the SMS provider, so the operator can enter it. Only an attempt holding a code can be marked. */
export async function markOperatorPhoneVerificationCodeSent(context: DomainContext, input: { businessId: string; attemptId: string }): Promise<boolean> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => (await tx.update(onboardingPhoneVerifications)
    .set({ status: "pending", lastError: null, updatedAt: new Date() })
    .where(and(eq(onboardingPhoneVerifications.id, input.attemptId), eq(onboardingPhoneVerifications.businessId, input.businessId), eq(onboardingPhoneVerifications.status, "processing"), isNotNull(onboardingPhoneVerifications.codeHash)))
    .returning({ id: onboardingPhoneVerifications.id })).length > 0);
}

/**
 * Worker: the send failed. A retry generates a new code, so the hash is
 * cleared either way. `retry` puts the attempt back in the queue; otherwise it
 * fails and the code screen offers a resend.
 */
export async function releaseOperatorPhoneVerificationCodeSend(context: DomainContext, input: { businessId: string; attemptId: string; retry: boolean; error: string }): Promise<void> {
  await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    await tx.update(onboardingPhoneVerifications)
      .set({ status: input.retry ? "queued" : "failed", codeHash: null, lastError: input.error, updatedAt: new Date() })
      .where(and(eq(onboardingPhoneVerifications.id, input.attemptId), eq(onboardingPhoneVerifications.businessId, input.businessId), eq(onboardingPhoneVerifications.status, "processing")));
  });
}
