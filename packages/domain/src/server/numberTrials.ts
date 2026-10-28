import { DateTime } from "luxon";
import { and, desc, eq, gt, gte, inArray, isNull, lte, ne, sql } from "drizzle-orm";

import { businesses, calls, enqueueOutbox, numberTrials, numberWaitlist, onboardingPhoneVerifications, phoneNumbers, receptionistProfiles, users, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";
import { isTransferPhone, normalizeInterfaceLocale, type InterfaceLocale } from "@lobbystack/shared";

import { hasMinimumRole, requireBusinessAdmin, requireBusinessMembership } from "../authz";
import type { DomainContext } from "./context";
import { loadEntitlement } from "./entitlement";
import { businessGetsHostEmails } from "./hostEmails";
import { loadPartnerNumberStanding } from "./partnerNumbers";
import { sharedSmsSender } from "./smsSender";
import { getVoiceSecondsLeftInTransaction, readEndedVoiceSecondsLeftInTransaction } from "./usage";

export type NumberCountry = "US" | "CA" | "PR" | "GB" | "AU" | "NZ";

export const NUMBER_TRIAL_DAYS = 14;

/**
 * Countries we sell numbers in. The US, Canada and Puerto Rico need no
 * registration; the others need the regulatory bundle Twilio approved for
 * LobbyStack (and, where the number needs one, its address). See docs/voice/runtime.md.
 */
export function numberCountries(env: NodeJS.ProcessEnv = process.env): NumberCountry[] {
  const set = (name: string) => Boolean(env[name]?.trim());
  return [
    "US",
    "CA",
    "PR",
    ...(set("TWILIO_GB_BUNDLE_SID") ? ["GB" as const] : []),
    ...(set("TWILIO_AU_BUNDLE_SID") && set("TWILIO_AU_ADDRESS_SID") ? ["AU" as const] : []),
    ...(set("TWILIO_NZ_BUNDLE_SID") && set("TWILIO_NZ_ADDRESS_SID") ? ["NZ" as const] : []),
  ];
}

/** Countries with a free trial number. An Australian number costs $8.25 a month, so Australia is paid only. */
export function trialCountries(env: NodeJS.ProcessEnv = process.env): NumberCountry[] {
  return numberCountries(env).filter((country) => country !== "AU");
}

export function isNumberCountry(value: string | null | undefined, env: NodeJS.ProcessEnv = process.env): value is NumberCountry {
  return Boolean(value) && (numberCountries(env) as string[]).includes(value!.toUpperCase());
}

/** The end of the trial's 14th day in the business's time zone. Day 1 is the day the number was bought. */
export function numberTrialEndsAt(startedAt: Date, timezone: string): Date {
  return DateTime.fromJSDate(startedAt).setZone(timezone).startOf("day").plus({ days: NUMBER_TRIAL_DAYS }).toJSDate();
}

/** Twilio bills a number a month at a time from its purchase, so we keep a trial number until the day before the next bill. */
export function numberTrialReleaseAt(startedAt: Date): Date {
  return DateTime.fromJSDate(startedAt).toUTC().plus({ months: 1 }).minus({ days: 1 }).toJSDate();
}

type TrialEmail = "day10" | "day13" | "ended" | "minutes_out";

/** When each reminder goes out: 9 a.m. in the business's time zone on day 10, day 13 and the day after the trial. */
export function numberTrialEmailDueAt(email: Exclude<TrialEmail, "minutes_out">, endsAt: Date, timezone: string): Date {
  const end = DateTime.fromJSDate(endsAt).setZone(timezone);
  const day = email === "day10" ? end.minus({ days: 5 }) : email === "day13" ? end.minus({ days: 2 }) : end;
  return day.startOf("day").plus({ hours: 9 }).toJSDate();
}

/**
 * Starts the trial clock when the worker has bought the trial number. The
 * number is scheduled for release when its paid month runs out, and calls
 * transfer only to the verified mobile of whoever claimed the trial while it
 * lasts: the owner, an admin, or a partner member who opened the business.
 */
export async function activateNumberTrialInTransaction(
  tx: DatabaseTransaction,
  input: { businessId: string; claimId: string; phoneNumberId: string; now?: Date },
): Promise<boolean> {
  const now = input.now ?? new Date();
  const business = (await tx.select({ timezone: businesses.timezone }).from(businesses).where(eq(businesses.id, input.businessId)).limit(1))[0];
  if (!business) return false;
  const [trial] = await tx.update(numberTrials)
    .set({ status: "active", phoneNumberId: input.phoneNumberId, startedAt: now, endsAt: numberTrialEndsAt(now, business.timezone), updatedAt: now })
    .where(and(eq(numberTrials.businessId, input.businessId), eq(numberTrials.claimId, input.claimId), eq(numberTrials.status, "reserved")))
    .returning({ verifiedPhone: numberTrials.verifiedPhone });
  if (!trial) return false;
  await tx.update(phoneNumbers)
    .set({ reclaimScheduledAt: numberTrialReleaseAt(now), reclaimReason: "trial", updatedAt: now })
    .where(and(eq(phoneNumbers.id, input.phoneNumberId), eq(phoneNumbers.businessId, input.businessId)));
  await tx.update(receptionistProfiles).set({ transferNumber: trial.verifiedPhone, updatedAt: now }).where(eq(receptionistProfiles.businessId, input.businessId));
  await enqueueOutbox(tx, { topic: "snapshot.refresh", businessId: input.businessId, aggregateType: "business", aggregateId: input.businessId, dedupeKey: `business:${input.businessId}:snapshot:trial:${input.claimId}`, payload: { businessId: input.businessId, reason: "number_trial_started" } });
  return true;
}

/** During a trial, calls transfer only to the mobile its claimer verified. That phone, or null when there's no trial. */
export async function trialTransferNumberInTransaction(tx: DatabaseTransaction, input: { businessId: string }): Promise<string | null> {
  const trial = (await tx.select({ verifiedPhone: numberTrials.verifiedPhone }).from(numberTrials).where(and(eq(numberTrials.businessId, input.businessId), inArray(numberTrials.status, ["reserved", "active", "ended"]))).limit(1))[0];
  return trial?.verifiedPhone ?? null;
}

/** trialTransferNumberInTransaction in a transaction of its own. */
export async function trialTransferNumber(context: DomainContext, input: { businessId: string }): Promise<string | null> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => await trialTransferNumberInTransaction(tx, input));
}

