import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { and, eq, inArray, isNull, lt, lte, ne, or, sql } from "drizzle-orm";

import { agentOfRow, agents, businesses, defaultAgentIdOf, enqueueOutbox, numberTrials, onboardingNumberClaimEvents, phoneNumbers, users, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";
import { isCarrierId, type CarrierId } from "@lobbystack/providers/telephony/types";

import { requireBusinessAdmin } from "../authz";
import type { DomainContext } from "./context";
import { loadEntitlement } from "./entitlement";
import { activateNumberTrialInTransaction, enqueueNumberRouting, failNumberTrialInTransaction, isNumberCountry, keepBusinessNumbersInTransaction, trialCountries, trialEmailInTransaction, directTrialNetworkRefusalInTransaction, trialNumberPaidForInTransaction, verifiedPhone, type NumberCountry } from "./numberTrials";
import { isPastNumberStage, LEGACY_PHONE_STAGES } from "@lobbystack/shared";
import { normalizeOnboardingStage, NUMBER_CLAIM_STAGES, numberRequired } from "./onboarding";
import { loadPartnerNumberStanding, newPartnerNumberRefusal, numberCountsForPartnerInTransaction, partnerKeyNumberRefusal, partnerReplacementRefusal, partnerTrialOffered, recordPartnerNumberCostInTransaction, unclaimedPartnerDemoInTransaction } from "./partnerNumbers";
import { resolveBusinessNumberMarket, type BusinessNumberMarket } from "./phoneNumberMarket";
import { isDisposableTrialEmail } from "./trialEligibility";
import { postBusinessNotificationInTransaction, resolveBusinessNotificationsInTransaction } from "./businessNotifications";

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
  /** A trial the dashboard checked for a verified email and a clean network, so it needs no text. */
  withoutSms?: boolean;
  /** The carrier that sells the number, so the worker buys it there. */
  carrier?: CarrierId;
};
export type NumberInventoryProvider = { listAvailablePhoneNumbers(input: NumberSelection & { limit: number }): Promise<Array<{ phoneE164: string; locality?: string; region?: string; countryCode: string; capabilities: { sms: boolean; voice: boolean }; carrier?: CarrierId }>> };
export type NumberClaimPurpose = "onboarding" | "replacement";
/** A searched number, signed for one business and one person, or for a partner's platform key as `platform:<id>` in `userId`, so a claim can trust it. */
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
  email_verification_required: [409, "Verify your email address before you choose a trial number."],
  trial_already_used: [409, "This phone number or account has already had a free trial. Choose a plan to get a number."],
  trial_ip_limited: [429, "A free trial already started from this network in the last 30 days. Choose a plan to get a number."],
  trial_not_needed: [409, "Your plan already includes a number. Search again to pick one."],
  trial_not_available: [409, "A free trial number isn't available for this workspace. Choose a plan to get a number."],
  // The partner check on onboarding_number_claim_events (migrations 0147 and 0154), which also counts the daily and 30-day quotas above across a partner's businesses.
  partner_numbers_unavailable: [409, "Phone numbers aren't available for this business yet."],
  partner_number_limit_reached: [409, "This business's partner needs a paid tier for more phone numbers."],
  partner_trial_used: [409, "This business's partner already used its free trial number. A paid tier includes numbers."],
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
export type NumberEligibility = { market: BusinessNumberMarket; trial: { verifiedPhone: string | null } | undefined; countryFixed: boolean; smsRequired: boolean };

/**
 * Checks that the business may pick a number for this purpose now, as the
 * person picking: the onboarding stage, the one replacement, and the paid-plan
 * rule, under which a cloud business without a live entitlement gets a free
 * trial number during onboarding. A dashboard trial starts with a verified
 * email and a clean network; it asks for a mobile only when the network can't
 * identify the caller or already started a trial this month. The API has no
 * human network, so its trials keep requiring a verified mobile. Throws the
 * claim refusals the dashboard shows. The API runs in a worker transaction and
 * skips the onboarding stage order.
 */
