import { createHash } from "node:crypto";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { agents, businesses, businessNumberCharges, enqueueOutbox, phoneNumbers, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";
import { extraNumberPrices, isExtraNumberCountry, planSellsExtraNumbers, type ExtraNumberCountry } from "@lobbystack/shared";

import { requireBusinessAdmin } from "../authz";
import type { DomainContext } from "./context";
import { loadBusinessBilling } from "./entitlement";
import { resolveBusinessNumberMarket } from "./phoneNumberMarket";
import { claimRefusal, offerBusinessNumbers, readNumberOffer, refused, type NumberInventoryProvider, type NumberSelection } from "./phoneNumbers";

// Extra numbers (migration 0216). Starter and Pro include one number, and a
// business on either buys more, each for one of its agents, at what the
// carrier charges the host for a number in that country, from
// extraNumberPrices. A plan with no number limit, such as Enterprise or a
// self-hosted server, gets them free. A partner's businesses keep their tier's
// limits, so they buy none here. When the claim is bought, the claim's trigger
// moves the number to its agent and starts its months, and
// settleExtraNumberCharges charges each month to the business's Polar
// customer while the number is past the plan's included one.

/** Why a business can't buy an extra number now, as app.reserve_extra_number_claim decides. */
export type ExtraNumberRefusal = "extra_numbers_unavailable" | "dedicated_number_requires_paid_plan" | "business_number_required";

/** Whether a business can buy an extra number now, and whether it pays for one. */
export type ExtraNumberAvailability =
  | { available: true; priced: boolean; refusal: null }
  | { available: false; priced: false; refusal: ExtraNumberRefusal };

/**
 * Whether the business can buy an extra number now: a direct business that
 * holds a number already, on a live paid plan on the cloud. `priced` says the
 * plan sells them, so each costs its country's price.
 */
export async function extraNumberAvailabilityInTransaction(tx: DatabaseTransaction, businessId: string): Promise<ExtraNumberAvailability> {
  const [business] = await tx.select({ partnerId: businesses.partnerId, deploymentMode: businesses.deploymentMode }).from(businesses).where(eq(businesses.id, businessId)).limit(1);
  if (!business || business.partnerId) return { available: false, priced: false, refusal: "extra_numbers_unavailable" };
  let priced = false;
  if (business.deploymentMode === "cloud") {
    const billing = await loadBusinessBilling(tx, businessId);
    if (!billing.entitlement.live) return { available: false, priced: false, refusal: "dedicated_number_requires_paid_plan" };
    priced = planSellsExtraNumbers(billing.plan);
    // A live plan that neither sells numbers nor leaves them unlimited.
    if (!priced && billing.entitlement.includedNumbers !== null) return { available: false, priced: false, refusal: "extra_numbers_unavailable" };
  }
  const [held] = await tx.select({ id: phoneNumbers.id }).from(phoneNumbers).where(and(eq(phoneNumbers.businessId, businessId), inArray(phoneNumbers.status, ["active", "provisioning"]), isNull(phoneNumbers.reclaimScheduledAt))).limit(1);
  if (!held) return { available: false, priced: false, refusal: "business_number_required" };
  return { available: true, priced, refusal: null };
}

/** What an extra number in the country costs the business each month, in US cents, or undefined when it's free. */
export function extraNumberMonthlyCents(availability: ExtraNumberAvailability, countryCode: ExtraNumberCountry): number | undefined {
  return availability.priced ? extraNumberPrices[countryCode].monthlyCents : undefined;
}

/**
 * Searches numbers the business can buy as extra ones, in the country it
 * picks or its time zone's, and signs each offer with the price the operator
 * sees: the country's from extraNumberPrices, or none on a plan with no
 * number limit. Throws the claim refusals when the business can't buy one.
 */
export async function searchExtraNumbers(context: DomainContext, input: { userId: string; businessId: string; selection?: Partial<NumberSelection> | undefined; limit?: number | undefined; claimTokenSecret: string }, provider: NumberInventoryProvider) {
  const { availability, timezone } = await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    const [business] = await tx.select({ timezone: businesses.timezone }).from(businesses).where(eq(businesses.id, input.businessId)).limit(1);
    return { availability: await extraNumberAvailabilityInTransaction(tx, input.businessId), timezone: business?.timezone ?? null };
  });
  if (!availability.available) throw refused(availability.refusal);
  const market = resolveBusinessNumberMarket({ selection: input.selection, timezone });
  const countryCode = market.countryCode;
  if (!isExtraNumberCountry(countryCode)) throw Object.assign(new Error("Phone numbers aren't available in this country yet."), { status: 400, code: "unsupported_country" });
  const monthlyCents = extraNumberMonthlyCents(availability, countryCode);
  // An extra number is the country's usual kind, which is what its price is for.
  const selection: Partial<NumberSelection> = { ...input.selection, countryCode, kind: extraNumberPrices[countryCode].kind };
  const numbers = (await offerBusinessNumbers({ userId: input.userId, businessId: input.businessId, purpose: "extra", eligibility: { market, trial: undefined, countryFixed: false, smsRequired: false }, selection, limit: input.limit, claimTokenSecret: input.claimTokenSecret, monthlyPriceCents: monthlyCents }, provider))
    .map(({ kind: _kind, trial: _trial, expiresAt: _expiresAt, ...number }) => number);
  return { market, numbers, price: monthlyCents === undefined ? null : { countryCode, monthlyCents, currency: "USD" as const } };
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
    const [agent] = await tx.select({ id: agents.id }).from(agents).where(and(eq(agents.businessId, input.businessId), eq(agents.id, input.agentId), isNull(agents.archivedAt))).limit(1);
    if (!agent) throw refused("agent_not_found");
    const availability = await extraNumberAvailabilityInTransaction(tx, input.businessId);
    if (!availability.available) throw refused(availability.refusal);
    const countryCode = offer.countryCode.toUpperCase();
    const expected = isExtraNumberCountry(countryCode) ? extraNumberMonthlyCents(availability, countryCode) : undefined;
    if (expected !== offer.selection.monthlyPriceCents) throw refused("extra_number_price_changed");
    const tokenHash = createHash("sha256").update(input.claimToken).digest("hex");
    const result = await tx.execute(sql`SELECT app.reserve_extra_number_claim(${input.businessId}::uuid, ${input.userId}::uuid, ${input.agentId}::uuid, ${offer.e164}::text, ${JSON.stringify(offer.selection)}::jsonb, ${tokenHash}::text, ${input.idempotencyKey}::text, ${expected ?? null}::integer) AS id`);
    const claimId = String((result.rows[0] as { id?: unknown } | undefined)?.id ?? "");
    if (!claimId) throw new Error("Number claim could not be reserved.");
    await enqueueOutbox(tx, { topic: "phoneNumber.provision", businessId: input.businessId, aggregateType: "number_claim", aggregateId: claimId, dedupeKey: `phone-claim:${claimId}:provision`, payload: { claimId } });
    return claimId;
  }).catch((error: unknown) => { throw claimRefusal(error) ?? error; });
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