const E164 = /^\+[1-9]\d{6,14}$/;

/**
 * The rules for every number the receptionist transfers calls to, the
 * business's and each employee's: an E.164 number in a country Twilio lets us
 * call and, during a free number trial, only the mobile its claimer verified.
 */
export async function assertTransferNumberAllowed(tx: DatabaseTransaction, input: { businessId: string; phone: string }): Promise<void> {
  if (!E164.test(input.phone)) throw Object.assign(new Error("Enter a valid phone number."), { status: 400, code: "transfer_number_invalid" });
  if (!isTransferPhone(input.phone)) throw Object.assign(new Error("Your receptionist can't transfer calls to this country yet."), { status: 400, code: "transfer_country_unsupported" });
  const trialPhone = await trialTransferNumberInTransaction(tx, input);
  if (trialPhone && input.phone !== trialPhone) throw Object.assign(new Error("During the free trial, calls can only transfer to the mobile of the person who claimed the trial."), { status: 409, code: "trial_transfer_locked" });
}

/** A failed purchase doesn't use up the trial. */
export async function failNumberTrialInTransaction(tx: DatabaseTransaction, input: { businessId: string; claimId: string }): Promise<void> {
  await tx.update(numberTrials).set({ status: "failed", updatedAt: new Date() }).where(and(eq(numberTrials.businessId, input.businessId), eq(numberTrials.claimId, input.claimId), eq(numberTrials.status, "reserved")));
}

/**
 * The business paid: its trial number becomes its number. This clears the
 * release, and puts the number back on the receptionist if the trial had
 * ended or run out of minutes.
 */
export async function convertNumberTrialInTransaction(tx: DatabaseTransaction, input: { businessId: string; now?: Date }): Promise<boolean> {
  const now = input.now ?? new Date();
  const [trial] = await tx.update(numberTrials)
    .set({ status: "converted", updatedAt: now })
    .where(and(eq(numberTrials.businessId, input.businessId), inArray(numberTrials.status, ["active", "ended"])))
    .returning({ phoneNumberId: numberTrials.phoneNumberId });
  if (!trial?.phoneNumberId) return false;
  const restored = await tx.update(phoneNumbers)
    .set({ reclaimScheduledAt: null, reclaimReason: null, updatedAt: now })
    .where(and(eq(phoneNumbers.id, trial.phoneNumberId), eq(phoneNumbers.businessId, input.businessId), eq(phoneNumbers.status, "active"), eq(phoneNumbers.reclaimReason, "trial")))
    .returning({ id: phoneNumbers.id });
  if (restored.length) await enqueueNumberRouting(tx, { businessId: input.businessId, phoneNumberId: trial.phoneNumberId, mode: "receptionist" });
  return true;
}