export async function numberEligibilityInTransaction(tx: DatabaseTransaction, input: { businessId: string; purpose: NumberClaimPurpose; selection?: Partial<NumberSelection> | undefined; ipHash?: string | null | undefined; ipCountry?: string | null | undefined } & ({ userId: string; via: "dashboard" | "api" } | { userId: null; via: "api" })): Promise<NumberEligibility> {
  const { purpose } = input;
  const business = (await tx.select({ stage: businesses.onboardingStage, timezone: businesses.timezone, deploymentMode: businesses.deploymentMode, replacementUsedAt: businesses.phoneNumberReplacementUsedAt }).from(businesses).where(eq(businesses.id, input.businessId)).limit(1))[0];
  const entitlement = await loadEntitlement(tx, input.businessId);
  if (!business) throw numberClaimError(404, "not_found", "Workspace not found.");
  // While the deployment bills tiers, a partner's tier sets how many numbers
  // its businesses hold between them. A paid tier pays for each one past those
  // it includes, and Free gets none past them, apart from the partner's one
  // trial number, which the dashboard offers on the cloud. Without tier
  // billing, the cloud buys a partner's business no new number. The claim
  // checks the same, under the partner's lock.
  let partnerTrial = false;
  // A partner's platform key has no person behind it, so without a user this
  // is a key's search: it needs a paid tier, even to replace a number.
  if (input.userId === null) {
    if (!entitlement.poolPartnerId) throw refused("partner_numbers_unavailable");
    const refusal = partnerKeyNumberRefusal(await loadPartnerNumberStanding(tx, entitlement.poolPartnerId), business.deploymentMode);
    if (refusal) throw refused(refusal);
  }
  if (entitlement.poolPartnerId && purpose === "onboarding") {
    const standing = await loadPartnerNumberStanding(tx, entitlement.poolPartnerId);
    partnerTrial = input.via === "dashboard" && partnerTrialOffered(standing, business.deploymentMode);
    const refusal = newPartnerNumberRefusal(standing, business.deploymentMode);
    if (refusal && !partnerTrial) throw refused(refusal);
  }
  const onboardingStage = normalizeOnboardingStage(business.stage);
  if (input.via === "dashboard" && purpose === "onboarding" && !NUMBER_CLAIM_STAGES.includes(onboardingStage)) throw refused("invalid_onboarding_stage");
  if (purpose === "replacement") {
    if (business.replacementUsedAt) throw refused("replacement_already_used");
    const active = await tx.select({ id: phoneNumbers.id }).from(phoneNumbers).where(and(eq(phoneNumbers.businessId, input.businessId), eq(phoneNumbers.status, "active"), isNull(phoneNumbers.reclaimScheduledAt))).limit(1);
    if (!active.length) throw refused("active_number_required");
    // Checked after the active number, so a running trial's number keeps that refusal. The claim check in migration 0179 refuses the same.
    const refusal = entitlement.poolPartnerId ? partnerReplacementRefusal(await loadPartnerNumberStanding(tx, entitlement.poolPartnerId)) : null;
    if (refusal) throw refused(refusal);
  }
  const verified = input.userId === null ? null : input.via === "dashboard" ? await verifiedPhone(tx, { userId: input.userId, businessId: input.businessId }) : await apiVerifiedPhone(tx, { userId: input.userId, businessId: input.businessId });
  // A verified phone's country decides the number's country. Without one, the
  // search's own selection does, and the market's time zone only suggests it.
  const requested = (verified?.countryCode ?? input.selection?.countryCode)?.trim().toUpperCase();
  if (requested && !isNumberCountry(requested)) throw numberClaimError(400, "unsupported_country", "Phone numbers aren't available in this country yet.");
  const market = resolveBusinessNumberMarket({ selection: requested ? { ...input.selection, countryCode: requested } : input.selection, timezone: business.timezone });
  let trial: { verifiedPhone: string | null } | undefined;
  if (partnerTrial) {
    // The partner's trial runs by the host's trial rules: a live business,
    // the verified mobile of the person claiming, in a trial country, once.
    // A business paused with its partner's other businesses isn't live, and
    // a demo nobody claimed would spend the partner's one trial and expire.
    if (!entitlement.live || await unclaimedPartnerDemoInTransaction(tx, input.businessId)) throw refused("partner_numbers_unavailable");
    // A trial belongs to a person with a verified, non-disposable email.
    if (input.userId === null) throw refused("phone_verification_required");
    const trialEmail = await trialEmailInTransaction(tx, input.userId);
    if (!trialEmail?.emailVerified) throw refused("email_verification_required");
    if (isDisposableTrialEmail(trialEmail.email)) throw refused("trial_not_available");
    if (!verified) throw refused("phone_verification_required");
    if (!(trialCountries() as string[]).includes(verified.countryCode)) throw refused("partner_number_limit_reached");
    const used = await tx.select({ id: numberTrials.id }).from(numberTrials).where(and(eq(numberTrials.businessId, input.businessId), ne(numberTrials.status, "failed"))).limit(1);
    if (used.length) throw refused("trial_already_used");
    trial = { verifiedPhone: verified.phone };
  } else if (business.deploymentMode === "cloud" && !entitlement.live) {
    // A partner's business that isn't live, such as one whose package isn't
    // paid, pays its partner, so the host's plans and free trial aren't for it.
    if (entitlement.poolPartnerId) throw refused("partner_numbers_unavailable");
    // Without a paid plan, a number is a free trial during onboarding.
    if (purpose !== "onboarding") throw refused("dedicated_number_requires_paid_plan");
    // A trial belongs to a person with a verified, non-disposable email.
    if (input.userId === null) throw refused("phone_verification_required");
    const trialEmail = await trialEmailInTransaction(tx, input.userId);
    if (!trialEmail?.emailVerified) throw refused("email_verification_required");
    if (isDisposableTrialEmail(trialEmail.email)) throw refused("trial_not_available");
    const used = await tx.select({ id: numberTrials.id }).from(numberTrials).where(and(eq(numberTrials.businessId, input.businessId), ne(numberTrials.status, "failed"))).limit(1);
    if (used.length) throw refused("trial_already_used");
    // A verified mobile is proof enough, and the number follows its country.
    if (verified) {
      if (!(trialCountries() as string[]).includes(verified.countryCode)) throw refused("dedicated_number_requires_paid_plan");
      trial = { verifiedPhone: verified.phone };
    } else {
      // A trial without a mobile belongs to a person, so a key with no account
      // behind it never gets one.
      if (input.userId === null) throw refused("phone_verification_required");
      // The API has no network to check, so it keeps asking for a mobile. The
      // dashboard checks the request's own network and country, and a direct
      // owner has no phone step, so a network that can't start a trial gets
      // the plans.
      if (input.via === "api") throw refused("phone_verification_required");
      const networkRefusal = await directTrialNetworkRefusalInTransaction(tx, { userId: input.userId, businessId: input.businessId, ipHash: input.ipHash, ipCountry: input.ipCountry });
      if (networkRefusal) throw refused(networkRefusal);
      // The selected country is the number's country, and only a trial country has one.
      if (!(trialCountries() as string[]).includes(market.countryCode)) throw refused("dedicated_number_requires_paid_plan");
      trial = { verifiedPhone: null };
    }
  }
  // Hosted businesses text from the shared sender; a self-hosted one texts from this number.
  return { market, trial, countryFixed: Boolean(verified), smsRequired: business.deploymentMode !== "cloud" };
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
  return (await provider.listAvailablePhoneNumbers({ ...selection, limit, ...(smsRequired ? { sms: true } : {}) })).filter(number => number.capabilities.voice && (!smsRequired || number.capabilities.sms)).slice(0, limit).map(({ carrier, ...number }) => {
    const offered: NumberSelection = { ...selection, sms: number.capabilities.sms, ...(trial ? { trial: true, ...(trial.verifiedPhone ? { verifiedPhone: trial.verifiedPhone } : { withoutSms: true }) } : {}), ...(carrier ? { carrier } : {}) };
    return { ...number, kind, trial: Boolean(trial), claimToken: issueOffer({ v: 1, purpose: input.purpose, businessId: input.businessId, userId: input.userId, e164: number.phoneE164, countryCode: number.countryCode, kind, capabilities: { sms: number.capabilities.sms, voice: true }, selection: offered, exp }, input.claimTokenSecret), expiresAt: new Date(exp) };
  });
}

