import { and, eq, ne, sql } from "drizzle-orm";

import { businesses, partnerNumberCharges, partnerTierBilling, prospectDemos, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";

import type { DomainContext } from "./context";
import { loadEntitlement } from "./entitlement";
import { normalizeOnboardingStage, NUMBER_CLAIM_STAGES } from "./onboarding";

// A partner's tier sets how many phone numbers its businesses hold between
// them. While the deployment bills tiers, on the cloud or self-hosted, the
// number claims count every number the partner's businesses hold against the
// tier's included numbers (migration 0147). A paid tier can hold more, and
// each number past the included ones costs the partner what the host pays its
// carrier for it each month: the worker reads that cost when it buys the
// number, and reports each month the number is past the included ones to
// Polar, under the partner's customer. The partner's oldest numbers are the
// included ones. Without tier billing, nobody would pay for a partner's
// numbers on the cloud, so the cloud buys its businesses no new number. A
// self-hosted server without tier billing counts no partner's numbers and
// charges for none.

/** Where a partner stands on phone numbers. */
export type PartnerNumberStanding = {
  /** Numbers the partner's businesses hold between them, counting the ones claims are buying now. */
  held: number;
  /** Numbers the partner's tier includes. */
  included: number;
  /** Whether the partner pays for a tier, which lets its businesses hold numbers past the included ones. */
  paidTier: boolean;
  /** Whether this deployment counts the partner's numbers against its tier at all, which it does only while it bills tiers. */
  counted: boolean;
  /** Whether the partner still has its one 14-day trial number: on Free, with no trial yet, ever. */
  trialAvailable: boolean;
};

/**
 * The partner's standing, through app.partner_number_standing. The caller's
 * transaction must be scoped to one of the partner's businesses, or be an
 * operator on the partner's team.
 */
export async function loadPartnerNumberStanding(tx: DatabaseTransaction, partnerId: string): Promise<PartnerNumberStanding> {
  const [row] = (await tx.execute<{ held: number; included: number; paid_tier: boolean; counted: boolean; trial_available: boolean }>(sql`select held, included, paid_tier, counted, trial_available from app.partner_number_standing(${partnerId}::uuid)`)).rows;
  if (!row) throw new Error("The partner's numbers can't be read from this transaction.");
  return { held: Number(row.held), included: Number(row.included), paidTier: row.paid_tier, counted: row.counted, trialAvailable: row.trial_available };
}

/**
 * Why a partner's business on this deployment can't get a new number, as the
 * claim check in migration 0147 decides, or null when it can. A replacement
 * adds no number, so this doesn't apply to it.
 */
export function newPartnerNumberRefusal(standing: PartnerNumberStanding, deploymentMode: string): "partner_numbers_unavailable" | "partner_number_limit_reached" | null {
  // Without tier billing, nobody would pay for the number on the cloud, and a self-hosted server puts no tier limit on it.
  if (!standing.counted) return deploymentMode === "cloud" ? "partner_numbers_unavailable" : null;
  return standing.held >= standing.included && !standing.paidTier ? "partner_number_limit_reached" : null;
}

/**
 * Whether a partner's business on this deployment gets its partner's one
 * 14-day trial number instead of the new number its tier doesn't include: a
 * partner on Free that hasn't had its trial, on the cloud while the
 * deployment bills tiers, as the claim check in migration 0154 decides.
 */
export function partnerTrialOffered(standing: PartnerNumberStanding, deploymentMode: string): boolean {
  return standing.counted && deploymentMode === "cloud" && !standing.paidTier && standing.trialAvailable && newPartnerNumberRefusal(standing, deploymentMode) === "partner_number_limit_reached";
}

/**
 * Whether the business is a partner's demo nobody claimed yet. Such a demo
 * expires, so the partner's one trial number never goes to it: the trial
 * would be spent on a business nobody keeps. The claim check in migration
 * 0154 refuses the same.
 */
export async function unclaimedPartnerDemoInTransaction(tx: DatabaseTransaction, businessId: string): Promise<boolean> {
  const [demo] = await tx.select({ id: prospectDemos.id }).from(prospectDemos).where(and(eq(prospectDemos.businessId, businessId), ne(prospectDemos.status, "claimed"))).limit(1);
  return Boolean(demo);
}

/** Whether a partner's business can get a new number now, and if not, why. */
export type PartnerNumberAvailability = {
  available: boolean;
  /** Whether the number it can get is its partner's 14-day trial. */
  trial: boolean;
  /**
   * The claim's refusal when it can't get one, or null when it can. Only
   * `partner_number_limit_reached` goes away with a paid tier. The cloud
   * without tier billing refuses with `partner_numbers_unavailable`, and a
   * business whose owner hasn't finished onboarding with
   * `invalid_onboarding_stage`.
   */
  refusal: "partner_numbers_unavailable" | "partner_number_limit_reached" | "invalid_onboarding_stage" | null;
};

/**
 * Whether a partner's business can get a new number now, for the dashboard's
 * phone settings, which a partner's business reaches without the billing
 * capability, and whether that number is its partner's trial. The trial goes
 * only to a business that's live, so never to one paused with its partner's
 * other businesses, and never to a demo nobody claimed. A partner member
 * reaches the business before its owner finishes onboarding, when the claims
 * still refuse it a number. Null for a direct business, whose plan decides.
 * The number search and the claim check the same.
 */
export async function partnerNumberAvailabilityInTransaction(tx: DatabaseTransaction, businessId: string): Promise<PartnerNumberAvailability | null> {
  const [business] = await tx.select({ partnerId: businesses.partnerId, deploymentMode: businesses.deploymentMode, onboardingStage: businesses.onboardingStage }).from(businesses).where(eq(businesses.id, businessId)).limit(1);
  if (!business?.partnerId) return null;
  const standing = await loadPartnerNumberStanding(tx, business.partnerId);
  const refusal = newPartnerNumberRefusal(standing, business.deploymentMode);
  if (refusal === "partner_numbers_unavailable") return { available: false, trial: false, refusal };
  if (!NUMBER_CLAIM_STAGES.includes(normalizeOnboardingStage(business.onboardingStage))) return { available: false, trial: false, refusal: "invalid_onboarding_stage" };
  const trial = partnerTrialOffered(standing, business.deploymentMode) && (await loadEntitlement(tx, businessId)).live && !await unclaimedPartnerDemoInTransaction(tx, businessId);
  return trial || refusal === null ? { available: true, trial, refusal: null } : { available: false, trial: false, refusal };
}

/**
 * Records whether this deployment bills partners for tiers, from
 * partnerFeatures(...).tierBilling, so the number claims and the monthly
 * charges in the database follow the environment. The worker records it when
 * it starts and each time it settles numbers' months.
 */
export async function recordPartnerTierBilling(context: DomainContext, input: { enabled: boolean }): Promise<void> {
  await withBusinessTransaction(context.db, { actorType: "worker" }, async (tx) => {
    await tx.insert(partnerTierBilling).values({ id: 1, enabled: input.enabled, updatedAt: new Date() })
      .onConflictDoUpdate({ target: partnerTierBilling.id, set: { enabled: input.enabled, updatedAt: new Date() }, setWhere: sql`${partnerTierBilling.enabled} is distinct from ${input.enabled}` });
  });
}

/**
 * Whether a number bought for this business counts against a partner's tier,
 * so the host records what it pays for it: the business is a partner's, on a
 * deployment that bills tiers. Runs in the worker's transaction for the
 * business.
 */
export async function numberCountsForPartnerInTransaction(tx: DatabaseTransaction, businessId: string): Promise<boolean> {
  const [business] = await tx.select({ partnerId: businesses.partnerId }).from(businesses).where(eq(businesses.id, businessId)).limit(1);
  if (!business?.partnerId) return false;
  return (await loadPartnerNumberStanding(tx, business.partnerId)).counted;
}

/**
 * Records what the host pays each month for a number it just bought for a
 * partner's business, in the worker's transaction for that business. Its
 * months start now. Recording it again changes nothing.
 */
export async function recordPartnerNumberCostInTransaction(tx: DatabaseTransaction, input: { businessId: string; phoneNumberId: string; monthlyCostCents: number; startedAt?: Date }): Promise<void> {
  if (!Number.isSafeInteger(input.monthlyCostCents) || input.monthlyCostCents < 0) throw new Error("A number's monthly cost must be a whole number of cents.");
  const [business] = await tx.select({ partnerId: businesses.partnerId }).from(businesses).where(eq(businesses.id, input.businessId)).limit(1);
  if (!business?.partnerId) return;
  await tx.insert(partnerNumberCharges).values({
    partnerId: business.partnerId,
    businessId: input.businessId,
    phoneNumberId: input.phoneNumberId,
    monthlyCostCents: input.monthlyCostCents,
    startedAt: input.startedAt ?? new Date(),
  }).onConflictDoNothing({ target: partnerNumberCharges.phoneNumberId });
}

/** A month of a number past a paid tier's included ones, which the partner pays for. */
export type PartnerNumberCharge = {
  chargeId: string;
  partnerId: string;
  businessId: string;
  /** The month of the number, from 0 for the month it was bought. */
  month: number;
  periodStart: Date;
  amountCents: number;
  /** Polar's external id for the charge, so a retry is never charged twice. */
  idempotencyKey: string;
};

const SETTLE_BATCH = 100;
const SETTLE_ROUNDS = 10;

/** Polar refused some of a run's charges. The months they're for stay unsettled, so the next run reports them again. */
export class PartnerNumberChargeError extends Error {
  constructor(readonly failures: Array<{ charge: PartnerNumberCharge; error: unknown }>) {
    const first = failures[0]?.error;
    const partners = new Set(failures.map((failure) => failure.charge.partnerId)).size;
    super(`Couldn't report ${failures.length} partner number ${failures.length === 1 ? "charge" : "charges"} for ${partners} ${partners === 1 ? "partner" : "partners"}; the next run reports ${failures.length === 1 ? "it" : "them"} again. First error: ${first instanceof Error ? first.message : String(first)}`, { cause: first });
    this.name = "PartnerNumberChargeError";
  }
}

/**
 * Settles each due month of the numbers partners' businesses hold, oldest
 * first. It first records `tierBilling`, whether this deployment bills tiers:
 * without it no month is charged. A month the partner pays for goes to
 * `report`, which sends it to Polar, before the month counts as settled; a
 * month the tier covers just settles. A number no longer held settles no more
 * months, and one whose release is scheduled settles its months uncharged.
 * When `report` fails for a partner, that partner's charged months wait for
 * the next run while every other month still settles, and the run then
 * throws a PartnerNumberChargeError naming the failures. Two runs at once
 * settle each month once, and Polar takes each charge once by its key.
 */
export async function settlePartnerNumberCharges(
  context: DomainContext,
  input: { tierBilling: boolean; report: (charge: PartnerNumberCharge) => Promise<void>; now?: Date },
): Promise<{ settled: number; charged: number }> {
  await recordPartnerTierBilling(context, { enabled: input.tierBilling });
  const now = input.now ?? new Date();
  let settled = 0;
  let charged = 0;
  // Charges whose month waits for the next run, and the partners whose report failed in this one.
  const skipped: string[] = [];
  const failedPartners = new Set<string>();
  const failures: Array<{ charge: PartnerNumberCharge; error: unknown }> = [];
  for (let round = 0; round < SETTLE_ROUNDS; round += 1) {
    const due = await withBusinessTransaction(context.db, { actorType: "worker" }, async (tx) => (await tx.execute<{ charge_id: string; partner_id: string; business_id: string; month: number; period_start: Date | string; amount_cents: number; charged: boolean }>(sql`select charge_id, partner_id, business_id, month, period_start, amount_cents, charged from app.due_partner_number_charges(${now.toISOString()}::timestamptz, ${SETTLE_BATCH}::integer, ${`{${skipped.join(",")}}`}::uuid[])`)).rows);
    if (!due.length) break;
    for (const row of due) {
      const month = Number(row.month);
      if (row.charged) {
        // Polar refusing one of a partner's charges likely refuses the rest, so they wait too.
        if (failedPartners.has(row.partner_id)) {
          skipped.push(row.charge_id);
          continue;
        }
        const charge: PartnerNumberCharge = {
          chargeId: row.charge_id,
          partnerId: row.partner_id,
          businessId: row.business_id,
          month,
          periodStart: new Date(row.period_start),
          amountCents: Number(row.amount_cents),
          idempotencyKey: `partner-number:${row.charge_id}:${month}`,
        };
        try {
          await input.report(charge);
        } catch (error) {
          failures.push({ charge, error });
          failedPartners.add(row.partner_id);
          skipped.push(row.charge_id);
          continue;
        }
      }
      const updated = await withBusinessTransaction(context.db, { actorType: "worker" }, async (tx) => await tx.update(partnerNumberCharges)
        .set({ monthsSettled: sql`${partnerNumberCharges.monthsSettled} + 1`, ...(row.charged ? { monthsCharged: sql`${partnerNumberCharges.monthsCharged} + 1` } : {}), updatedAt: new Date() })
        .where(and(eq(partnerNumberCharges.id, row.charge_id), eq(partnerNumberCharges.monthsSettled, month)))
        .returning({ id: partnerNumberCharges.id }));
      if (!updated.length) continue;
      settled += 1;
      if (row.charged) charged += 1;
    }
  }
  if (failures.length) throw new PartnerNumberChargeError(failures);
  return { settled, charged };
}