/**
 * Whether someone pays for the trial's number now, so it stays the
 * business's: a direct business's live plan, or for a partner's business,
 * its partner's paid tier. A partner's business pays its partner, which
 * doesn't keep the partner's trial number.
 */
export async function trialNumberPaidForInTransaction(tx: DatabaseTransaction, businessId: string): Promise<boolean> {
  const business = (await tx.select({ partnerId: businesses.partnerId }).from(businesses).where(eq(businesses.id, businessId)).limit(1))[0];
  if (business?.partnerId) return (await loadPartnerNumberStanding(tx, business.partnerId)).paidTier;
  return (await loadEntitlement(tx, businessId)).live;
}

/**
 * The partner paid for a tier: its trial number, if one of its businesses
 * still holds it, becomes one of the partner's numbers, as a direct
 * business's trial number does when it pays. The worker runs this after it
 * reconciles the partner's tier. A business the partner released keeps its
 * trial as the host's. Returns whether a trial converted.
 */
export async function keepPartnerTrialNumber(context: DomainContext, input: { partnerId: string; now?: Date }): Promise<boolean> {
  const businessId = await withBusinessTransaction(context.db, { actorType: "worker" }, async (tx) => (await tx.execute<{ business_id: string | null }>(sql`select app.partner_number_trial_business(${input.partnerId}::uuid) as business_id`)).rows[0]?.business_id ?? null);
  if (!businessId) return false;
  return await withBusinessTransaction(context.db, { businessId, actorType: "worker" }, async (tx) => {
    const business = (await tx.select({ partnerId: businesses.partnerId }).from(businesses).where(eq(businesses.id, businessId)).limit(1))[0];
    if (business?.partnerId !== input.partnerId || !await trialNumberPaidForInTransaction(tx, businessId)) return false;
    return await convertNumberTrialInTransaction(tx, { businessId, ...(input.now ? { now: input.now } : {}) });
  });
}

/** A paid plan is live: a trial number becomes the business's number, and a release scheduled when an earlier plan ended is called off. */
export async function keepBusinessNumbersInTransaction(tx: DatabaseTransaction, input: { businessId: string; now?: Date }): Promise<void> {
  const now = input.now ?? new Date();
  await convertNumberTrialInTransaction(tx, { businessId: input.businessId, now });
  await tx.update(phoneNumbers)
    .set({ reclaimScheduledAt: null, reclaimReason: null, updatedAt: now })
    .where(and(eq(phoneNumbers.businessId, input.businessId), eq(phoneNumbers.status, "active"), eq(phoneNumbers.reclaimReason, "subscription_ended")));
}

export const NUMBER_RELEASE_GRACE_DAYS = 30;

/** The paid plan ended: the business keeps its numbers for 30 more days, then we release them. */
export async function scheduleNumberReleaseInTransaction(tx: DatabaseTransaction, input: { businessId: string; now?: Date }): Promise<void> {
  const now = input.now ?? new Date();
  // Every hosted business texts from the shared sender, so it's never released.
  const shared = sharedSmsSender();
  await tx.update(phoneNumbers)
    .set({ reclaimScheduledAt: new Date(now.getTime() + NUMBER_RELEASE_GRACE_DAYS * 86_400_000), reclaimReason: "subscription_ended", updatedAt: now })
    .where(and(eq(phoneNumbers.businessId, input.businessId), eq(phoneNumbers.status, "active"), isNull(phoneNumbers.reclaimScheduledAt), ...(shared ? [ne(phoneNumbers.e164, shared)] : [])));
}

/** The owner canceled at the end of the period: tell them when the plan ends and when we release the number. A partner's business never gets the host's notice. */
export async function queuePlanCancelNoticeInTransaction(tx: DatabaseTransaction, input: { businessId: string; periodEnd: Date }): Promise<void> {
  if (!await businessGetsHostEmails(tx, input.businessId)) return;
  const number = (await tx.select({ id: phoneNumbers.id }).from(phoneNumbers).where(and(eq(phoneNumbers.businessId, input.businessId), eq(phoneNumbers.status, "active"), isNull(phoneNumbers.reclaimScheduledAt))).limit(1))[0];
  if (!number) return;
  const releaseAt = new Date(input.periodEnd.getTime() + NUMBER_RELEASE_GRACE_DAYS * 86_400_000);
  await enqueueOutbox(tx, {
    topic: "phoneNumber.releaseEmail",
    businessId: input.businessId,
    aggregateType: "phone_number",
    aggregateId: number.id,
    dedupeKey: `phone-number:${number.id}:release-email:canceled:${input.periodEnd.toISOString().slice(0, 10)}`,
    payload: { phoneNumberId: number.id, kind: "canceled", periodEnd: input.periodEnd.toISOString(), releaseAt: releaseAt.toISOString() },
  });
}