export async function searchBusinessNumberInventory(context: DomainContext, input: { userId: string; businessId: string; purpose?: NumberClaimPurpose; selection?: Partial<NumberSelection>; limit?: number; claimTokenSecret: string; ipHash?: string | null | undefined; ipCountry?: string | null | undefined }, provider: NumberInventoryProvider) {
  const purpose = input.purpose ?? "onboarding";
  const eligibility = await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    return await numberEligibilityInTransaction(tx, { userId: input.userId, businessId: input.businessId, purpose, selection: input.selection, via: "dashboard", ipHash: input.ipHash, ipCountry: input.ipCountry });
  });
  const numbers = (await offerBusinessNumbers({ userId: input.userId, businessId: input.businessId, purpose, eligibility, selection: input.selection, limit: input.limit, claimTokenSecret: input.claimTokenSecret }, provider))
    .map(({ kind: _kind, trial: _trial, expiresAt: _expiresAt, ...number }) => number);
  // countryFixed: the verified phone picked the country, so the chooser shouldn't offer others.
  return { market: eligibility.market, numbers, trial: Boolean(eligibility.trial), countryFixed: eligibility.countryFixed };
}

/**
 * Reserves an onboarding offer. A trial offer carries either the verified
 * mobile it needs or the dashboard's SMS-free eligibility. Only an SMS-free
 * trial records the network, so the mobile buys the identity instead when the
 * claim has one; a signed offer that expects no text but arrives without a
 * trusted address gets the phone step, not a refusal.
 */
