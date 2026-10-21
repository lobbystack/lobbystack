import { isPaidSubscription } from "@lobbystack/shared";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { and, eq, inArray, isNull, lt, lte, ne, or, sql } from "drizzle-orm";

import { billingAccounts, businesses, enqueueOutbox, numberTrials, onboardingNumberClaimEvents, phoneNumbers, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";

import { requireBusinessAdmin } from "../authz";
import type { DomainContext } from "./context";
import { activateNumberTrialInTransaction, failNumberTrialInTransaction, isNumberCountry, keepBusinessNumbersInTransaction, trialCountries, verifiedPhone, type NumberCountry } from "./numberTrials";
import { normalizeOnboardingStage } from "./onboarding";
import { resolveBusinessNumberMarket, type BusinessNumberMarket } from "./phoneNumberMarket";

export type NumberSelection = {
  countryCode: NumberCountry;
  kind: "local" | "mobile" | "toll_free";
  areaCode?: string;
  city?: string;
  regionCode?: string;
  postalCode?: string;
  // Set on the offer the owner claims, and stored with the claim.
  sms?: boolean;
  trial?: boolean;
  verifiedPhone?: string;
};
export type NumberInventoryProvider = { listAvailablePhoneNumbers(input: NumberSelection & { limit: number }): Promise<Array<{ phoneE164: string; locality?: string; region?: string; countryCode: string; capabilities: { sms: boolean; voice: boolean } }>> };
export type NumberClaimPurpose = "onboarding" | "replacement";
/** A searched number, signed for one person and one business so a claim can trust it. */
export type NumberOffer = { v: 1; purpose: NumberClaimPurpose; businessId: string; userId: string; e164: string; countryCode: string; kind: NumberSelection["kind"]; capabilities: { sms: boolean; voice: true }; selection: NumberSelection; exp: number };
type Offer = NumberOffer;

const offerLifetimeMs = 5 * 60_000;

function encode(value: unknown): string { return Buffer.from(JSON.stringify(value)).toString("base64url"); }
function sign(encoded: string, secret: string): string { return createHmac("sha256", secret).update(encoded).digest("base64url"); }
function issueOffer(payload: Offer, secret: string): string { const encoded = encode(payload); return `${encoded}.${sign(encoded, secret)}`; }
function numberClaimError(status: number, code: string, message: string): Error & { status: number; code: string } {
  return Object.assign(new Error(message), { status, code });
}
/** Reads a signed offer. Throws number_offer_invalid or number_offer_expired. */
export function readNumberOffer(token: string, secret: string): NumberOffer {
  const invalid = () => numberClaimError(400, "number_offer_invalid", "Invalid number claim token.");
  const [encoded, signature, extra] = token.split("."); if (!encoded || !signature || extra) throw invalid();
  const expected = Buffer.from(sign(encoded, secret)); const actual = Buffer.from(signature); if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw invalid();
  const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Offer;
  // Hosted businesses text from LobbyStack's shared number, so a number only has to take calls.
  if (payload.v !== 1 || !["onboarding", "replacement"].includes(payload.purpose) || !/^\+[1-9]\d{7,14}$/.test(payload.e164) || !payload.capabilities.voice) throw invalid();
  if (payload.exp < Date.now()) throw numberClaimError(409, "number_offer_expired", "This number offer expired. Search again and pick a number.");
  return payload;
}

// The reasons app.reserve_onboarding_number_claim and
// app.reserve_replacement_number_claim raise for an expected refusal.
const claimRefusals: Record<string, [status: number, message: string]> = {
  number_claim_in_progress: [409, "We're still setting up a number for this workspace. Wait for it to finish."],
  invalid_onboarding_stage: [409, "Business number selection is not available at this onboarding stage."],
  business_number_exists: [409, "This workspace already has a phone number."],
  dedicated_number_requires_paid_plan: [409, "A paid plan is required for a dedicated business number."],
  replacement_already_used: [409, "This workspace has already used its number replacement."],
  replacement_already_reserved: [409, "We're still setting up your replacement number. Wait for it to finish."],
  active_number_required: [409, "An active phone number is required before choosing a replacement."],
  replacement_number_must_differ: [409, "Pick a number other than your current one."],
  number_claim_rate_limited: [429, "You've tried to claim too many numbers this hour. Try again later."],
  daily_claim_quota_reached: [429, "You've reached today's limit for new numbers. Try again tomorrow."],
  monthly_claim_quota_reached: [429, "You've reached the 30-day limit for new numbers. Try again later."],
  // app.reserve_trial_number_claim
  phone_verification_required: [409, "Verify your mobile number before you choose a trial number."],
  trial_already_used: [409, "This phone number or account has already had a free trial. Choose a plan to get a number."],
  trial_ip_limited: [429, "A free trial already started from this network in the last 30 days. Choose a plan to get a number."],
  trial_not_needed: [409, "Your plan already includes a number. Search again to pick one."],
  trial_not_available: [409, "A free trial number isn't available for this workspace. Choose a plan to get a number."],
};

function refused(reason: string): Error {
  const [status, text] = claimRefusals[reason]!;
  return numberClaimError(status, reason, text);
}

// Drizzle wraps the PostgreSQL error, and its message lists the query
// parameters. Return only the raised reason.
function claimRefusal(error: unknown): Error | undefined {
  for (let current: unknown = error, depth = 0; current && typeof current === "object" && depth < 4; current = (current as { cause?: unknown }).cause, depth += 1) {
    const message = (current as { message?: unknown }).message;
    if (typeof message === "string" && Object.hasOwn(claimRefusals, message)) return refused(message);
  }
  return undefined;
}

/** verifiedPhone for a worker transaction, which can't read users' phones. */
async function apiVerifiedPhone(tx: DatabaseTransaction, input: { userId: string; businessId: string }): Promise<{ phone: string; countryCode: string } | null> {
  const row = (await tx.execute<{ phone: string; country_code: string }>(sql`select phone, country_code from app.resolve_api_verified_phone(${input.businessId}::uuid, ${input.userId}::uuid)`)).rows[0];
  return row ? { phone: row.phone, countryCode: row.country_code.toUpperCase() } : null;
}

/** What a business may pick a number for now, and where to search. */
export type NumberEligibility = { market: BusinessNumberMarket; trial: { verifiedPhone: string } | undefined; countryFixed: boolean; smsRequired: boolean };

/**
 * Checks that the business may pick a number for this purpose now, as the
 * person picking: the onboarding stage, the one replacement, and the paid-plan
 * rule, under which a cloud business without a paid plan gets a free trial
 * number during onboarding when this person verified a phone in a trial
 * country. Throws the claim refusals the dashboard shows. The API runs in a
 * worker transaction and skips the onboarding stage order.
 */
export async function numberEligibilityInTransaction(tx: DatabaseTransaction, input: { userId: string; businessId: string; purpose: NumberClaimPurpose; selection?: Partial<NumberSelection> | undefined; via: "dashboard" | "api" }): Promise<NumberEligibility> {
  const { purpose } = input;
  const business = (await tx.select({ stage: businesses.onboardingStage, timezone: businesses.timezone, deploymentMode: businesses.deploymentMode, replacementUsedAt: businesses.phoneNumberReplacementUsedAt }).from(businesses).where(eq(businesses.id, input.businessId)).limit(1))[0];
  const billing = (await tx.select({ plan: billingAccounts.plan, state: billingAccounts.subscriptionState }).from(billingAccounts).where(eq(billingAccounts.businessId, input.businessId)).limit(1))[0];
  if (!business) throw numberClaimError(404, "not_found", "Workspace not found.");
  const onboardingStage = normalizeOnboardingStage(business.stage);
  if (input.via === "dashboard" && purpose === "onboarding" && !["phone_number", "attribution", "complete"].includes(onboardingStage)) throw refused("invalid_onboarding_stage");
  if (purpose === "replacement") {
    if (business.replacementUsedAt) throw refused("replacement_already_used");
    const active = await tx.select({ id: phoneNumbers.id }).from(phoneNumbers).where(and(eq(phoneNumbers.businessId, input.businessId), eq(phoneNumbers.status, "active"), isNull(phoneNumbers.reclaimScheduledAt))).limit(1);
    if (!active.length) throw refused("active_number_required");
  }
  const verified = input.via === "dashboard" ? await verifiedPhone(tx, input) : await apiVerifiedPhone(tx, input);
  // The verified phone's country decides the number's country.
  const requested = (verified?.countryCode ?? input.selection?.countryCode)?.trim().toUpperCase();
  if (requested && !isNumberCountry(requested)) throw numberClaimError(400, "unsupported_country", "Phone numbers aren't available in this country yet.");
  let trial: { verifiedPhone: string } | undefined;
  if (business.deploymentMode === "cloud" && (!billing || !isPaidSubscription(billing.plan, billing.state))) {
    // Without a paid plan, a number is a free trial: during onboarding, with a
    // verified phone in a trial country, once per business.
    if (purpose !== "onboarding") throw refused("dedicated_number_requires_paid_plan");
    if (!verified) throw refused("phone_verification_required");
    if (!(trialCountries() as string[]).includes(verified.countryCode)) throw refused("dedicated_number_requires_paid_plan");
    const used = await tx.select({ id: numberTrials.id }).from(numberTrials).where(and(eq(numberTrials.businessId, input.businessId), ne(numberTrials.status, "failed"))).limit(1);
    if (used.length) throw refused("trial_already_used");
    trial = { verifiedPhone: verified.phone };
  }
  // Hosted businesses text from the shared sender; a self-hosted one texts from this number.
  return { market: resolveBusinessNumberMarket({ selection: requested ? { ...input.selection, countryCode: requested } : input.selection, timezone: business.timezone }), trial, countryFixed: Boolean(verified), smsRequired: business.deploymentMode !== "cloud" };
}

/** Searches the provider where the business may pick a number and signs an offer for each, for this person and business only. */
export async function offerBusinessNumbers(input: { userId: string; businessId: string; purpose: NumberClaimPurpose; eligibility: NumberEligibility; selection?: Partial<NumberSelection> | undefined; limit?: number | undefined; claimTokenSecret: string }, provider: NumberInventoryProvider) {
  const { market, trial, smsRequired } = input.eligibility;
  const countryCode = market.countryCode;
  if (!isNumberCountry(countryCode)) throw numberClaimError(400, "unsupported_country", "Phone numbers aren't available in this country yet.");
  // LobbyStack's UK and Australian registrations cover mobile numbers; local
  // numbers there need a local address we don't have.
  const kind: NumberSelection["kind"] = countryCode === "GB" || countryCode === "AU" ? "mobile" : countryCode === "NZ" ? "local" : input.selection?.kind ?? "local";
  const selection: NumberSelection = { countryCode, kind, ...(input.selection?.areaCode ? { areaCode: input.selection.areaCode.replace(/\D/g, "") } : {}), ...(input.selection?.city ? { city: input.selection.city.trim() } : {}), ...(input.selection?.regionCode ? { regionCode: input.selection.regionCode.trim() } : {}), ...(input.selection?.postalCode ? { postalCode: input.selection.postalCode.trim() } : {}) };
  const limit = Math.max(1, Math.min(20, Math.trunc(input.limit ?? 10)));
  const exp = Date.now() + offerLifetimeMs;
  return (await provider.listAvailablePhoneNumbers({ ...selection, limit, ...(smsRequired ? { sms: true } : {}) })).filter(number => number.capabilities.voice && (!smsRequired || number.capabilities.sms)).slice(0, limit).map(number => {
    const offered: NumberSelection = { ...selection, sms: number.capabilities.sms, ...(trial ? { trial: true, verifiedPhone: trial.verifiedPhone } : {}) };
    return { ...number, kind, trial: Boolean(trial), claimToken: issueOffer({ v: 1, purpose: input.purpose, businessId: input.businessId, userId: input.userId, e164: number.phoneE164, countryCode: number.countryCode, kind, capabilities: { sms: number.capabilities.sms, voice: true }, selection: offered, exp }, input.claimTokenSecret), expiresAt: new Date(exp) };
  });
}

export async function searchBusinessNumberInventory(context: DomainContext, input: { userId: string; businessId: string; purpose?: NumberClaimPurpose; selection?: Partial<NumberSelection>; limit?: number; claimTokenSecret: string }, provider: NumberInventoryProvider) {
  const purpose = input.purpose ?? "onboarding";
  const eligibility = await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    return await numberEligibilityInTransaction(tx, { userId: input.userId, businessId: input.businessId, purpose, selection: input.selection, via: "dashboard" });
  });
  const numbers = (await offerBusinessNumbers({ userId: input.userId, businessId: input.businessId, purpose, eligibility, selection: input.selection, limit: input.limit, claimTokenSecret: input.claimTokenSecret }, provider))
    .map(({ kind: _kind, trial: _trial, expiresAt: _expiresAt, ...number }) => number);
  // countryFixed: the verified phone picked the country, so the chooser shouldn't offer others.
  return { market: eligibility.market, numbers, trial: Boolean(eligibility.trial), countryFixed: eligibility.countryFixed };
}

