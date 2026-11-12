import { createHash } from "node:crypto";

import { and, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";

import { agents, billingAccounts, billingCheckoutRequests, businesses, businessNumberCharges, enqueueOutbox, phoneNumbers, users, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";
import { extraNumberMonthlyCents, isExtraNumberCountry, planSellsExtraNumbers, soldNumberKind, type ExtraNumberKind } from "@lobbystack/shared";

import { requireBusinessAdmin } from "../authz";
import type { DomainContext } from "./context";
import { loadBusinessBilling } from "./entitlement";
import { extraNumbersSubscriptionLiveInTransaction } from "./extraNumbersSubscription";
import { resolveBusinessNumberMarket } from "./phoneNumberMarket";
import { claimRefusal, offerBusinessNumbers, readNumberOffer, refused, type NumberInventoryProvider, type NumberOffer, type NumberSelection } from "./phoneNumbers";

// Extra numbers (migrations 0216 and 0217). Starter, Pro and Enterprise
// include one number, and a business on any of them buys more, each for one of
// its agents, at what the carrier charges the host for a number in that
// country, from extraNumberPrices. A self-hosted server gets them free. A
// partner's businesses keep their tier's limits, so they buy none here.
//
// Extra numbers bill monthly, apart from the plan, through the extra numbers
// add-on: a monthly Polar subscription whose only price is metered on
// billing.extra_numbers (extraNumbersSubscription.ts). A business subscribes
// through a Polar checkout before its first priced extra number. When a claim
// is bought, the claim's trigger moves the number to its agent and starts its
// months, and settleExtraNumberCharges reports each month to Polar while the
// number is past the plan's included one and the add-on bills.

/** Why a business can't buy an extra number now, as app.reserve_extra_number_claim decides. */
export type ExtraNumberRefusal = "extra_numbers_unavailable" | "dedicated_number_requires_paid_plan" | "business_number_required";

/**
 * Whether a business can buy an extra number now, whether it pays for one,
 * and whether its add-on bills already. A priced number needs the add-on, so
 * `priced` without `subscribed` means a checkout for the add-on comes first.
 */
export type ExtraNumberAvailability =
  | { available: true; priced: boolean; subscribed: boolean; refusal: null }
  | { available: false; priced: false; subscribed: boolean; refusal: ExtraNumberRefusal };

/**
 * Whether the business can buy an extra number now: a direct business that
 * holds a number already, on a live paid plan on the cloud, or on a
 * self-hosted server. `priced` says the plan sells them, so each costs its
 * country's price.
 */
export async function extraNumberAvailabilityInTransaction(tx: DatabaseTransaction, businessId: string): Promise<ExtraNumberAvailability> {
  const [business] = await tx.select({ partnerId: businesses.partnerId, deploymentMode: businesses.deploymentMode }).from(businesses).where(eq(businesses.id, businessId)).limit(1);
  if (!business || business.partnerId) return { available: false, priced: false, subscribed: false, refusal: "extra_numbers_unavailable" };
  const subscribed = await extraNumbersSubscriptionLiveInTransaction(tx, businessId);
  let priced = false;
  if (business.deploymentMode === "cloud") {
    const billing = await loadBusinessBilling(tx, businessId);
    if (!billing.entitlement.live) return { available: false, priced: false, subscribed, refusal: "dedicated_number_requires_paid_plan" };
    priced = planSellsExtraNumbers(billing.plan);
    // A live plan that doesn't sell them.
    if (!priced) return { available: false, priced: false, subscribed, refusal: "extra_numbers_unavailable" };
  }
  const [held] = await tx.select({ id: phoneNumbers.id }).from(phoneNumbers).where(and(eq(phoneNumbers.businessId, businessId), inArray(phoneNumbers.status, ["active", "provisioning"]), isNull(phoneNumbers.reclaimScheduledAt))).limit(1);
  if (!held) return { available: false, priced: false, subscribed, refusal: "business_number_required" };
  return { available: true, priced, subscribed, refusal: null };
}

/**
 * What an extra number of this country and kind costs the business each
 * month, in US cents: null when it's free, and undefined when the plan sells
 * it but extraNumberPrices has no price for that kind there.
 */
export function extraNumberPriceFor(availability: ExtraNumberAvailability, countryCode: string, kind: ExtraNumberKind): number | null | undefined {
  if (!availability.priced) return null;
  return extraNumberMonthlyCents(countryCode, kind);
}

function unsupportedKind(): Error {
  return Object.assign(new Error("Extra numbers of this kind aren't sold in this country."), { status: 400, code: "unsupported_number_kind" });
}

/**
 * Searches numbers the business can buy as extra ones, in the country it
 * picks or its time zone's, of the kind the country sells, and signs each
 * offer with the price the operator sees: Twilio's for that country and kind,
 * from extraNumberPrices, or none on a self-hosted server. Throws the claim
 * refusals when the business can't buy one.
 */
export async function searchExtraNumbers(context: DomainContext, input: { userId: string; businessId: string; selection?: Partial<NumberSelection> | undefined; limit?: number | undefined; claimTokenSecret: string }, provider: NumberInventoryProvider) {
  const found = await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    return await extraNumberSearchInTransaction(tx, input.businessId);
  });
  return await offerExtraNumbers({ ...input, ...found }, provider);
}

