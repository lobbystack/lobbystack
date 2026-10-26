import { and, eq, isNotNull, sql } from "drizzle-orm";

import { billingAccounts, billingUsageEvents, partnerPackages, partnerStripeAccounts, withBusinessTransaction, type DatabaseTransaction, type StripeOverageItems } from "@lobbystack/db";
import type { OverageMeter } from "@lobbystack/providers";

import type { DomainContext } from "./context";
import { lockBusinessBillingAccount } from "./packageBilling";
import type { RecordedUsageTerms } from "./usage";

// A business's overage on its package, reported to its partner's Stripe as
// meter events on the partner's connected account (ADR 0009). Usage metering
// records on each final event what the event put past the business's
// allowance and what that costs at the rates it recorded, and marks the
// event's stripe_sync_status pending while that differs from what Stripe was
// sent. The usage sync job then sends Stripe the difference, beside the
// pool's overage to Polar, which keeps its own sync_status.
//
// A report goes out exactly once. Before asking Stripe, the job writes the
// amount it's about to send and counts the report, which numbers the
// report's identifier: the event's source key, then source key:2 and so on
// for later corrections. A retry sends the same amount under the same
// identifier, which Stripe counts once, and Stripe's answer moves the amount
// to what the event reported.

export type BusinessOverageSyncOutcome =
  /** Stripe has all the event's business overage. */
  | "synced"
  /** No subscription of the business can bill it: it has none on its partner's account, or it ended. */
  | "skipped"
  /** The event has no business overage to report, or isn't final yet. */
  | "none";

// Overage carries fractions of the smallest unit, so comparing allows for float error.
const EPSILON = 1e-9;

// A subscription Stripe will never invoice again.
const ENDED_SUBSCRIPTION_STATES = new Set(["canceled", "incomplete_expired"]);

/** The identifier of an event's nth report to the partner's Stripe: its source key, and the report's number after the first. */
export function overageReportIdentifier(sourceKey: string, report: number): string {
  return report <= 1 ? sourceKey : `${sourceKey}:${report}`;
}

function meterOf(usageKind: string): OverageMeter | null {
  if (usageKind === "voice_seconds") return "voice";
  if (usageKind === "chat_ai_tokens") return "chat";
  return null;
}

/** A report to send: the amount, the report's number, and where it goes. */
type Report = {
  eventId: string;
  identifier: string;
  report: number;
  amountMinor: number;
  meter: OverageMeter;
  currency: string;
  accountId: string;
  customerId: string;
  subscriptionId: string;
  /** The subscription's item for the meter, when the business's billing account already knows it. */
  itemId: string | null;
};

type Claim = { kind: "send"; report: Report } | { kind: Exclude<BusinessOverageSyncOutcome, "synced"> } | { kind: "synced" };

/**
 * Decides the event's next report, and writes it down before anything asks
 * Stripe: a report already out goes again as it was, and otherwise the
 * difference between the event's overage and what Stripe was sent. An event
 * whose business has no subscription to bill it is skipped. The transaction
 * is the worker's, scoped to the business.
 */