/** Three days before we release a number whose plan ended, remind the owner. A partner's business never gets the host's reminder. */
export async function sweepNumberReleases(context: DomainContext, input: { businessId: string; now?: Date }): Promise<number> {
  const now = input.now ?? new Date();
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    if (!await businessGetsHostEmails(tx, input.businessId)) return 0;
    const due = await tx.select({ id: phoneNumbers.id, reclaimScheduledAt: phoneNumbers.reclaimScheduledAt }).from(phoneNumbers)
      .where(and(eq(phoneNumbers.businessId, input.businessId), eq(phoneNumbers.status, "active"), eq(phoneNumbers.reclaimReason, "subscription_ended"), lte(phoneNumbers.reclaimScheduledAt, new Date(now.getTime() + 3 * 86_400_000)), gt(phoneNumbers.reclaimScheduledAt, now)));
    for (const number of due) {
      // The release date in the key sends one reminder per scheduled release, however often this runs.
      await enqueueOutbox(tx, { topic: "phoneNumber.releaseEmail", businessId: input.businessId, aggregateType: "phone_number", aggregateId: number.id, dedupeKey: `phone-number:${number.id}:release-email:soon:${number.reclaimScheduledAt!.toISOString().slice(0, 10)}`, payload: { phoneNumberId: number.id, kind: "release_soon", releaseAt: number.reclaimScheduledAt!.toISOString() } });
    }
    return due.length;
  });
}

/** The facts a release email needs. Null when the number was released or kept, the owner is gone, or it's a partner's business. */
export async function loadNumberReleaseEmail(context: DomainContext, input: { businessId: string; phoneNumberId: string }): Promise<{ to: string; locale: InterfaceLocale; firstName: string; businessName: string; number: string; timezone: string } | null> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    if (!await businessGetsHostEmails(tx, input.businessId)) return null;
    const number = (await tx.select({ e164: phoneNumbers.e164, timezone: businesses.timezone }).from(phoneNumbers).innerJoin(businesses, eq(businesses.id, phoneNumbers.businessId))
      .where(and(eq(phoneNumbers.id, input.phoneNumberId), eq(phoneNumbers.businessId, input.businessId), eq(phoneNumbers.status, "active"))).limit(1))[0];
    if (!number) return null;
    const owner = (await tx.execute<{ email: string; name: string | null; preferred_locale: string; business_name: string }>(sql`select email, name, preferred_locale, business_name from app.resolve_business_owner_contact(${input.businessId}::uuid)`)).rows[0];
    if (!owner) return null;
    return { to: owner.email, locale: normalizeInterfaceLocale(owner.preferred_locale) ?? "en", firstName: owner.name?.trim().split(/\s+/)[0] ?? "", businessName: owner.business_name, number: number.e164, timezone: number.timezone };
  });
}

export type NumberRoutingMode = "receptionist" | "fallback";

/**
 * Where a number's calls should go now, read from the trial. Routing jobs
 * apply this instead of their own payload, so two jobs that run out of order
 * still leave the number where it belongs. Null when the number is gone.
 */
export async function desiredNumberRouting(context: DomainContext, input: { businessId: string; phoneNumberId: string }): Promise<{ mode: NumberRoutingMode; providerPhoneId: string } | null> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const row = (await tx.select({ providerPhoneId: phoneNumbers.providerPhoneId, trialStatus: numberTrials.status, minutesExhaustedAt: numberTrials.minutesExhaustedAt })
      .from(phoneNumbers)
      .leftJoin(numberTrials, and(eq(numberTrials.phoneNumberId, phoneNumbers.id), inArray(numberTrials.status, ["active", "ended"])))
      .where(and(eq(phoneNumbers.id, input.phoneNumberId), eq(phoneNumbers.businessId, input.businessId), eq(phoneNumbers.status, "active")))
      .limit(1))[0];
    if (!row?.providerPhoneId) return null;
    const off = row.trialStatus === "ended" || (row.trialStatus === "active" && Boolean(row.minutesExhaustedAt));
    return { mode: off ? "fallback" : "receptionist", providerPhoneId: row.providerPhoneId };
  });
}

/**
 * Moves a number on or off the SIP trunk. Off the trunk, Twilio asks
 * /api/webhooks/twilio/voice what to do, which forwards the call to the owner
 * or rejects it.
 */
export async function enqueueNumberRouting(tx: DatabaseTransaction, input: { businessId: string; phoneNumberId: string; mode: NumberRoutingMode }): Promise<void> {
  await enqueueOutbox(tx, {
    topic: "phoneNumber.route",
    businessId: input.businessId,
    aggregateType: "phone_number",
    aggregateId: input.phoneNumberId,
    dedupeKey: `phone-number:${input.phoneNumberId}:route:${input.mode}:${Date.now()}`,
    payload: { phoneNumberId: input.phoneNumberId, mode: input.mode },
  });
}