/** What a search for extra numbers needs from the business, in the caller's transaction: whether it can buy one, and its time zone. */
export async function extraNumberSearchInTransaction(tx: DatabaseTransaction, businessId: string): Promise<{ availability: ExtraNumberAvailability; timezone: string | null }> {
  const [business] = await tx.select({ timezone: businesses.timezone }).from(businesses).where(eq(businesses.id, businessId)).limit(1);
  return { availability: await extraNumberAvailabilityInTransaction(tx, businessId), timezone: business?.timezone ?? null };
}

/** Searches the carrier and signs each extra number offer with its price, once the caller read the business's availability. */
export async function offerExtraNumbers(input: { userId: string; businessId: string; availability: ExtraNumberAvailability; timezone: string | null; selection?: Partial<NumberSelection> | undefined; limit?: number | undefined; claimTokenSecret: string }, provider: NumberInventoryProvider) {
  const { availability, timezone } = input;
  if (!availability.available) throw refused(availability.refusal);
  const market = resolveBusinessNumberMarket({ selection: input.selection, timezone });
  const countryCode = market.countryCode;
  if (!isExtraNumberCountry(countryCode)) throw Object.assign(new Error("Phone numbers aren't available in this country yet."), { status: 400, code: "unsupported_country" });
  const kind = soldNumberKind(countryCode, input.selection?.kind);
  const monthlyCents = extraNumberPriceFor(availability, countryCode, kind);
  if (monthlyCents === undefined) throw unsupportedKind();
  const selection: Partial<NumberSelection> = { ...input.selection, countryCode, kind };
  const numbers = (await offerBusinessNumbers({ userId: input.userId, businessId: input.businessId, purpose: "extra", eligibility: { market, trial: undefined, countryFixed: false, smsRequired: false }, selection, limit: input.limit, claimTokenSecret: input.claimTokenSecret, ...(monthlyCents === null ? {} : { monthlyPriceCents: monthlyCents }) }, provider))
    .map(({ trial: _trial, ...number }) => number);
  return { market, kind, numbers, price: monthlyCents === null ? null : { countryCode, kind, monthlyCents, currency: "USD" as const }, subscribed: availability.subscribed };
}

/**
 * Reserves an extra number for one of the business's agents and queues its
 * purchase. The offer's price must still be what the business's plan charges
 * for the country, so the operator pays what they saw.
 */
export async function reserveExtraNumberClaim(context: DomainContext, input: { userId: string; businessId: string; agentId: string; claimToken: string; claimTokenSecret: string; idempotencyKey: string }): Promise<string> {
  const offer = readNumberOffer(input.claimToken, input.claimTokenSecret);
  if (offer.purpose !== "extra" || offer.businessId !== input.businessId || offer.userId !== input.userId) throw Object.assign(new Error("Number claim token does not belong to this purchase."), { status: 400, code: "number_offer_invalid" });
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    const price = await checkExtraNumberOfferInTransaction(tx, { businessId: input.businessId, agentId: input.agentId, offer });
    const tokenHash = createHash("sha256").update(input.claimToken).digest("hex");
    const result = await tx.execute(sql`SELECT app.reserve_extra_number_claim(${input.businessId}::uuid, ${input.userId}::uuid, ${input.agentId}::uuid, ${offer.e164}::text, ${JSON.stringify(offer.selection)}::jsonb, ${tokenHash}::text, ${input.idempotencyKey}::text, ${price}::integer) AS id`);
    return await queueExtraNumberPurchase(tx, input.businessId, result.rows[0]);
  }).catch((error: unknown) => { throw claimRefusal(error) ?? error; });
}

/**
 * The checks an extra number offer passes before it's reserved, in the
 * caller's transaction: the agent is the business's, the business can buy
 * one, the price is still what it saw, and a priced number's add-on bills.
 * Returns the price to record, or null when it's free.
 */
