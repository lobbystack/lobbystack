import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { and, eq, isNull, lt, or, sql } from "drizzle-orm";

import { billingAccounts, businesses, enqueueOutbox, onboardingNumberClaimEvents, phoneNumbers, withBusinessTransaction } from "@lobbystack/db";

import { requireBusinessAdmin } from "../authz";
import type { DomainContext } from "./context";

export type NumberSelection = { countryCode: "US" | "CA" | "GB" | "AU"; kind: "local" | "toll_free"; areaCode?: string; city?: string; regionCode?: string; postalCode?: string };
export type NumberInventoryProvider = { listAvailablePhoneNumbers(input: NumberSelection & { limit: number }): Promise<Array<{ phoneE164: string; locality?: string; region?: string; countryCode: string; capabilities: { sms: boolean; voice: boolean } }>> };
type NumberClaimPurpose = "onboarding" | "replacement";
type Offer = { v: 1; purpose: NumberClaimPurpose; businessId: string; userId: string; e164: string; countryCode: string; kind: "local" | "toll_free"; capabilities: { sms: true; voice: true }; selection: NumberSelection; exp: number };

function encode(value: unknown): string { return Buffer.from(JSON.stringify(value)).toString("base64url"); }
function sign(encoded: string, secret: string): string { return createHmac("sha256", secret).update(encoded).digest("base64url"); }
function issueOffer(payload: Offer, secret: string): string { const encoded = encode(payload); return `${encoded}.${sign(encoded, secret)}`; }
function verifyOffer(token: string, secret: string): Offer {
  const [encoded, signature, extra] = token.split("."); if (!encoded || !signature || extra) throw new Error("Invalid number claim token.");
  const expected = Buffer.from(sign(encoded, secret)); const actual = Buffer.from(signature); if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new Error("Invalid number claim token.");
  const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Offer;
  if (payload.v !== 1 || !["onboarding", "replacement"].includes(payload.purpose) || payload.exp < Date.now() || !/^\+[1-9]\d{7,14}$/.test(payload.e164) || !payload.capabilities.sms || !payload.capabilities.voice) throw new Error("Number claim token has expired or is invalid.");
  return payload;
}

export async function searchAvailableBusinessNumbers(context: DomainContext, input: { userId: string; businessId: string; purpose?: NumberClaimPurpose; selection?: Partial<NumberSelection>; limit?: number; claimTokenSecret: string }, provider: NumberInventoryProvider) {
  const purpose = input.purpose ?? "onboarding";
  const market = await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    const business = (await tx.select({ stage: businesses.onboardingStage, deploymentMode: businesses.deploymentMode, replacementUsedAt: businesses.phoneNumberReplacementUsedAt }).from(businesses).where(eq(businesses.id, input.businessId)).limit(1))[0];
    const billing = (await tx.select({ plan: billingAccounts.plan, state: billingAccounts.subscriptionState }).from(billingAccounts).where(eq(billingAccounts.businessId, input.businessId)).limit(1))[0];
    if (!business) throw new Error("Workspace not found.");
    if (purpose === "onboarding" && !["plan", "phone_number"].includes(business.stage)) throw new Error("Business number selection is not available at this onboarding stage.");
    if (purpose === "replacement") {
      if (business.replacementUsedAt) throw new Error("This workspace has already used its number replacement.");
      const active = await tx.select({ id: phoneNumbers.id }).from(phoneNumbers).where(and(eq(phoneNumbers.businessId, input.businessId), eq(phoneNumbers.status, "active"), isNull(phoneNumbers.reclaimScheduledAt))).limit(1);
      if (!active.length) throw new Error("An active phone number is required before choosing a replacement.");
    }
    if (business.deploymentMode === "cloud" && (!billing || !["starter", "pro", "enterprise"].includes(billing.plan ?? "") || !["active", "trialing", "past_due"].includes(billing.state ?? ""))) throw new Error("A paid plan is required for a dedicated business number.");
    const result = await tx.execute(sql`SELECT app.resolve_verified_phone_country(${input.businessId}::uuid, ${input.userId}::uuid) AS country`);
    const country = String((result.rows[0] as { country?: unknown } | undefined)?.country ?? "").toUpperCase();
    if (!["US", "CA", "GB", "AU"].includes(country)) throw new Error("A verified phone is required before choosing a number.");
    return country as NumberSelection["countryCode"];
  });
  const countryCode = input.selection?.countryCode ?? market;
  if (!["US", "CA", "GB", "AU"].includes(countryCode)) throw new Error("Unsupported country.");
  const selection: NumberSelection = { countryCode, kind: input.selection?.kind ?? "local", ...(input.selection?.areaCode ? { areaCode: input.selection.areaCode.replace(/\D/g, "") } : {}), ...(input.selection?.city ? { city: input.selection.city.trim() } : {}), ...(input.selection?.regionCode ? { regionCode: input.selection.regionCode.trim() } : {}), ...(input.selection?.postalCode ? { postalCode: input.selection.postalCode.trim() } : {}) };
  const numbers = await provider.listAvailablePhoneNumbers({ ...selection, limit: Math.max(1, Math.min(20, Math.trunc(input.limit ?? 10))) });
  return numbers.filter((number) => number.capabilities.sms && number.capabilities.voice).map((number) => ({ ...number, claimToken: issueOffer({ v: 1, purpose, businessId: input.businessId, userId: input.userId, e164: number.phoneE164, countryCode: number.countryCode, kind: selection.kind, capabilities: { sms: true, voice: true }, selection, exp: Date.now() + 5 * 60_000 }, input.claimTokenSecret) }));
}