async function claimReportInTransaction(tx: DatabaseTransaction, input: { businessId: string; usageEventId: string }): Promise<Claim> {
  const [event] = await tx.select({
    id: billingUsageEvents.id,
    sourceKey: billingUsageEvents.sourceKey,
    usageKind: billingUsageEvents.usageKind,
    isFinal: billingUsageEvents.isFinal,
    termsAtRecordTime: billingUsageEvents.termsAtRecordTime,
    overageMinor: billingUsageEvents.businessOverageMinor,
    status: billingUsageEvents.stripeSyncStatus,
    reportedMinor: billingUsageEvents.stripeOverageReportedMinor,
    sendingMinor: billingUsageEvents.stripeOverageSendingMinor,
    reports: billingUsageEvents.stripeOverageReports,
  }).from(billingUsageEvents).where(and(eq(billingUsageEvents.id, input.usageEventId), eq(billingUsageEvents.businessId, input.businessId))).limit(1).for("update");
  if (!event || event.status !== "pending") return { kind: event?.status === "synced" ? "synced" : event?.status === "skipped" ? "skipped" : "none" };
  const meter = meterOf(event.usageKind);
  if (!event.isFinal || !meter) return { kind: "none" };
  const currency = (event.termsAtRecordTime as Partial<RecordedUsageTerms> | null)?.overage?.currency?.toUpperCase() ?? null;
  const [account] = await tx.select({ packageId: billingAccounts.packageId, accountId: billingAccounts.stripeAccountId, customerId: billingAccounts.stripeCustomerId, subscriptionId: billingAccounts.stripeSubscriptionId, state: billingAccounts.stripeSubscriptionState, items: billingAccounts.stripeOverageItems })
    .from(billingAccounts).where(eq(billingAccounts.businessId, input.businessId)).limit(1);
  const [pkg] = account?.packageId ? await tx.select({ currency: partnerPackages.currency }).from(partnerPackages).where(eq(partnerPackages.id, account.packageId)).limit(1) : [];
  const [partnerAccount] = await tx.select({ accountId: partnerStripeAccounts.stripeAccountId, disconnectedAt: partnerStripeAccounts.disconnectedAt }).from(partnerStripeAccounts).where(sql`${partnerStripeAccounts.partnerId} = app.business_partner(${input.businessId}::uuid)`).limit(1);
  const target = account?.accountId && account.customerId && account.subscriptionId && currency
    && !ENDED_SUBSCRIPTION_STATES.has(account.state ?? "")
    && pkg?.currency.toUpperCase() === currency
    && partnerAccount && !partnerAccount.disconnectedAt && partnerAccount.accountId === account.accountId
    ? { accountId: account.accountId, customerId: account.customerId, subscriptionId: account.subscriptionId, currency, items: account.items }
    : null;
  const report = (amountMinor: number, number: number, to: NonNullable<typeof target>): Claim => ({
    kind: "send",
    report: { eventId: event.id, identifier: overageReportIdentifier(event.sourceKey, number), report: number, amountMinor, meter, currency: to.currency, accountId: to.accountId, customerId: to.customerId, subscriptionId: to.subscriptionId, itemId: to.items?.subscriptionId === to.subscriptionId ? to.items[meter] ?? null : null },
  });
  // A report that went out but never heard back goes again, unchanged, so Stripe counts it once.
  if (event.sendingMinor !== null) {
    if (target) return report(event.sendingMinor, event.reports, target);
    // Nothing can bill it any more, so whatever Stripe counted of it stays as it is.
    await tx.update(billingUsageEvents).set({ stripeSyncStatus: "skipped", stripeOverageSendingMinor: null, updatedAt: new Date() }).where(eq(billingUsageEvents.id, event.id));
    return { kind: "skipped" };
  }
  const amountMinor = (event.overageMinor ?? event.reportedMinor) - event.reportedMinor;
  if (Math.abs(amountMinor) <= EPSILON) {
    const status = event.reports > 0 ? "synced" : null;
    await tx.update(billingUsageEvents).set({ stripeSyncStatus: status, updatedAt: new Date() }).where(eq(billingUsageEvents.id, event.id));
    return { kind: status ?? "none" };
  }
  if (!target) {
    await tx.update(billingUsageEvents).set({ stripeSyncStatus: "skipped", updatedAt: new Date() }).where(eq(billingUsageEvents.id, event.id));
    return { kind: "skipped" };
  }
  await tx.update(billingUsageEvents).set({ stripeOverageSendingMinor: amountMinor, stripeOverageReports: event.reports + 1, updatedAt: new Date() }).where(eq(billingUsageEvents.id, event.id));
  return report(amountMinor, event.reports + 1, target);
}

/**
 * Records that Stripe has the report: its amount moves to what the event
 * reported, and the event is synced unless a correction moved its overage
 * meanwhile. Returns whether it's synced, or null when another run recorded
 * it first.
 */