async function checkExtraNumberOfferInTransaction(tx: DatabaseTransaction, input: { businessId: string; agentId: string; offer: NumberOffer }): Promise<number | null> {
  const [agent] = await tx.select({ id: agents.id }).from(agents).where(and(eq(agents.businessId, input.businessId), eq(agents.id, input.agentId), isNull(agents.archivedAt))).limit(1);
  if (!agent) throw refused("agent_not_found");
  const availability = await extraNumberAvailabilityInTransaction(tx, input.businessId);
  if (!availability.available) throw refused(availability.refusal);
  const price = extraNumberPriceFor(availability, input.offer.countryCode.toUpperCase(), input.offer.selection.kind);
  // A kind no longer priced, a price that changed, or a plan that now prices what was free.
  if (price === undefined || (price ?? undefined) !== input.offer.selection.monthlyPriceCents) throw refused("extra_number_price_changed");
  // The add-on bills the number's months, so a priced number waits for it.
  if (price !== null && !availability.subscribed) throw refused("extra_numbers_subscription_required");
  return price;
}

async function queueExtraNumberPurchase(tx: DatabaseTransaction, businessId: string, row: unknown): Promise<string> {
  const claimId = String((row as { id?: unknown } | undefined)?.id ?? "");
  if (!claimId) throw new Error("Number claim could not be reserved.");
  await enqueueOutbox(tx, { topic: "phoneNumber.provision", businessId, aggregateType: "number_claim", aggregateId: claimId, dedupeKey: `phone-claim:${claimId}:provision`, payload: { claimId } });
  return claimId;
}

/**
 * Reserves an extra number for the public API, in its worker transaction,
 * through app.reserve_api_extra_number_claim: the account the key acts as
 * buys it, with the dashboard's checks. The caller has checked the offer was
 * made for this business and account. A platform key's claims count against
 * the business's quotas, and a key's against its account's.
 */
export async function reserveApiExtraNumberClaimInTransaction(tx: DatabaseTransaction, input: { businessId: string; userId: string; agentId: string; offer: NumberOffer; claimToken: string; quotaByBusiness: boolean; requestKey: string }): Promise<string> {
  try {
    const price = await checkExtraNumberOfferInTransaction(tx, input);
    const tokenHash = createHash("sha256").update(input.claimToken).digest("hex");
    const result = await tx.execute(sql`SELECT app.reserve_api_extra_number_claim(${input.businessId}::uuid, ${input.userId}::uuid, ${input.agentId}::uuid, ${input.offer.e164}::text, ${JSON.stringify(input.offer.selection)}::jsonb, ${tokenHash}::text, ${input.requestKey}::text, ${price}::integer, ${input.quotaByBusiness}::boolean) AS id`);
    return await queueExtraNumberPurchase(tx, input.businessId, result.rows[0]);
  } catch (error) {
    throw claimRefusal(error) ?? error;
  }
}

/** The checkout request target of the extra numbers add-on, in billing_checkout_requests. */
export const EXTRA_NUMBERS_CHECKOUT_TARGET = "extra_numbers";

const openExtraNumbersCheckoutMs = 30 * 60_000;

function conflictError(message: string, code: string): Error {
  return Object.assign(new Error(message), { status: 409, code });
}

/**
 * Queues a Polar checkout for the extra numbers add-on, made out to the
 * person asking, whose email Polar fills in. Only a business that can buy a
 * priced extra number, and whose add-on doesn't bill yet, gets one. Asking
 * again for your own open checkout returns it; someone else's is a 409.
 * `agentId` names the agent whose phone page Polar sends the payer back to.
 * Callers authorize first.
 */