/** The signed-in user's verified phone and the country they picked for it, or null. */
export async function reserveOnboardingNumberClaim(context: DomainContext, input: { userId: string; businessId: string; claimToken: string; claimTokenSecret: string; idempotencyKey: string; ipHash?: string | null }): Promise<string> {
  const offer = readNumberOffer(input.claimToken, input.claimTokenSecret);
  if (offer.purpose !== "onboarding" || offer.businessId !== input.businessId || offer.userId !== input.userId) throw numberClaimError(400, "number_offer_invalid", "Number claim token does not belong to this onboarding flow.");
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    const tokenHash = createHash("sha256").update(input.claimToken).digest("hex");
    const selection = JSON.stringify(offer.selection);
    const result = offer.selection.trial
      ? await tx.execute(sql`SELECT app.reserve_trial_number_claim(${input.businessId}::uuid, ${input.userId}::uuid, ${offer.e164}, ${selection}::jsonb, ${tokenHash}, ${input.idempotencyKey}, ${input.ipHash ?? null}) AS id`)
      : await tx.execute(sql`SELECT app.reserve_onboarding_number_claim(${input.businessId}::uuid, ${input.userId}::uuid, ${offer.e164}, ${selection}::jsonb, ${tokenHash}, ${input.idempotencyKey}) AS id`);
    const claimId = String((result.rows[0] as { id?: unknown } | undefined)?.id ?? ""); if (!claimId) throw new Error("Number claim could not be reserved.");
    await enqueueOutbox(tx, { topic: "phoneNumber.provision", businessId: input.businessId, aggregateType: "number_claim", aggregateId: claimId, dedupeKey: `phone-claim:${claimId}:provision`, payload: { claimId } });
    return claimId;
  }).catch((error: unknown) => { throw claimRefusal(error) ?? error; });
}