/**
 * The trial ran out of minutes. Calls ring the owner's phone from now on, and
 * the owner gets one email about it. Returns false when that already happened.
 * A partner's trial draws on the pool its partner's other businesses share, so
 * a refused call ends it only when the calls that ended used the minutes up.
 * Calls still open elsewhere refuse its calls only until they end.
 */
export async function markNumberTrialMinutesExhausted(context: DomainContext, input: { businessId: string; now?: Date }): Promise<boolean> {
  const now = input.now ?? new Date();
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const running = (await tx.select({ id: numberTrials.id }).from(numberTrials).where(and(eq(numberTrials.businessId, input.businessId), eq(numberTrials.status, "active"), isNull(numberTrials.minutesExhaustedAt))).limit(1))[0];
    if (!running) return false;
    const ended = await readEndedVoiceSecondsLeftInTransaction(tx, { businessId: input.businessId });
    if (ended.pooled && ended.seconds >= 60) return false;
    const [trial] = await tx.update(numberTrials)
      .set({ minutesExhaustedAt: now, updatedAt: now })
      .where(and(eq(numberTrials.businessId, input.businessId), eq(numberTrials.status, "active"), isNull(numberTrials.minutesExhaustedAt)))
      .returning({ id: numberTrials.id, phoneNumberId: numberTrials.phoneNumberId });
    if (!trial?.phoneNumberId) return false;
    await enqueueNumberRouting(tx, { businessId: input.businessId, phoneNumberId: trial.phoneNumberId, mode: "fallback" });
    await queueTrialEmail(tx, { businessId: input.businessId, trialId: trial.id, email: "minutes_out", now });
    return true;
  });
}

/**
 * After each call: a trial with less than a minute left starts forwarding now,
 * so the next caller reaches the owner instead of a busy signal. A partner's
 * trial counts the calls that ended, so seconds its partner's other
 * businesses hold for calls still open don't end it.
 */
export async function checkNumberTrialMinutes(context: DomainContext, input: { businessId: string }): Promise<boolean> {
  const seconds = await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const trial = (await tx.select({ id: numberTrials.id }).from(numberTrials).where(and(eq(numberTrials.businessId, input.businessId), eq(numberTrials.status, "active"), isNull(numberTrials.minutesExhaustedAt))).limit(1))[0];
    if (!trial) return null;
    const ended = await readEndedVoiceSecondsLeftInTransaction(tx, { businessId: input.businessId });
    return ended.pooled ? ended.seconds : (await getVoiceSecondsLeftInTransaction(tx, { businessId: input.businessId })).seconds;
  });
  return seconds !== null && seconds < 60 ? await markNumberTrialMinutesExhausted(context, input) : false;
}

/**
 * Where a call goes when the receptionist doesn't take it: a trial number out
 * of minutes, or any number whose plan is out of minutes or at its overage cap
 * (the trunk fails the call over to /api/webhooks/twilio/voice). It forwards
 * to the business's transfer number, or else the owner's verified phone, and
 * rejects only when neither exists. An ended trial lets the call go
 * unanswered, as if the number were gone. Forwarding uses no AI minutes, so it
 * doesn't depend on the plan.
 */
export async function resolveNumberFallback(context: DomainContext, input: { businessId: string; e164: string }): Promise<{ action: "forward"; to: string } | { action: "reject" }> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const row = (await tx.select({ trialStatus: numberTrials.status, trialPhone: numberTrials.verifiedPhone, transferNumber: receptionistProfiles.transferNumber })
      .from(phoneNumbers)
      .leftJoin(numberTrials, and(eq(numberTrials.phoneNumberId, phoneNumbers.id), inArray(numberTrials.status, ["active", "ended"])))
      .leftJoin(receptionistProfiles, eq(receptionistProfiles.businessId, phoneNumbers.businessId))
      .where(and(eq(phoneNumbers.businessId, input.businessId), eq(phoneNumbers.e164, input.e164), eq(phoneNumbers.status, "active")))
      .limit(1))[0];
    if (!row || row.trialStatus === "ended") return { action: "reject" };
    // A trial transfers only to the verified phone, so it never needs the owner lookup.
    const ownerPhone = row.trialStatus === "active" ? row.trialPhone : (await tx.execute<{ phone: string | null }>(sql`select app.resolve_business_owner_verified_phone(${input.businessId}::uuid) as phone`)).rows[0]?.phone;
    // Forwarding a call back to the number it came in on would loop.
    const to = [row.transferNumber?.trim(), ownerPhone].find((phone): phone is string => Boolean(phone && E164.test(phone) && isTransferPhone(phone) && phone !== input.e164));
    return to ? { action: "forward", to } : { action: "reject" };
  });
}