export async function reserveOnboardingNumberClaim(context: DomainContext, input: { userId: string; businessId: string; claimToken: string; claimTokenSecret: string; idempotencyKey: string }): Promise<string> {
  const offer = verifyOffer(input.claimToken, input.claimTokenSecret);
  if (offer.purpose !== "onboarding" || offer.businessId !== input.businessId || offer.userId !== input.userId) throw new Error("Number claim token does not belong to this onboarding flow.");
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    const tokenHash = createHash("sha256").update(input.claimToken).digest("hex");
    const result = await tx.execute(sql`SELECT app.reserve_onboarding_number_claim(${input.businessId}::uuid, ${input.userId}::uuid, ${offer.e164}, ${JSON.stringify(offer.selection)}::jsonb, ${tokenHash}, ${input.idempotencyKey}) AS id`);
    const claimId = String((result.rows[0] as { id?: unknown } | undefined)?.id ?? ""); if (!claimId) throw new Error("Number claim could not be reserved.");
    await enqueueOutbox(tx, { topic: "phoneNumber.provision", businessId: input.businessId, aggregateType: "number_claim", aggregateId: claimId, dedupeKey: `phone-claim:${claimId}:provision`, payload: { claimId } });
    return claimId;
  });
}

export async function reserveReplacementNumberClaim(context: DomainContext, input: { userId: string; businessId: string; claimToken: string; claimTokenSecret: string; idempotencyKey: string }): Promise<string> {
  const offer = verifyOffer(input.claimToken, input.claimTokenSecret);
  if (offer.purpose !== "replacement" || offer.businessId !== input.businessId || offer.userId !== input.userId) throw new Error("Number claim token does not belong to this replacement flow.");
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    const tokenHash = createHash("sha256").update(input.claimToken).digest("hex");
    const result = await tx.execute(sql`SELECT app.reserve_replacement_number_claim(${input.businessId}::uuid, ${input.userId}::uuid, ${offer.e164}, ${JSON.stringify(offer.selection)}::jsonb, ${tokenHash}, ${input.idempotencyKey}) AS id`);
    const claimId = String((result.rows[0] as { id?: unknown } | undefined)?.id ?? "");
    if (!claimId) throw new Error("Number replacement could not be reserved.");
    await enqueueOutbox(tx, { topic: "phoneNumber.provision", businessId: input.businessId, aggregateType: "number_claim", aggregateId: claimId, dedupeKey: `phone-claim:${claimId}:provision`, payload: { claimId } });
    return claimId;
  });
}

export async function getOnboardingNumberClaim(context: DomainContext, input: { userId: string; businessId: string; claimId: string }) {
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => { await requireBusinessAdmin(tx, input); return (await tx.select({ id: onboardingNumberClaimEvents.id, purpose: onboardingNumberClaimEvents.purpose, status: onboardingNumberClaimEvents.status, requestedE164: onboardingNumberClaimEvents.requestedE164, phoneNumberId: onboardingNumberClaimEvents.phoneNumberId, lastError: onboardingNumberClaimEvents.lastError }).from(onboardingNumberClaimEvents).where(and(eq(onboardingNumberClaimEvents.id, input.claimId), eq(onboardingNumberClaimEvents.businessId, input.businessId), eq(onboardingNumberClaimEvents.userId, input.userId))).limit(1))[0] ?? null; });
}

export async function claimNumberProvisioning(context: DomainContext, input: { businessId: string; claimId: string }) {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => (await tx.update(onboardingNumberClaimEvents).set({ status: "provisioning", attemptCount: sql`${onboardingNumberClaimEvents.attemptCount} + 1`, updatedAt: new Date() }).where(and(eq(onboardingNumberClaimEvents.id, input.claimId), eq(onboardingNumberClaimEvents.businessId, input.businessId), or(eq(onboardingNumberClaimEvents.status, "reserved"), and(eq(onboardingNumberClaimEvents.status, "provisioning"), lt(onboardingNumberClaimEvents.updatedAt, new Date(Date.now() - 10 * 60_000)))))).returning({ id: onboardingNumberClaimEvents.id, e164: onboardingNumberClaimEvents.requestedE164 }))[0] ?? null);
}