export async function reserveOnboardingNumberClaim(context: DomainContext, input: { userId: string; businessId: string; claimToken: string; claimTokenSecret: string; idempotencyKey: string; ipHash?: string | null }): Promise<string> {
  const offer = readNumberOffer(input.claimToken, input.claimTokenSecret);
  if (offer.purpose !== "onboarding" || offer.businessId !== input.businessId || offer.userId !== input.userId) throw numberClaimError(400, "number_offer_invalid", "Number claim token does not belong to this onboarding flow.");
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    const tokenHash = createHash("sha256").update(input.claimToken).digest("hex");
    const selection = JSON.stringify(offer.selection);
    const withoutSms = offer.selection.trial === true && !offer.selection.verifiedPhone;
    let ipHash: string | null = null;
    if (withoutSms) {
      // Only the dashboard signs these offers, after checking the network. An
      // offer that arrives without a trusted address, or from a network that
      // started a trial since (a second tab), gets the plans.
      ipHash = input.ipHash ?? null;
      if (!ipHash) throw refused("trial_not_available");
      const used = await tx.execute(sql`SELECT app.number_trial_ip_used(${input.businessId}::uuid, ${input.userId}::uuid, ${ipHash}) AS used`);
      if ((used.rows[0] as { used?: boolean } | undefined)?.used) throw refused("trial_ip_limited");
    }
    // The claim function checks the stored stage. A direct business old code
    // left on the phone step goes on to the number first.
    await tx.update(businesses).set({ onboardingStage: "phone_number", updatedAt: new Date() }).where(and(eq(businesses.id, input.businessId), isNull(businesses.partnerId), inArray(businesses.onboardingStage, ["verify_phone", ...LEGACY_PHONE_STAGES])));
    const result = offer.selection.trial
      ? await tx.execute(sql`SELECT app.reserve_trial_number_claim(${input.businessId}::uuid, ${input.userId}::uuid, ${offer.e164}, ${selection}::jsonb, ${tokenHash}, ${input.idempotencyKey}, ${ipHash}) AS id`)
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

/**
 * Reserves a number for a partner's platform key and queues its purchase,
 * inside the caller's worker transaction, through
 * app.reserve_partner_key_number_claim: a claim with no person, which needs a
 * paid tier and never takes a trial number. The caller has checked the offer.
 */
export async function reservePartnerKeyNumberClaimInTransaction(tx: DatabaseTransaction, input: { businessId: string; platformKeyId: string; offer: NumberOffer; claimToken: string; replacingPhoneNumberId: string | null; requestKey: string }): Promise<string> {
  const tokenHash = createHash("sha256").update(input.claimToken).digest("hex");
  let result;
  try {
    result = await tx.execute(sql`SELECT app.reserve_partner_key_number_claim(${input.businessId}::uuid, ${input.platformKeyId}::uuid, ${input.offer.purpose}::text, ${input.replacingPhoneNumberId}::uuid, ${input.offer.e164}::text, ${JSON.stringify(input.offer.selection)}::jsonb, ${tokenHash}::text, ${input.requestKey}::text) AS id`);
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

/**
 * Takes a claim for this worker to buy its number, or one whose earlier
 * attempt died holding it. `countsForPartner` says the number counts against
 * a partner's tier, so the worker reads what the host pays for it before
 * buying it.
 */
export async function claimNumberProvisioning(context: DomainContext, input: { businessId: string; claimId: string }): Promise<{ id: string; e164: string; selection: Record<string, unknown>; carrier: CarrierId; countsForPartner: boolean; reservedAt: Date; providerOrderId: string | null } | null> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    // The signed offer names the carrier that sells the number. An offer from before carriers were recorded is Twilio's, the column's default.
    const carrier = sql`CASE WHEN ${onboardingNumberClaimEvents.selectionContext}->>'carrier' ~ '^[a-z][a-z0-9_]{1,31}$' THEN ${onboardingNumberClaimEvents.selectionContext}->>'carrier' ELSE ${onboardingNumberClaimEvents.carrier} END`;
    const claim = (await tx.update(onboardingNumberClaimEvents).set({ status: "provisioning", carrier, attemptCount: sql`${onboardingNumberClaimEvents.attemptCount} + 1`, updatedAt: new Date() }).where(and(eq(onboardingNumberClaimEvents.id, input.claimId), eq(onboardingNumberClaimEvents.businessId, input.businessId), or(eq(onboardingNumberClaimEvents.status, "reserved"), and(eq(onboardingNumberClaimEvents.status, "provisioning"), lt(onboardingNumberClaimEvents.updatedAt, new Date(Date.now() - numberProvisioningLeaseMs)))))).returning({ id: onboardingNumberClaimEvents.id, e164: onboardingNumberClaimEvents.requestedE164, selection: onboardingNumberClaimEvents.selectionContext, carrier: onboardingNumberClaimEvents.carrier, reservedAt: onboardingNumberClaimEvents.reservedAt, providerOrderId: onboardingNumberClaimEvents.providerOrderId }))[0];
    if (!claim) return null;
    if (!isCarrierId(claim.carrier)) throw new Error(`Number claim ${claim.id} names an unknown carrier, ${claim.carrier}.`);
    return { ...claim, carrier: claim.carrier, countsForPartner: await numberCountsForPartnerInTransaction(tx, input.businessId) };
  });
}