/** Whether calls to this business's number must go unanswered because its trial ended. */
export async function isNumberTrialEnded(context: DomainContext, input: { businessId: string }): Promise<boolean> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const row = (await tx.select({ id: numberTrials.id }).from(numberTrials).where(and(eq(numberTrials.businessId, input.businessId), eq(numberTrials.status, "ended"))).limit(1))[0];
    return Boolean(row);
  });
}

export type NumberTrialState =
  | { status: "none" }
  // No trial yet, and this workspace can start one.
  | { status: "available" }
  | { status: "active"; e164: string; endsAt: string; daysLeft: number; minutesExhausted: boolean; forwardTo: string | null }
  // Ended, and the number is still ours. The owner sees it as still available, without the release date.
  | { status: "ended"; e164: string }
  | { status: "over" };

export async function verifiedPhone(tx: DatabaseTransaction, input: { userId: string; businessId: string }): Promise<{ phone: string; countryCode: string } | null> {
  // The app role can't read phone_verified_at; the approved attempt below proves the phone, and the claim function checks it again.
  const user = (await tx.select({ phone: users.phone }).from(users).where(eq(users.id, input.userId)).limit(1))[0];
  if (!user?.phone) return null;
  const attempt = (await tx.select({ countryCode: onboardingPhoneVerifications.countryCode }).from(onboardingPhoneVerifications)
    .where(and(eq(onboardingPhoneVerifications.businessId, input.businessId), eq(onboardingPhoneVerifications.userId, input.userId), eq(onboardingPhoneVerifications.phoneE164, user.phone), eq(onboardingPhoneVerifications.status, "approved")))
    .orderBy(desc(onboardingPhoneVerifications.approvedAt)).limit(1))[0];
  return attempt ? { phone: user.phone, countryCode: attempt.countryCode.toUpperCase() } : null;
}

/** Whether the host's free trial and plans are for this business: a cloud business that doesn't pay yet, and never a partner's, which pays its partner. */
async function offersHostTrialInTransaction(tx: DatabaseTransaction, businessId: string): Promise<boolean> {
  const business = (await tx.select({ deploymentMode: businesses.deploymentMode }).from(businesses).where(eq(businesses.id, businessId)).limit(1))[0];
  if (business?.deploymentMode !== "cloud") return false;
  const entitlement = await loadEntitlement(tx, businessId);
  return !entitlement.live && !entitlement.poolPartnerId;
}

// The workspace checks the number search makes before it offers a trial. The claim itself also
// enforces once per user, phone and network; when it refuses, the number step offers the plans.
async function trialAvailableInTransaction(tx: DatabaseTransaction, input: { userId: string; businessId: string }): Promise<boolean> {
  if (!await offersHostTrialInTransaction(tx, input.businessId)) return false;
  const number = await tx.select({ id: phoneNumbers.id }).from(phoneNumbers).where(and(eq(phoneNumbers.businessId, input.businessId), inArray(phoneNumbers.status, ["active", "provisioning"]))).limit(1);
  // The same once-per-workspace, per-user and per-phone rule the claim enforces.
  const used = await tx.execute(sql`SELECT app.number_trial_used(${input.businessId}::uuid, ${input.userId}::uuid) AS used`);
  if (number.length || (used.rows[0] as { used?: boolean } | undefined)?.used) return false;
  // An owner who hasn't verified a mobile yet verifies it on the way to the number.
  const verified = await verifiedPhone(tx, input);
  return !verified || (trialCountries() as string[]).includes(verified.countryCode);
}

/**
 * Where the number step sends someone it can't help yet: Home, for a finished
 * workspace that already has a number, or the phone step, when a free trial
 * needs a mobile verified in this workspace first.
 */
export async function numberStepRedirect(context: DomainContext, input: { userId: string; businessId: string; finished: boolean }): Promise<"/" | "/onboarding/verify-phone" | null> {
  return await withBusinessTransaction(context.db, { userId: input.userId, businessId: input.businessId, actorType: "operator" }, async (tx) => {
    await requireBusinessMembership(tx, input);
    const number = await tx.select({ id: phoneNumbers.id }).from(phoneNumbers).where(and(eq(phoneNumbers.businessId, input.businessId), inArray(phoneNumbers.status, ["active", "provisioning"]))).limit(1);
    if (number.length) return input.finished ? "/" : null;
    if (!await offersHostTrialInTransaction(tx, input.businessId)) return null;
    return await verifiedPhone(tx, input) ? null : "/onboarding/verify-phone";
  });
}