export async function completeNumberProvisioning(context: DomainContext, input: { businessId: string; claimId: string; e164: string; providerPhoneId: string; voiceUrl: string; smsUrl: string }): Promise<string> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const existing = (await tx.select({ id: phoneNumbers.id }).from(phoneNumbers).where(eq(phoneNumbers.providerPhoneId, input.providerPhoneId)).limit(1))[0];
    const [number] = existing ? [existing] : await tx.insert(phoneNumbers).values({ businessId: input.businessId, e164: input.e164, providerPhoneId: input.providerPhoneId, status: "active", voiceEnabled: true, smsEnabled: true, voiceWebhookStatus: "synced", voiceWebhookTargetUrl: input.voiceUrl, voiceWebhookLastSyncedAt: new Date(), smsWebhookStatus: "synced", smsWebhookTargetUrl: input.smsUrl, smsWebhookLastSyncedAt: new Date() }).returning({ id: phoneNumbers.id });
    if (!number) throw new Error("Provisioned number could not be persisted.");
    const claim = (await tx.update(onboardingNumberClaimEvents).set({ status: "claimed", phoneNumberId: number.id, providerPhoneId: input.providerPhoneId, purchasedAt: new Date(), completedAt: new Date(), updatedAt: new Date() }).where(and(eq(onboardingNumberClaimEvents.id, input.claimId), eq(onboardingNumberClaimEvents.businessId, input.businessId), eq(onboardingNumberClaimEvents.status, "provisioning"))).returning({ purpose: onboardingNumberClaimEvents.purpose, replacingPhoneNumberId: onboardingNumberClaimEvents.replacingPhoneNumberId }))[0];
    if (!claim) throw new Error("Number claim is no longer awaiting provisioning.");
    if (claim.purpose === "replacement") {
      if (!claim.replacingPhoneNumberId) throw new Error("Replacement claim has no previous phone number.");
      const retired = await tx.update(phoneNumbers).set({ reclaimScheduledAt: sql`now() + interval '30 days'`, reclaimReason: "replacement", updatedAt: new Date() }).where(and(eq(phoneNumbers.id, claim.replacingPhoneNumberId), eq(phoneNumbers.businessId, input.businessId), eq(phoneNumbers.status, "active"), isNull(phoneNumbers.reclaimScheduledAt))).returning({ id: phoneNumbers.id });
      const business = await tx.update(businesses).set({ phoneNumberReplacementReservedAt: null, phoneNumberReplacementUsedAt: new Date(), updatedAt: new Date() }).where(and(eq(businesses.id, input.businessId), isNull(businesses.phoneNumberReplacementUsedAt), sql`${businesses.phoneNumberReplacementReservedAt} = (SELECT reserved_at FROM onboarding_number_claim_events WHERE id = ${input.claimId}::uuid)`)).returning({ id: businesses.id });
      if (!retired.length || !business.length) throw new Error("Number replacement entitlement is no longer valid.");
    } else {
      await tx.update(businesses).set({ onboardingStage: "attribution", updatedAt: new Date() }).where(eq(businesses.id, input.businessId));
    }
    return number.id;
  });
}

export async function failNumberProvisioning(context: DomainContext, input: { businessId: string; claimId: string; unavailable: boolean }): Promise<void> {
  await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const claim = (await tx.update(onboardingNumberClaimEvents).set({ status: input.unavailable ? "unavailable" : "failed", lastError: input.unavailable ? "The selected number is no longer available." : "Number provisioning failed.", completedAt: new Date(), updatedAt: new Date() }).where(and(eq(onboardingNumberClaimEvents.id, input.claimId), eq(onboardingNumberClaimEvents.businessId, input.businessId))).returning({ purpose: onboardingNumberClaimEvents.purpose }))[0];
    if (claim?.purpose === "replacement") await tx.update(businesses).set({ phoneNumberReplacementReservedAt: null, updatedAt: new Date() }).where(and(eq(businesses.id, input.businessId), sql`${businesses.phoneNumberReplacementReservedAt} = (SELECT reserved_at FROM onboarding_number_claim_events WHERE id = ${input.claimId}::uuid)`));
    else if (claim) await tx.update(businesses).set({ onboardingStage: "phone_number", updatedAt: new Date() }).where(eq(businesses.id, input.businessId));
  });
}

export async function skipOnboardingNumber(context: DomainContext, input: { userId: string; businessId: string }): Promise<void> {
  await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => { await requireBusinessAdmin(tx, input); const changed = await tx.update(businesses).set({ onboardingStage: "attribution", updatedAt: new Date() }).where(and(eq(businesses.id, input.businessId), or(eq(businesses.onboardingStage, "plan"), eq(businesses.onboardingStage, "phone_number")))).returning({ id: businesses.id }); if (!changed.length) throw new Error("Number selection cannot be skipped at this onboarding stage."); });
}