export async function createExtraNumbersCheckoutRequestInTransaction(tx: DatabaseTransaction, input: { userId: string; businessId: string; agentId?: string | null | undefined }): Promise<string> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`billing-checkout:${input.businessId}`}, 0))`);
  const availability = await extraNumberAvailabilityInTransaction(tx, input.businessId);
  if (!availability.available) throw refused(availability.refusal);
  if (!availability.priced) throw conflictError("Extra numbers are free on this server, so there's nothing to subscribe to.", "extra_numbers_free");
  if (availability.subscribed) throw conflictError("The extra phone numbers add-on is already active.", "extra_numbers_subscribed");
  if (input.agentId) {
    const [agent] = await tx.select({ id: agents.id }).from(agents).where(and(eq(agents.businessId, input.businessId), eq(agents.id, input.agentId), isNull(agents.archivedAt))).limit(1);
    if (!agent) throw refused("agent_not_found");
  }
  const [open] = await tx.select({ id: billingCheckoutRequests.id, requestedByUserId: billingCheckoutRequests.requestedByUserId })
    .from(billingCheckoutRequests)
    .where(and(eq(billingCheckoutRequests.businessId, input.businessId), eq(billingCheckoutRequests.target, EXTRA_NUMBERS_CHECKOUT_TARGET), inArray(billingCheckoutRequests.status, ["pending", "processing", "ready"]), gt(billingCheckoutRequests.createdAt, new Date(Date.now() - openExtraNumbersCheckoutMs))))
    .orderBy(desc(billingCheckoutRequests.createdAt))
    .limit(1);
  if (open) {
    if (open.requestedByUserId !== input.userId) throw conflictError("A checkout is already open for this workspace.", "checkout_in_progress");
    return open.id;
  }
  await tx.insert(billingAccounts).values({ businessId: input.businessId, billingKey: `business:${input.businessId}` }).onConflictDoNothing({ target: billingAccounts.businessId });
  const [request] = await tx.insert(billingCheckoutRequests).values({ businessId: input.businessId, requestedByUserId: input.userId, target: EXTRA_NUMBERS_CHECKOUT_TARGET, billingInterval: "monthly", status: "pending", agentId: input.agentId ?? null }).returning({ id: billingCheckoutRequests.id });
  if (!request) throw new Error("Extra numbers checkout request could not be created.");
  // Its own topic, so a worker from before the add-on leaves it for one that knows it.
  await enqueueOutbox(tx, { topic: "billing.createExtraNumbersCheckout", businessId: input.businessId, aggregateType: "billing_checkout_request", aggregateId: request.id, dedupeKey: `extra-numbers-checkout:${request.id}`, payload: { requestId: request.id } });
  return request.id;
}

export async function createExtraNumbersCheckoutRequest(context: DomainContext, input: { userId: string; businessId: string; agentId?: string | null | undefined }): Promise<string> {
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    return await createExtraNumbersCheckoutRequestInTransaction(tx, input);
  });
}

/** An extra numbers checkout, and whether the add-on it sells bills now. */
export type ExtraNumbersCheckout = { id: string; status: "pending" | "processing" | "ready" | "error"; checkoutUrl: string | null; error: string | null; subscribed: boolean; createdAt: Date; updatedAt: Date };

export async function loadExtraNumbersCheckoutInTransaction(tx: DatabaseTransaction, input: { businessId: string; requestId: string }): Promise<ExtraNumbersCheckout | null> {
  const [row] = await tx.select({ id: billingCheckoutRequests.id, status: billingCheckoutRequests.status, checkoutUrl: billingCheckoutRequests.checkoutUrl, error: billingCheckoutRequests.error, createdAt: billingCheckoutRequests.createdAt, updatedAt: billingCheckoutRequests.updatedAt })
    .from(billingCheckoutRequests)
    .where(and(eq(billingCheckoutRequests.id, input.requestId), eq(billingCheckoutRequests.businessId, input.businessId), eq(billingCheckoutRequests.target, EXTRA_NUMBERS_CHECKOUT_TARGET)))
    .limit(1);
  if (!row) return null;
  const status = row.status === "canceled" || row.status === "superseded" ? "error" : (["pending", "processing", "ready", "error"] as const).find((value) => value === row.status) ?? "pending";
  return { ...row, status, subscribed: await extraNumbersSubscriptionLiveInTransaction(tx, input.businessId) };
}

/** What the worker needs to make an extra numbers checkout: who pays, the Polar customer, and the page to come back to. */
export async function loadExtraNumbersCheckoutRequest(context: DomainContext, input: { businessId: string; requestId: string }): Promise<{ customerEmail: string; externalCustomerId: string; agentId: string | null } | null> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const [row] = await tx.select({ customerEmail: users.email, billingKey: billingAccounts.billingKey, agentId: billingCheckoutRequests.agentId })
      .from(billingCheckoutRequests)
      .innerJoin(users, eq(users.id, billingCheckoutRequests.requestedByUserId))
      .leftJoin(billingAccounts, eq(billingAccounts.businessId, billingCheckoutRequests.businessId))
      .where(and(eq(billingCheckoutRequests.id, input.requestId), eq(billingCheckoutRequests.businessId, input.businessId), eq(billingCheckoutRequests.target, EXTRA_NUMBERS_CHECKOUT_TARGET)))
      .limit(1);
    if (!row) return null;
    return { customerEmail: row.customerEmail, externalCustomerId: row.billingKey ?? `business:${input.businessId}`, agentId: row.agentId };
  });
}

/** Each extra number's monthly price, by phone number, for the business's own numbers. */
export async function extraNumberPricesInTransaction(tx: DatabaseTransaction, businessId: string): Promise<Map<string, number>> {
  const rows = await tx.select({ phoneNumberId: businessNumberCharges.phoneNumberId, monthlyPriceCents: businessNumberCharges.monthlyPriceCents }).from(businessNumberCharges).where(eq(businessNumberCharges.businessId, businessId));
  return new Map(rows.map((row) => [row.phoneNumberId, row.monthlyPriceCents]));
}

/** A month of an extra number that the business pays for. */
export type ExtraNumberCharge = {
  chargeId: string;
  businessId: string;
  /** The business's Polar customer. */
  billingKey: string;
  countryCode: string;
  /** The month of the number, from 0 for the month it was bought. */
  month: number;
  periodStart: Date;
  amountCents: number;
  /** Polar's external id for the charge, so a retry is never charged twice. */
  idempotencyKey: string;
};

const SETTLE_BATCH = 100;
const SETTLE_ROUNDS = 10;

/** Polar refused some of a run's charges. Their months stay unsettled, so the next run reports them again. */
export class ExtraNumberChargeError extends Error {
  constructor(readonly failures: Array<{ charge: ExtraNumberCharge; error: unknown }>) {
    const first = failures[0]?.error;
    const count = new Set(failures.map((failure) => failure.charge.businessId)).size;
    super(`Couldn't report ${failures.length} extra number ${failures.length === 1 ? "charge" : "charges"} for ${count} ${count === 1 ? "business" : "businesses"}; the next run reports ${failures.length === 1 ? "it" : "them"} again. First error: ${first instanceof Error ? first.message : String(first)}`, { cause: first });
    this.name = "ExtraNumberChargeError";
  }
}