export async function getNumberTrialState(context: DomainContext, input: { userId: string; businessId: string; now?: Date }): Promise<NumberTrialState> {
  const now = input.now ?? new Date();
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    const { role } = await requireBusinessMembership(tx, input);
    const row = (await tx.select({ status: numberTrials.status, endsAt: numberTrials.endsAt, minutesExhaustedAt: numberTrials.minutesExhaustedAt, verifiedPhone: numberTrials.verifiedPhone, e164: phoneNumbers.e164, numberStatus: phoneNumbers.status, transferNumber: receptionistProfiles.transferNumber })
      .from(numberTrials)
      .leftJoin(phoneNumbers, eq(phoneNumbers.id, numberTrials.phoneNumberId))
      .leftJoin(receptionistProfiles, eq(receptionistProfiles.businessId, numberTrials.businessId))
      .where(and(eq(numberTrials.businessId, input.businessId), inArray(numberTrials.status, ["active", "ended", "released"])))
      .limit(1))[0];
    // Only admins can search and claim numbers, so only they see the offer.
    if (!row) return hasMinimumRole(role, "business_admin") && await trialAvailableInTransaction(tx, input) ? { status: "available" } : { status: "none" };
    if (row.status === "active" && row.e164 && row.endsAt) {
      return { status: "active", e164: row.e164, endsAt: row.endsAt.toISOString(), daysLeft: Math.max(1, Math.ceil((row.endsAt.getTime() - now.getTime()) / 86_400_000)), minutesExhausted: Boolean(row.minutesExhaustedAt), forwardTo: row.minutesExhaustedAt ? row.transferNumber?.trim() || row.verifiedPhone : null };
    }
    if (row.status === "ended" && row.e164 && row.numberStatus === "active") return { status: "ended", e164: row.e164 };
    return { status: "over" };
  });
}

/**
 * The hourly check for one business: ends a trial at the end of its 14th day,
 * queues the day 10, day 13 and day 15 emails, and closes a trial whose number
 * was released.
 */
export async function sweepNumberTrial(context: DomainContext, input: { businessId: string; now?: Date }): Promise<{ ended: boolean; emails: TrialEmail[] }> {
  const now = input.now ?? new Date();
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const trial = (await tx.select({ id: numberTrials.id, status: numberTrials.status, endsAt: numberTrials.endsAt, emailsSent: numberTrials.emailsSent, phoneNumberId: numberTrials.phoneNumberId, numberStatus: phoneNumbers.status, timezone: businesses.timezone })
      .from(numberTrials)
      .innerJoin(businesses, eq(businesses.id, numberTrials.businessId))
      .leftJoin(phoneNumbers, eq(phoneNumbers.id, numberTrials.phoneNumberId))
      .where(and(eq(numberTrials.businessId, input.businessId), inArray(numberTrials.status, ["active", "ended"])))
      .limit(1))[0];
    if (!trial?.endsAt) return { ended: false, emails: [] };
    if (trial.numberStatus !== "active") {
      await tx.update(numberTrials).set({ status: "released", updatedAt: now }).where(eq(numberTrials.id, trial.id));
      return { ended: false, emails: [] };
    }
    let ended = false;
    if (trial.status === "active" && now >= trial.endsAt) {
      await tx.update(numberTrials).set({ status: "ended", updatedAt: now }).where(and(eq(numberTrials.id, trial.id), eq(numberTrials.status, "active")));
      if (trial.phoneNumberId) await enqueueNumberRouting(tx, { businessId: input.businessId, phoneNumberId: trial.phoneNumberId, mode: "fallback" });
      ended = true;
    }
    const emails: TrialEmail[] = [];
    const sent = trial.emailsSent ?? {};
    const due: Array<Exclude<TrialEmail, "minutes_out">> = trial.status === "active" && !ended ? ["day10", "day13"] : ["ended"];
    // Only the latest due reminder goes out: an owner who signs up late in the
    // window gets one email, not a backlog.
    const latest = due.filter((email) => !sent[email] && now >= numberTrialEmailDueAt(email, trial.endsAt!, trial.timezone)).at(-1);
    if (latest && await queueTrialEmail(tx, { businessId: input.businessId, trialId: trial.id, email: latest, now })) emails.push(latest);
    return { ended, emails };
  });
}

/**
 * Queues one trial email to the owner, once per trial. The worker renders the
 * copy in the owner's language. A partner's business never gets one. Returns
 * whether it queued the email.
 */