/**
 * How long a claim waits on a carrier order before it fails. Telnyx can take
 * days to review a regulated country's documents.
 */
export const NUMBER_ORDER_MAX_WAIT_MS = 5 * 86_400_000;

/**
 * Keeps a claim provisioning while the carrier finishes its order, with the
 * order's id so the next attempt checks it instead of ordering again.
 * Returns when that attempt can take the claim.
 */
export async function deferNumberProvisioning(context: DomainContext, input: { businessId: string; claimId: string; providerOrderId: string }): Promise<Date> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const now = new Date();
    await tx.update(onboardingNumberClaimEvents).set({ providerOrderId: input.providerOrderId, lastError: "Waiting for the carrier to finish the number order.", updatedAt: now }).where(and(eq(onboardingNumberClaimEvents.id, input.claimId), eq(onboardingNumberClaimEvents.businessId, input.businessId), eq(onboardingNumberClaimEvents.status, "provisioning")));
    return new Date(now.getTime() + numberProvisioningLeaseMs);
  });
}

/** When a claim another attempt holds becomes reclaimable, or null when no attempt holds it. */
export async function numberProvisioningLeaseEndsAt(context: DomainContext, input: { businessId: string; claimId: string }): Promise<Date | null> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const row = (await tx.select({ updatedAt: onboardingNumberClaimEvents.updatedAt }).from(onboardingNumberClaimEvents).where(and(eq(onboardingNumberClaimEvents.id, input.claimId), eq(onboardingNumberClaimEvents.businessId, input.businessId), eq(onboardingNumberClaimEvents.status, "provisioning"))).limit(1))[0];
    return row ? new Date(row.updatedAt.getTime() + numberProvisioningLeaseMs) : null;
  });
}

/**
 * Stores the number the worker bought for a claim. `monthlyCostCents`, what
 * the host pays for the number each month, is recorded for a number that
 * counts against a partner's tier.
 */