/**
 * Settles each due month of the businesses' extra numbers, oldest first, as
 * settlePartnerNumberCharges does for partners. A month the business pays for
 * goes to `report`, which sends it to Polar, before it counts as settled; a
 * month nothing pays for, because the number is now the included one or the
 * plan doesn't sell extra numbers, just settles. When `report` fails for a
 * business, its months wait for the next run while every other month still
 * settles, and the run then throws an ExtraNumberChargeError.
 */
export async function settleExtraNumberCharges(
  context: DomainContext,
  input: { report: (charge: ExtraNumberCharge) => Promise<void>; now?: Date },
): Promise<{ settled: number; charged: number }> {
  const now = input.now ?? new Date();
  let settled = 0;
  let charged = 0;
  const skipped: string[] = [];
  const failedBusinesses = new Set<string>();
  const failures: Array<{ charge: ExtraNumberCharge; error: unknown }> = [];
  for (let round = 0; round < SETTLE_ROUNDS; round += 1) {
    const due = await withBusinessTransaction(context.db, { actorType: "worker" }, async (tx) => (await tx.execute<{ charge_id: string; business_id: string; billing_key: string | null; country_code: string; month: number; period_start: Date | string; amount_cents: number; charged: boolean }>(sql`select charge_id, business_id, billing_key, country_code, month, period_start, amount_cents, charged from app.due_business_number_charges(${now.toISOString()}::timestamptz, ${SETTLE_BATCH}::integer, ${`{${skipped.join(",")}}`}::uuid[])`)).rows);
    if (!due.length) break;
    for (const row of due) {
      const month = Number(row.month);
      if (row.charged && row.billing_key) {
        if (failedBusinesses.has(row.business_id)) {
          skipped.push(row.charge_id);
          continue;
        }
        const charge: ExtraNumberCharge = {
          chargeId: row.charge_id,
          businessId: row.business_id,
          billingKey: row.billing_key,
          countryCode: row.country_code,
          month,
          periodStart: new Date(row.period_start),
          amountCents: Number(row.amount_cents),
          idempotencyKey: `extra-number:${row.charge_id}:${month}`,
        };
        try {
          await input.report(charge);
        } catch (error) {
          failures.push({ charge, error });
          failedBusinesses.add(row.business_id);
          skipped.push(row.charge_id);
          continue;
        }
      }
      const updated = await withBusinessTransaction(context.db, { actorType: "worker" }, async (tx) => await tx.update(businessNumberCharges)
        .set({ monthsSettled: sql`${businessNumberCharges.monthsSettled} + 1`, ...(row.charged ? { monthsCharged: sql`${businessNumberCharges.monthsCharged} + 1` } : {}), updatedAt: new Date() })
        .where(and(eq(businessNumberCharges.id, row.charge_id), eq(businessNumberCharges.monthsSettled, month)))
        .returning({ id: businessNumberCharges.id }));
      if (!updated.length) continue;
      settled += 1;
      if (row.charged) charged += 1;
    }
  }
  if (failures.length) throw new ExtraNumberChargeError(failures);
  return { settled, charged };
}
