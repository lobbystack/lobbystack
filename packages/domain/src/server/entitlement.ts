import { eq } from "drizzle-orm";

import { billingAccounts, businesses, inOrder, partnerPackages, type DatabaseTransaction } from "@lobbystack/db";
import { billedOutsideEntitlement, hasLiveEntitlement, hasLivePackageSubscription, isBillingPlanSlug, liveSubscriptionStates, packageEntitlement, partnerFeatures, planEntitlement, type BillingPlanSlug, type Entitlement } from "@lobbystack/shared";

import { partnerBusinessAnswersInTransaction } from "./partnerLifecycle";

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

/** The billing account fields a partner's business's entitlement reads. */
type PartnerBusinessAccount = {
  packageId: string | null;
  stripeSubscriptionState: string | null;
  overageEnabled: boolean;
  overageCurrency: string | null;
  overageVoiceMinuteRateMinor: number;
  overageChatRateMinor: number;
  overageCapMinor: number | null;
};

/**
 * A partner's business's entitlement: its package's while it has one, live
 * while the package's Stripe subscription is, or billed outside LobbyStack
 * when it has none or the deployment has no Stripe Connect. A live business
 * on a package also gets the overage its partner set for it. A package the
 * transaction can't read gives no allowance rather than none's limits. While
 * the partner's businesses are paused, 30 days after its tier ended or a
 * payment failed, none of them is live, and they get no allowance.
 */
async function partnerBusinessEntitlement(tx: DatabaseTransaction, businessId: string, partnerId: string, account: PartnerBusinessAccount | undefined): Promise<Entitlement> {
  const answering = await partnerBusinessAnswersInTransaction(tx, businessId);
  if (!account?.packageId || !partnerFeatures(process.env).stripeConnect) return billedOutsideEntitlement(partnerId, { live: answering });
  const [terms] = await tx.select({ currency: partnerPackages.currency, voiceMinutes: partnerPackages.voiceMinutes, chats: partnerPackages.chats }).from(partnerPackages).where(eq(partnerPackages.id, account.packageId)).limit(1);
  return packageEntitlement(partnerId, terms ?? { currency: "USD", voiceMinutes: 0, chats: 0 }, {
    live: answering && Boolean(terms) && hasLivePackageSubscription(account.stripeSubscriptionState),
    overage: { enabled: account.overageEnabled, currency: account.overageCurrency, voiceMinuteRateMinor: account.overageVoiceMinuteRateMinor, chatRateMinor: account.overageChatRateMinor, capMinor: account.overageCapMinor },
  });
}

/**
 * Reads a business's plan the way usage limits enforce it: a self-hosted
 * server's businesses are unlimited, and a paid plan whose subscription ended
 * falls back to Free. A partner's business pays its partner, never the host:
 * its usage counts under the plan the host doesn't bill, which syncs nothing
 * to Polar and keeps content as long as paid plans do, against its package's
 * allowance and the overage its partner set, or with no limit when it's
 * billed outside LobbyStack, and with none while its partner's businesses are
 * paused.
 */
export async function loadBusinessBilling(tx: DatabaseTransaction, businessId: string): Promise<BusinessBilling> {
  const [business, account] = await inOrder([
    () => tx.select({ deploymentMode: businesses.deploymentMode, partnerId: businesses.partnerId }).from(businesses).where(eq(businesses.id, businessId)).limit(1).then((rows) => rows[0]),
    () => tx.select({ plan: billingAccounts.plan, subscriptionState: billingAccounts.subscriptionState, overageSpendingCapCents: billingAccounts.overageSpendingCapCents, billingInterval: billingAccounts.billingInterval, packageId: billingAccounts.packageId, stripeSubscriptionState: billingAccounts.stripeSubscriptionState, overageEnabled: billingAccounts.overageEnabled, overageCurrency: billingAccounts.overageCurrency, overageVoiceMinuteRateMinor: billingAccounts.overageVoiceMinuteRateMinor, overageChatRateMinor: billingAccounts.overageChatRateMinor, overageCapMinor: billingAccounts.overageCapMinor }).from(billingAccounts).where(eq(billingAccounts.businessId, businessId)).limit(1).then((rows) => rows[0]),
  ]);
  if (business?.partnerId) return { plan: "self_host", billingInterval: null, entitlement: await partnerBusinessEntitlement(tx, businessId, business.partnerId, account) };
  const plan = effectiveBillingPlan({ deploymentMode: business?.deploymentMode ?? "cloud", accountPlan: account?.plan ?? null, subscriptionState: account?.subscriptionState ?? null });
  return {
    plan,
    billingInterval: account?.billingInterval ?? null,
    entitlement: planEntitlement(plan, { live: hasLiveEntitlement(account), capMinor: account?.overageSpendingCapCents ?? null }),
  };
}

/**
 * What the business may use right now. For a direct business, its `live` is
 * hasLiveEntitlement of its billing account; a partner's business is live
 * while it's billed outside LobbyStack or its package's Stripe subscription
 * is live, and its partner's businesses aren't paused. app.has_live_entitlement
 * says the same in SQL, except on a deployment without Stripe Connect, whose
 * configuration SQL can't read.
 */
export async function loadEntitlement(tx: DatabaseTransaction, businessId: string): Promise<Entitlement> {
  return (await loadBusinessBilling(tx, businessId)).entitlement;
}
