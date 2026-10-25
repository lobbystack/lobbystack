import { eq } from "drizzle-orm";

import { billingAccounts, businesses, type DatabaseTransaction } from "@lobbystack/db";
import { hasLiveEntitlement, isBillingPlanSlug, liveSubscriptionStates, planEntitlement, type BillingPlanSlug, type Entitlement } from "@lobbystack/shared";

export function effectiveBillingPlan(input: { deploymentMode: string; accountPlan: string | null; subscriptionState: string | null }): BillingPlanSlug {
  if (input.deploymentMode !== "cloud") return "self_host";
  const paidState = (liveSubscriptionStates as readonly (string | null)[]).includes(input.subscriptionState);
  if (isBillingPlanSlug(input.accountPlan) && (input.accountPlan === "free_cloud" || paidState)) return input.accountPlan;
  return "free_cloud";
}

/**
 * A business's entitlement, with the plan it comes from and the billing
 * interval. Usage metering records the plan and interval on each event, and
 * Polar sells and syncs by plan. Only usage metering reads this; everything
 * else asks loadEntitlement, the module's public interface.
 */
export type BusinessBilling = { plan: BillingPlanSlug; billingInterval: string | null; entitlement: Entitlement };

/**
 * Reads a direct business's plan the way usage limits enforce it: a self-hosted
 * server's businesses are unlimited, and a paid plan whose subscription ended
 * falls back to Free. Partner tiers and packages extend this later.
 */
export async function loadBusinessBilling(tx: DatabaseTransaction, businessId: string): Promise<BusinessBilling> {
  const [business, account] = await Promise.all([
    tx.select({ deploymentMode: businesses.deploymentMode }).from(businesses).where(eq(businesses.id, businessId)).limit(1).then((rows) => rows[0]),
    tx.select({ plan: billingAccounts.plan, subscriptionState: billingAccounts.subscriptionState, overageSpendingCapCents: billingAccounts.overageSpendingCapCents, billingInterval: billingAccounts.billingInterval }).from(billingAccounts).where(eq(billingAccounts.businessId, businessId)).limit(1).then((rows) => rows[0]),
  ]);
  const plan = effectiveBillingPlan({ deploymentMode: business?.deploymentMode ?? "cloud", accountPlan: account?.plan ?? null, subscriptionState: account?.subscriptionState ?? null });
  return {
    plan,
    billingInterval: account?.billingInterval ?? null,
    entitlement: planEntitlement(plan, { live: hasLiveEntitlement(account), capMinor: account?.overageSpendingCapCents ?? null }),
  };
}

/** What the business may use right now. Its `live` is hasLiveEntitlement of the business's billing account. */
export async function loadEntitlement(tx: DatabaseTransaction, businessId: string): Promise<Entitlement> {
  return (await loadBusinessBilling(tx, businessId)).entitlement;
}