export async function completeNumberProvisioning(context: DomainContext, input: { businessId: string; claimId: string; carrier?: CarrierId; e164: string; providerPhoneId: string; carrierConnectionId?: string | undefined; voiceUrl: string; smsUrl?: string; monthlyCostCents?: number | undefined }): Promise<string> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const existing = (await tx.select({ id: phoneNumbers.id }).from(phoneNumbers).where(eq(phoneNumbers.providerPhoneId, input.providerPhoneId)).limit(1))[0];
    const offered = (await tx.select({ selection: onboardingNumberClaimEvents.selectionContext }).from(onboardingNumberClaimEvents).where(and(eq(onboardingNumberClaimEvents.id, input.claimId), eq(onboardingNumberClaimEvents.businessId, input.businessId))).limit(1))[0]?.selection;
    // Claims from before voice-only numbers didn't record texting; those numbers all text.
    const smsEnabled = offered?.sms !== false;
    const [number] = existing ? [existing] : await tx.insert(phoneNumbers).values({ businessId: input.businessId, agentId: defaultAgentIdOf(input.businessId), e164: input.e164, providerPhoneId: input.providerPhoneId, ...(input.carrier ? { carrier: input.carrier } : {}), ...(input.carrierConnectionId ? { carrierConnectionId: input.carrierConnectionId } : {}), status: "active", voiceEnabled: true, smsEnabled, voiceWebhookStatus: "synced", voiceWebhookTargetUrl: input.voiceUrl, voiceWebhookLastSyncedAt: new Date(), ...(input.smsUrl ? { smsWebhookStatus: "synced", smsWebhookTargetUrl: input.smsUrl, smsWebhookLastSyncedAt: new Date() } : {}) }).returning({ id: phoneNumbers.id });
    if (!number) throw new Error("Provisioned number could not be persisted.");
    if (input.monthlyCostCents !== undefined) await recordPartnerNumberCostInTransaction(tx, { businessId: input.businessId, phoneNumberId: number.id, monthlyCostCents: input.monthlyCostCents });
    const claim = (await tx.update(onboardingNumberClaimEvents).set({ status: "claimed", phoneNumberId: number.id, providerPhoneId: input.providerPhoneId, purchasedAt: new Date(), completedAt: new Date(), updatedAt: new Date() }).where(and(eq(onboardingNumberClaimEvents.id, input.claimId), eq(onboardingNumberClaimEvents.businessId, input.businessId), eq(onboardingNumberClaimEvents.status, "provisioning"))).returning({ purpose: onboardingNumberClaimEvents.purpose, replacingPhoneNumberId: onboardingNumberClaimEvents.replacingPhoneNumberId }))[0];
    if (!claim) throw new Error("Number claim is no longer awaiting provisioning.");
    if (claim.purpose === "replacement") {
      if (!claim.replacingPhoneNumberId) throw new Error("Replacement claim has no previous phone number.");
      const retired = await tx.update(phoneNumbers).set({ reclaimScheduledAt: sql`now() + interval '30 days'`, reclaimReason: "replacement", updatedAt: new Date() }).where(and(eq(phoneNumbers.id, claim.replacingPhoneNumberId), eq(phoneNumbers.businessId, input.businessId), eq(phoneNumbers.status, "active"), isNull(phoneNumbers.reclaimScheduledAt))).returning({ id: phoneNumbers.id });
      const business = await tx.update(businesses).set({ phoneNumberReplacementReservedAt: null, phoneNumberReplacementUsedAt: new Date(), updatedAt: new Date() }).where(and(eq(businesses.id, input.businessId), isNull(businesses.phoneNumberReplacementUsedAt), sql`${businesses.phoneNumberReplacementReservedAt} = (SELECT reserved_at FROM onboarding_number_claim_events WHERE id = ${input.claimId}::uuid)`)).returning({ id: businesses.id });
      if (!retired.length || !business.length) throw new Error("Number replacement entitlement is no longer valid.");
    } else {
      const activated = await activateNumberTrialInTransaction(tx, { businessId: input.businessId, claimId: input.claimId, phoneNumberId: number.id });
      // The owner, or for a partner's trial the partner, may have paid while we bought the number: that payment found no trial to convert, so convert it now.
      if (activated && await trialNumberPaidForInTransaction(tx, input.businessId)) await keepBusinessNumbersInTransaction(tx, { businessId: input.businessId });
      // A direct business answers the attribution question next; the plans
      // come after Meet your agent. A partner's business has no attribution
      // step, and a key can buy its number while it waits for its owner, so it
      // stays on the step it's on. A business past the number stays put too.
      await tx.update(businesses).set({ onboardingStage: sql`CASE WHEN ${businesses.onboardingStage} IN ('attribution', 'meet', 'choose_plan', 'complete') OR (${businesses.partnerId} IS NOT NULL AND ${businesses.onboardingStage} NOT IN ('phone_number', 'phone_number_claiming')) THEN ${businesses.onboardingStage} WHEN ${businesses.partnerId} IS NULL THEN 'attribution' ELSE 'meet' END`, updatedAt: new Date() }).where(eq(businesses.id, input.businessId));
    }
    // Every number starts on the agent. With staff answers first on for the agent it reaches, routing moves this one to the webhook.
    const profile = (await tx.select({ staffFirstMode: agents.staffFirstMode }).from(phoneNumbers).innerJoin(agents, agentOfRow(phoneNumbers.businessId, phoneNumbers.agentId)).where(eq(phoneNumbers.id, number.id)).limit(1))[0];
    if (profile && profile.staffFirstMode !== "never") await enqueueNumberRouting(tx, { businessId: input.businessId, phoneNumberId: number.id, mode: "receptionist" });
    // The business has a number again.
    await resolveBusinessNotificationsInTransaction(tx, { businessId: input.businessId, kinds: ["number_purchase_failed", "number_released"] });
    return number.id;
  });
}