async function settleReportInTransaction(tx: DatabaseTransaction, input: { businessId: string; report: Report }): Promise<boolean | null> {
  const [settled] = await tx.update(billingUsageEvents).set({
    stripeOverageReportedMinor: sql`${billingUsageEvents.stripeOverageReportedMinor} + ${billingUsageEvents.stripeOverageSendingMinor}`,
    stripeOverageSendingMinor: null,
    stripeSyncStatus: sql`case when abs(coalesce(${billingUsageEvents.businessOverageMinor}, ${billingUsageEvents.stripeOverageReportedMinor} + ${billingUsageEvents.stripeOverageSendingMinor}) - (${billingUsageEvents.stripeOverageReportedMinor} + ${billingUsageEvents.stripeOverageSendingMinor})) <= ${EPSILON} then 'synced' else 'pending' end`,
    updatedAt: new Date(),
  }).where(and(
    eq(billingUsageEvents.id, input.report.eventId),
    eq(billingUsageEvents.businessId, input.businessId),
    eq(billingUsageEvents.stripeOverageReports, input.report.report),
    isNotNull(billingUsageEvents.stripeOverageSendingMinor),
  )).returning({ status: billingUsageEvents.stripeSyncStatus });
  return settled ? settled.status === "synced" : null;
}

/**
 * Keeps the subscription's item for the meter on the business's billing
 * account, so later reports go straight to the meter. The items name their
 * subscription, so a new subscription starts over. The database lets only
 * the worker and the system actor write them. The transaction is the
 * worker's, scoped to the business.
 */
async function rememberOverageItemInTransaction(tx: DatabaseTransaction, input: { businessId: string; subscriptionId: string; meter: OverageMeter; itemId: string }): Promise<void> {
  await lockBusinessBillingAccount(tx, input.businessId);
  const [account] = await tx.select({ subscriptionId: billingAccounts.stripeSubscriptionId, items: billingAccounts.stripeOverageItems }).from(billingAccounts).where(eq(billingAccounts.businessId, input.businessId)).limit(1);
  if (account?.subscriptionId !== input.subscriptionId) return;
  const kept = account.items?.subscriptionId === input.subscriptionId ? account.items : { subscriptionId: input.subscriptionId };
  const items: StripeOverageItems = { ...kept, [input.meter]: input.itemId };
  await tx.update(billingAccounts).set({ stripeOverageItems: items, updatedAt: new Date() }).where(eq(billingAccounts.businessId, input.businessId));
}

/**
 * Sends the partner's Stripe what one usage event put past its business's
 * allowance since the event's last report, as a meter event on the
 * partner's connected account for the business's customer. The first report
 * of each kind of overage adds the meter's price to the business's
 * subscription. Stripe not answering throws, so the job retries and sends
 * the same report again. Without Stripe Connect there's nothing to report.
 */
export async function syncBusinessOverage(context: DomainContext, input: { businessId: string; usageEventId: string }): Promise<BusinessOverageSyncOutcome> {
  const stripe = context.stripeConnect;
  if (!stripe) return "none";
  const worker = { businessId: input.businessId, actorType: "worker" as const };
  let outcome: BusinessOverageSyncOutcome = "none";
  // A correction that lands while a report is out leaves more to send, which the next round sends.
  for (let round = 0; round < 3; round++) {
    const claim = await withBusinessTransaction(context.db, worker, async (tx) => await claimReportInTransaction(tx, input));
    if (claim.kind !== "send") return claim.kind === "none" ? outcome : claim.kind;
    const { report } = claim;
    if (!report.itemId) {
      const { subscriptionItemId } = await stripe.addOverageToSubscription(report.accountId, { subscriptionId: report.subscriptionId, meter: report.meter, currency: report.currency });
      await withBusinessTransaction(context.db, worker, async (tx) => await rememberOverageItemInTransaction(tx, { businessId: input.businessId, subscriptionId: report.subscriptionId, meter: report.meter, itemId: subscriptionItemId }));
    }
    await stripe.reportOverage(report.accountId, { identifier: report.identifier, customerId: report.customerId, meter: report.meter, amountMinor: report.amountMinor, currency: report.currency });
    outcome = "synced";
    if (await withBusinessTransaction(context.db, worker, async (tx) => await settleReportInTransaction(tx, { businessId: input.businessId, report }))) return "synced";
  }
  return outcome;
}