async function queueTrialEmail(tx: DatabaseTransaction, input: { businessId: string; trialId: string; email: TrialEmail; now: Date }): Promise<boolean> {
  if (!await businessGetsHostEmails(tx, input.businessId)) return false;
  const claimed = await tx.update(numberTrials)
    .set({ emailsSent: sql`${numberTrials.emailsSent} || jsonb_build_object(${input.email}::text, ${input.now.toISOString()}::text)`, updatedAt: input.now })
    .where(and(eq(numberTrials.id, input.trialId), sql`(${numberTrials.emailsSent} ->> ${input.email}) IS NULL`))
    .returning({ id: numberTrials.id });
  if (!claimed.length) return false;
  await enqueueOutbox(tx, {
    topic: "numberTrial.sendEmail",
    businessId: input.businessId,
    aggregateType: "number_trial",
    aggregateId: input.trialId,
    dedupeKey: `number-trial:${input.trialId}:email:${input.email}`,
    payload: { trialId: input.trialId, email: input.email },
  });
  return true;
}

export type NumberTrialEmailContent = {
  email: TrialEmail;
  to: string;
  locale: InterfaceLocale;
  firstName: string;
  businessName: string;
  trialNumber: string;
  forwardTo: string | null;
  endsAt: Date | null;
  timezone: string;
  /** Phone calls the receptionist answered since the trial started. */
  callsAnswered: number;
};

/** The facts a trial email needs, read by the worker when it sends one. Null when the trial or its owner is gone, or it's a partner's business. */
export async function loadNumberTrialEmail(context: DomainContext, input: { businessId: string; trialId: string; email: TrialEmail }): Promise<NumberTrialEmailContent | null> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    if (!await businessGetsHostEmails(tx, input.businessId)) return null;
    const trial = (await tx.select({ e164: phoneNumbers.e164, verifiedPhone: numberTrials.verifiedPhone, transferNumber: receptionistProfiles.transferNumber, status: numberTrials.status, startedAt: numberTrials.startedAt, endsAt: numberTrials.endsAt, timezone: businesses.timezone })
      .from(numberTrials)
      .innerJoin(phoneNumbers, eq(phoneNumbers.id, numberTrials.phoneNumberId))
      .innerJoin(businesses, eq(businesses.id, numberTrials.businessId))
      .leftJoin(receptionistProfiles, eq(receptionistProfiles.businessId, numberTrials.businessId))
      .where(and(eq(numberTrials.id, input.trialId), eq(numberTrials.businessId, input.businessId)))
      .limit(1))[0];
    // An owner who paid in the meantime doesn't need a reminder.
    if (!trial || trial.status === "converted") return null;
    const owner = (await tx.execute<{ email: string; name: string | null; preferred_locale: string; business_name: string }>(sql`select email, name, preferred_locale, business_name from app.resolve_business_owner_contact(${input.businessId}::uuid)`)).rows[0];
    if (!owner) return null;
    const answered = trial.startedAt
      ? (await tx.select({ count: sql<number>`count(*)::int` }).from(calls).where(and(eq(calls.businessId, input.businessId), ne(calls.transport, "web_voice"), inArray(calls.status, ["completed", "transferred"]), gte(calls.startedAt, trial.startedAt))))[0]?.count ?? 0
      : 0;
    return {
      email: input.email,
      to: owner.email,
      locale: normalizeInterfaceLocale(owner.preferred_locale) ?? "en",
      firstName: owner.name?.trim().split(/\s+/)[0] ?? "",
      businessName: owner.business_name,
      trialNumber: trial.e164,
      forwardTo: input.email === "minutes_out" ? trial.transferNumber?.trim() || trial.verifiedPhone : null,
      endsAt: trial.endsAt,
      timezone: trial.timezone,
      callsAnswered: answered,
    };
  });
}

/**
 * An owner in a country without numbers asks to hear when numbers arrive
 * there. That's the host contacting them, so a partner's business, which
 * gets its numbers from its partner, can't join.
 */
export async function joinNumberWaitlist(context: DomainContext, input: { userId: string; businessId: string; countryCode: string }): Promise<void> {
  const countryCode = input.countryCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(countryCode)) throw Object.assign(new Error("Pick a country."), { status: 400, code: "country_invalid" });
  await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    if (!await businessGetsHostEmails(tx, input.businessId)) throw Object.assign(new Error("This business gets its phone numbers from its partner."), { status: 409, code: "partner_business" });
    await tx.insert(numberWaitlist).values({ businessId: input.businessId, userId: input.userId, countryCode }).onConflictDoNothing({ target: [numberWaitlist.businessId, numberWaitlist.countryCode] });
  });
}