export async function reserveReplacementNumberClaim(context: DomainContext, input: { userId: string; businessId: string; claimToken: string; claimTokenSecret: string; idempotencyKey: string }): Promise<string> {
  const offer = readNumberOffer(input.claimToken, input.claimTokenSecret);
  if (offer.purpose !== "replacement" || offer.businessId !== input.businessId || offer.userId !== input.userId) throw numberClaimError(400, "number_offer_invalid", "Number claim token does not belong to this replacement flow.");
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    const tokenHash = createHash("sha256").update(input.claimToken).digest("hex");
    const result = await tx.execute(sql`SELECT app.reserve_replacement_number_claim(${input.businessId}::uuid, ${input.userId}::uuid, ${offer.e164}, ${JSON.stringify(offer.selection)}::jsonb, ${tokenHash}, ${input.idempotencyKey}) AS id`);
    const claimId = String((result.rows[0] as { id?: unknown } | undefined)?.id ?? "");
    if (!claimId) throw new Error("Number replacement could not be reserved.");
    await enqueueOutbox(tx, { topic: "phoneNumber.provision", businessId: input.businessId, aggregateType: "number_claim", aggregateId: claimId, dedupeKey: `phone-claim:${claimId}:provision`, payload: { claimId } });
    return claimId;
  }).catch((error: unknown) => { throw claimRefusal(error) ?? error; });
}