export async function failNumberProvisioning(context: DomainContext, input: { businessId: string; claimId: string; unavailable: boolean }): Promise<void> {
  await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const claim = (await tx.update(onboardingNumberClaimEvents).set({ status: input.unavailable ? "unavailable" : "failed", lastError: input.unavailable ? "The selected number is no longer available." : "Number provisioning failed.", completedAt: new Date(), updatedAt: new Date() }).where(and(eq(onboardingNumberClaimEvents.id, input.claimId), eq(onboardingNumberClaimEvents.businessId, input.businessId))).returning({ purpose: onboardingNumberClaimEvents.purpose, e164: onboardingNumberClaimEvents.requestedE164 }))[0];
    if (claim) await postBusinessNotificationInTransaction(tx, { businessId: input.businessId, kind: "number_purchase_failed", key: `number_purchase_failed:${input.claimId}`, params: { number: claim.e164, unavailable: input.unavailable } });
    if (claim?.purpose === "replacement") await tx.update(businesses).set({ phoneNumberReplacementReservedAt: null, updatedAt: new Date() }).where(and(eq(businesses.id, input.businessId), sql`${businesses.phoneNumberReplacementReservedAt} = (SELECT reserved_at FROM onboarding_number_claim_events WHERE id = ${input.claimId}::uuid)`));
    else if (claim) {
      // Back to picking a number, from claiming one only: an API claim leaves a business on an earlier step where it is.
      await tx.update(businesses).set({ onboardingStage: "phone_number", updatedAt: new Date() }).where(and(eq(businesses.id, input.businessId), eq(businesses.onboardingStage, "phone_number_claiming")));
      await failNumberTrialInTransaction(tx, { businessId: input.businessId, claimId: input.claimId });
    }
  });
}

/**
 * Moves a direct business past the number step without a number. A partner's
 * business has no number step, so only a direct business skips. The country
 * the owner picked, where we sell no numbers, is logged.
 */
export async function skipOnboardingNumber(context: DomainContext, input: { userId: string; businessId: string; countryCode?: string | null }): Promise<void> {
  const countryCode = input.countryCode?.trim().toUpperCase() || null;
  if (countryCode && !/^[A-Z]{2}$/.test(countryCode)) throw numberClaimError(400, "country_invalid", "Pick a country.");
  const moved = await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    const [business] = await tx.select({ stage: businesses.onboardingStage, partnerId: businesses.partnerId, deploymentMode: businesses.deploymentMode }).from(businesses).where(eq(businesses.id, input.businessId)).limit(1);
    const stage = normalizeOnboardingStage(business?.stage, business);
    // From a later step, as from the dashboard, the skip only leaves the picker.
    if (business && !business.partnerId && isPastNumberStage(stage)) return false;
    if (!business || business.partnerId || stage !== "phone_number") throw numberClaimError(409, "invalid_onboarding_stage", "Number selection cannot be skipped at this onboarding stage.");
    // A direct cloud owner needs a number, unless we sell none in their
    // country. The server trusts the country they picked and logs it below.
    if (business.deploymentMode === "cloud" && (!countryCode || isNumberCountry(countryCode))) throw numberRequired();
    await tx.update(businesses).set({ onboardingStage: "attribution", updatedAt: new Date() }).where(and(eq(businesses.id, input.businessId), isNull(businesses.partnerId), inArray(businesses.onboardingStage, ["verify_phone", "phone_number", ...LEGACY_PHONE_STAGES])));
    return true;
  });
  if (moved) console.info(JSON.stringify({ event: "onboarding.number_skipped", businessId: input.businessId, countryCode }));
}