/** The lock every number claim for the business takes, so claims and releases take turns. Keyed as the claim functions key it. */
export async function lockBusinessNumberClaims(tx: DatabaseTransaction, businessId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('phone-claim:' || ${businessId}::uuid::text, 0))`);
}

/**
 * Fails the business's claims that no worker will finish, by the ages the
 * claim functions apply before a new claim: a reservation not taken up within
 * 15 minutes, and provisioning with no progress for 30. The worker skips a
 * failed claim, so none is bought late. Then does what failNumberProvisioning
 * does after a failed purchase: a new number's business goes back to picking
 * one (its trial isn't used up), and a replacement frees its reservation.
 */
export async function expireAbandonedNumberClaimsInTransaction(tx: DatabaseTransaction, businessId: string): Promise<void> {
  const claims = onboardingNumberClaimEvents;
  const abandoned = or(and(eq(claims.status, "reserved"), lte(claims.reservedAt, sql`now() - interval '15 minutes'`)), and(eq(claims.status, "provisioning"), lte(claims.updatedAt, sql`now() - interval '30 minutes'`)));
  const expired: Array<{ id: string; purpose: string }> = [];
  for (const [purpose, message] of [["onboarding", "Number claim reservation expired."], ["replacement", "Number replacement reservation expired."]] as const) {
    expired.push(...await tx.update(claims)
      .set({ status: "failed", completedAt: sql`now()`, lastError: sql`CASE WHEN ${claims.status} = 'reserved' THEN ${message}::text ELSE 'Number provisioning stalled.' END`, updatedAt: sql`now()` })
      .where(and(eq(claims.businessId, businessId), eq(claims.purpose, purpose), abandoned))
      .returning({ id: claims.id, purpose: claims.purpose }));
  }
  const onboarding = expired.filter((claim) => claim.purpose === "onboarding").map((claim) => claim.id);
  if (onboarding.length) {
    await tx.update(businesses).set({ onboardingStage: "phone_number", updatedAt: new Date() }).where(and(eq(businesses.id, businessId), eq(businesses.onboardingStage, "phone_number_claiming")));
    await tx.update(numberTrials).set({ status: "failed", updatedAt: new Date() }).where(and(eq(numberTrials.businessId, businessId), eq(numberTrials.status, "reserved"), inArray(numberTrials.claimId, onboarding)));
  }
  for (const claim of expired.filter((claim) => claim.purpose === "replacement")) {
    await tx.update(businesses).set({ phoneNumberReplacementReservedAt: null, updatedAt: new Date() }).where(and(eq(businesses.id, businessId), sql`${businesses.phoneNumberReplacementReservedAt} = (SELECT reserved_at FROM onboarding_number_claim_events WHERE id = ${claim.id}::uuid)`));
  }
}

/**
 * Reserves a number for an API caller and queues its purchase, inside the
 * caller's worker transaction, through app.reserve_api_number_claim: the
 * dashboard's claim rules, trial numbers and paid-plan rule included, without
 * the onboarding stage order. The caller has checked the offer. A platform
 * key acts for many businesses as one account, so its claim limits count the
 * business's claims; a trial is still once per person and phone.
 *
 * The dashboard's once per network in 30 days doesn't apply: integrations
 * such as Zapier, Make or a partner's backend claim for many customers from
 * the same addresses, so after one trial the rest would be refused. The
 * function gets no network hash, and the trial records none.
 */
export async function reserveApiNumberClaimInTransaction(tx: DatabaseTransaction, input: { businessId: string; userId: string; offer: NumberOffer; claimToken: string; replacingPhoneNumberId: string | null; quotaByBusiness: boolean; requestKey: string }): Promise<string> {
  const tokenHash = createHash("sha256").update(input.claimToken).digest("hex");
  let result;
  try {
    result = await tx.execute(sql`SELECT app.reserve_api_number_claim(${input.businessId}::uuid, ${input.userId}::uuid, ${input.offer.purpose}::text, ${input.replacingPhoneNumberId}::uuid, ${input.offer.e164}::text, ${JSON.stringify(input.offer.selection)}::jsonb, ${tokenHash}::text, ${input.requestKey}::text, NULL::text, ${input.quotaByBusiness}::boolean) AS id`);
  } catch (error) {
    throw claimRefusal(error) ?? error;
  }
  const claimId = String((result.rows[0] as { id?: unknown } | undefined)?.id ?? "");
  if (!claimId) throw new Error("Number claim could not be reserved.");
  await enqueueOutbox(tx, { topic: "phoneNumber.provision", businessId: input.businessId, aggregateType: "number_claim", aggregateId: claimId, dedupeKey: `phone-claim:${claimId}:provision`, payload: { claimId } });
  return claimId;
}

export async function getOnboardingNumberClaim(context: DomainContext, input: { userId: string; businessId: string; claimId: string }) {
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => { await requireBusinessAdmin(tx, input); return (await tx.select({ id: onboardingNumberClaimEvents.id, purpose: onboardingNumberClaimEvents.purpose, status: onboardingNumberClaimEvents.status, requestedE164: onboardingNumberClaimEvents.requestedE164, phoneNumberId: onboardingNumberClaimEvents.phoneNumberId, lastError: onboardingNumberClaimEvents.lastError }).from(onboardingNumberClaimEvents).where(and(eq(onboardingNumberClaimEvents.id, input.claimId), eq(onboardingNumberClaimEvents.businessId, input.businessId), eq(onboardingNumberClaimEvents.userId, input.userId))).limit(1))[0] ?? null; });
}

const numberProvisioningLeaseMs = 10 * 60_000;

export async function claimNumberProvisioning(context: DomainContext, input: { businessId: string; claimId: string }) {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => (await tx.update(onboardingNumberClaimEvents).set({ status: "provisioning", attemptCount: sql`${onboardingNumberClaimEvents.attemptCount} + 1`, updatedAt: new Date() }).where(and(eq(onboardingNumberClaimEvents.id, input.claimId), eq(onboardingNumberClaimEvents.businessId, input.businessId), or(eq(onboardingNumberClaimEvents.status, "reserved"), and(eq(onboardingNumberClaimEvents.status, "provisioning"), lt(onboardingNumberClaimEvents.updatedAt, new Date(Date.now() - numberProvisioningLeaseMs)))))).returning({ id: onboardingNumberClaimEvents.id, e164: onboardingNumberClaimEvents.requestedE164, selection: onboardingNumberClaimEvents.selectionContext }))[0] ?? null);
}

/** When a claim another attempt holds becomes reclaimable, or null when no attempt holds it. */
export async function numberProvisioningLeaseEndsAt(context: DomainContext, input: { businessId: string; claimId: string }): Promise<Date | null> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const row = (await tx.select({ updatedAt: onboardingNumberClaimEvents.updatedAt }).from(onboardingNumberClaimEvents).where(and(eq(onboardingNumberClaimEvents.id, input.claimId), eq(onboardingNumberClaimEvents.businessId, input.businessId), eq(onboardingNumberClaimEvents.status, "provisioning"))).limit(1))[0];
    return row ? new Date(row.updatedAt.getTime() + numberProvisioningLeaseMs) : null;
  });
}

export async function completeNumberProvisioning(context: DomainContext, input: { businessId: string; claimId: string; e164: string; providerPhoneId: string; voiceUrl: string; smsUrl: string }): Promise<string> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const existing = (await tx.select({ id: phoneNumbers.id }).from(phoneNumbers).where(eq(phoneNumbers.providerPhoneId, input.providerPhoneId)).limit(1))[0];
    const offered = (await tx.select({ selection: onboardingNumberClaimEvents.selectionContext }).from(onboardingNumberClaimEvents).where(and(eq(onboardingNumberClaimEvents.id, input.claimId), eq(onboardingNumberClaimEvents.businessId, input.businessId))).limit(1))[0]?.selection;
    // Claims from before voice-only numbers didn't record texting; those numbers all text.
    const smsEnabled = offered?.sms !== false;
    const [number] = existing ? [existing] : await tx.insert(phoneNumbers).values({ businessId: input.businessId, e164: input.e164, providerPhoneId: input.providerPhoneId, status: "active", voiceEnabled: true, smsEnabled, voiceWebhookStatus: "synced", voiceWebhookTargetUrl: input.voiceUrl, voiceWebhookLastSyncedAt: new Date(), smsWebhookStatus: "synced", smsWebhookTargetUrl: input.smsUrl, smsWebhookLastSyncedAt: new Date() }).returning({ id: phoneNumbers.id });
    if (!number) throw new Error("Provisioned number could not be persisted.");
    const claim = (await tx.update(onboardingNumberClaimEvents).set({ status: "claimed", phoneNumberId: number.id, providerPhoneId: input.providerPhoneId, purchasedAt: new Date(), completedAt: new Date(), updatedAt: new Date() }).where(and(eq(onboardingNumberClaimEvents.id, input.claimId), eq(onboardingNumberClaimEvents.businessId, input.businessId), eq(onboardingNumberClaimEvents.status, "provisioning"))).returning({ purpose: onboardingNumberClaimEvents.purpose, replacingPhoneNumberId: onboardingNumberClaimEvents.replacingPhoneNumberId }))[0];
    if (!claim) throw new Error("Number claim is no longer awaiting provisioning.");
    if (claim.purpose === "replacement") {
      if (!claim.replacingPhoneNumberId) throw new Error("Replacement claim has no previous phone number.");
      const retired = await tx.update(phoneNumbers).set({ reclaimScheduledAt: sql`now() + interval '30 days'`, reclaimReason: "replacement", updatedAt: new Date() }).where(and(eq(phoneNumbers.id, claim.replacingPhoneNumberId), eq(phoneNumbers.businessId, input.businessId), eq(phoneNumbers.status, "active"), isNull(phoneNumbers.reclaimScheduledAt))).returning({ id: phoneNumbers.id });
      const business = await tx.update(businesses).set({ phoneNumberReplacementReservedAt: null, phoneNumberReplacementUsedAt: new Date(), updatedAt: new Date() }).where(and(eq(businesses.id, input.businessId), isNull(businesses.phoneNumberReplacementUsedAt), sql`${businesses.phoneNumberReplacementReservedAt} = (SELECT reserved_at FROM onboarding_number_claim_events WHERE id = ${input.claimId}::uuid)`)).returning({ id: businesses.id });
      if (!retired.length || !business.length) throw new Error("Number replacement entitlement is no longer valid.");
    } else {
      await tx.update(businesses).set({ onboardingStage: sql`CASE WHEN ${businesses.onboardingStage} = 'complete' THEN 'complete' ELSE 'attribution' END`, updatedAt: new Date() }).where(eq(businesses.id, input.businessId));
      const activated = await activateNumberTrialInTransaction(tx, { businessId: input.businessId, claimId: input.claimId, phoneNumberId: number.id });
      // The owner may have paid while we bought the number: that payment found no trial to convert, so convert it now.
      const billing = activated ? (await tx.select({ plan: billingAccounts.plan, state: billingAccounts.subscriptionState }).from(billingAccounts).where(eq(billingAccounts.businessId, input.businessId)).limit(1))[0] : undefined;
      if (billing && isPaidSubscription(billing.plan, billing.state)) await keepBusinessNumbersInTransaction(tx, { businessId: input.businessId });
    }
    return number.id;
  });
}

export async function failNumberProvisioning(context: DomainContext, input: { businessId: string; claimId: string; unavailable: boolean }): Promise<void> {
  await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const claim = (await tx.update(onboardingNumberClaimEvents).set({ status: input.unavailable ? "unavailable" : "failed", lastError: input.unavailable ? "The selected number is no longer available." : "Number provisioning failed.", completedAt: new Date(), updatedAt: new Date() }).where(and(eq(onboardingNumberClaimEvents.id, input.claimId), eq(onboardingNumberClaimEvents.businessId, input.businessId))).returning({ purpose: onboardingNumberClaimEvents.purpose }))[0];
    if (claim?.purpose === "replacement") await tx.update(businesses).set({ phoneNumberReplacementReservedAt: null, updatedAt: new Date() }).where(and(eq(businesses.id, input.businessId), sql`${businesses.phoneNumberReplacementReservedAt} = (SELECT reserved_at FROM onboarding_number_claim_events WHERE id = ${input.claimId}::uuid)`));
    else if (claim) {
      // Back to picking a number, from claiming one only: an API claim leaves a business on an earlier step where it is.
      await tx.update(businesses).set({ onboardingStage: "phone_number", updatedAt: new Date() }).where(and(eq(businesses.id, input.businessId), eq(businesses.onboardingStage, "phone_number_claiming")));
      await failNumberTrialInTransaction(tx, { businessId: input.businessId, claimId: input.claimId });
    }
  });
}

export async function skipOnboardingNumber(context: DomainContext, input: { userId: string; businessId: string }): Promise<void> {
  await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => { await requireBusinessAdmin(tx, input); const changed = await tx.update(businesses).set({ onboardingStage: "attribution", updatedAt: new Date() }).where(and(eq(businesses.id, input.businessId), or(eq(businesses.onboardingStage, "verify_phone"), eq(businesses.onboardingStage, "phone_number")))).returning({ id: businesses.id }); if (!changed.length) { const [business] = await tx.select({ stage: businesses.onboardingStage }).from(businesses).where(eq(businesses.id, input.businessId)); if (!["attribution", "complete"].includes(business?.stage ?? "")) throw numberClaimError(409, "invalid_onboarding_stage", "Number selection cannot be skipped at this onboarding stage."); } });
}
