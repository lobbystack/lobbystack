import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

import { billingAccounts, businessNumberCharges, enqueueOutbox, phoneNumbers, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";
import { hasLiveEntitlement } from "@lobbystack/shared";

import type { DomainContext } from "./context";
import { NUMBER_RELEASE_GRACE_DAYS } from "./numberTrials";
import { isLivePolarSubscriptionState } from "./polarSubscriptions";

// The extra numbers add-on (migration 0217): a monthly Polar subscription of
// its own, beside the plan's, whose only price is metered on
// billing.extra_numbers. It bills each month of each extra number whatever the
// plan's interval. Its webhooks land here instead of on the plan, and the plan
// starting or ending asks the worker to keep the add-on in step: canceled at
// the end of its period while the plan isn't live, renewing while it is.

/** The reclaim reason of an extra number whose add-on ended while the plan stayed live. */
export const EXTRA_NUMBERS_ENDED_REASON = "extra_numbers_ended";

/** What a Polar event says about the business's add-on subscription. */
export type ExtraNumbersSubscriptionSnapshot = {
  subscriptionId: string;
  state: string | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  modifiedAt: Date | null;
};

/** The worker job that keeps the add-on canceled or renewing as the plan is. */
export async function enqueueExtraNumbersSubscriptionSync(tx: DatabaseTransaction, businessId: string, reason: string): Promise<void> {
  await enqueueOutbox(tx, { topic: "billing.syncExtraNumbersSubscription", businessId, aggregateType: "billing_account", aggregateId: businessId, dedupeKey: `extra-numbers-subscription:${businessId}:${reason}:${Date.now()}`, payload: {} });
}

/**
 * Applies a Polar snapshot of the business's add-on. A snapshot older than
 * the one stored changes nothing, and one about another add-on subscription
 * replaces the stored one only when it's live, so a late cancellation of an
 * old add-on can't end the new one. When the add-on stops billing while the
 * plan is live, the extra numbers are released 30 days later unless it bills
 * again by then. Returns whether the account changed.
 */
export async function applyExtraNumbersSubscriptionInTransaction(tx: DatabaseTransaction, input: { businessId: string; billingKey: string; customerId?: string | undefined; snapshot: ExtraNumbersSubscriptionSnapshot; now?: Date }): Promise<boolean> {
  const now = input.now ?? new Date();
  const [existing] = await tx.select({
    plan: billingAccounts.plan,
    subscriptionState: billingAccounts.subscriptionState,
    customerId: billingAccounts.customerId,
    subscriptionId: billingAccounts.extraNumbersSubscriptionId,
    state: billingAccounts.extraNumbersSubscriptionState,
    modifiedAt: billingAccounts.extraNumbersModifiedAt,
  }).from(billingAccounts).where(eq(billingAccounts.businessId, input.businessId)).limit(1);
  const { snapshot } = input;
  const sameSubscription = existing?.subscriptionId === snapshot.subscriptionId;
  const live = isLivePolarSubscriptionState(snapshot.state);
  if (existing?.subscriptionId && !sameSubscription && !live) return false;
  if (sameSubscription && existing?.modifiedAt && snapshot.modifiedAt && snapshot.modifiedAt < existing.modifiedAt) return false;
  const fields = {
    extraNumbersSubscriptionId: snapshot.subscriptionId,
    extraNumbersSubscriptionState: snapshot.state,
    extraNumbersCurrentPeriodEnd: snapshot.currentPeriodEnd,
    extraNumbersCancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
    extraNumbersModifiedAt: snapshot.modifiedAt ?? now,
  };
  await tx.insert(billingAccounts).values({ businessId: input.businessId, billingKey: input.billingKey, ...(input.customerId ? { customerId: input.customerId } : {}), ...fields })
    .onConflictDoUpdate({ target: billingAccounts.businessId, set: { ...fields, ...(input.customerId && !existing?.customerId ? { customerId: input.customerId } : {}), updatedAt: now } });
  const wasLive = Boolean(existing?.subscriptionId) && isLivePolarSubscriptionState(existing?.state);
  const planLive = hasLiveEntitlement(existing ? { plan: existing.plan, subscriptionState: existing.subscriptionState } : null);
  if (live && !wasLive) {
    // The add-on bills again, so numbers its end would have released stay.
    await tx.update(phoneNumbers).set({ reclaimScheduledAt: null, reclaimReason: null, updatedAt: now })
      .where(and(eq(phoneNumbers.businessId, input.businessId), eq(phoneNumbers.status, "active"), eq(phoneNumbers.reclaimReason, EXTRA_NUMBERS_ENDED_REASON)));
    // An add-on bought while the plan isn't live would bill nothing, so it's canceled with the plan.
    if (!planLive) await enqueueExtraNumbersSubscriptionSync(tx, input.businessId, "started");
  } else if (wasLive && !live && planLive) {
    await scheduleExtraNumberReleaseInTransaction(tx, { businessId: input.businessId, now });
  }
  await enqueueOutbox(tx, { topic: "realtime.publish", businessId: input.businessId, aggregateType: "billing_account", aggregateId: input.businessId, dedupeKey: `billing:${input.businessId}:extra-numbers:${snapshot.subscriptionId}:${fields.extraNumbersModifiedAt.toISOString()}`, payload: { type: "billing.updated", entityId: input.businessId } });
  return true;
}

/**
 * The add-on stopped billing while the plan is live: each extra number the
 * business holds, every bought number but its oldest, is released 30 days
 * from now, unless the add-on bills again first.
 */
async function scheduleExtraNumberReleaseInTransaction(tx: DatabaseTransaction, input: { businessId: string; now: Date }): Promise<void> {
  const held = await tx.select({ id: phoneNumbers.id }).from(phoneNumbers)
    .where(and(eq(phoneNumbers.businessId, input.businessId), inArray(phoneNumbers.status, ["active", "provisioning"]), isNull(phoneNumbers.reclaimScheduledAt)))
    .orderBy(asc(phoneNumbers.createdAt), asc(phoneNumbers.id));
  const bought = new Set((await tx.select({ id: businessNumberCharges.phoneNumberId }).from(businessNumberCharges).where(eq(businessNumberCharges.businessId, input.businessId))).map((row) => row.id));
  const extra = held.slice(1).filter((number) => bought.has(number.id)).map((number) => number.id);
  if (!extra.length) return;
  await tx.update(phoneNumbers)
    .set({ reclaimScheduledAt: new Date(input.now.getTime() + NUMBER_RELEASE_GRACE_DAYS * 86_400_000), reclaimReason: EXTRA_NUMBERS_ENDED_REASON, updatedAt: input.now })
    .where(and(eq(phoneNumbers.businessId, input.businessId), eq(phoneNumbers.status, "active"), isNull(phoneNumbers.reclaimScheduledAt), inArray(phoneNumbers.id, extra)));
}

/** Whether the business's add-on bills now. */
export async function extraNumbersSubscriptionLiveInTransaction(tx: DatabaseTransaction, businessId: string): Promise<boolean> {
  const result = await tx.execute<{ live: boolean }>(sql`select app.extra_numbers_subscription_live(${businessId}::uuid) as live`);
  return result.rows[0]?.live === true;
}

/**
 * What the worker should ask Polar for the business's add-on: to cancel it at
 * the end of its period while the plan isn't live, or to keep it renewing
 * while it is. Null when there's nothing to change: no live add-on, or one
 * already as it should be.
 */
export async function extraNumbersSubscriptionChange(context: DomainContext, input: { businessId: string }): Promise<{ subscriptionId: string; cancelAtPeriodEnd: boolean } | null> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const [account] = await tx.select({
      plan: billingAccounts.plan,
      subscriptionState: billingAccounts.subscriptionState,
      subscriptionId: billingAccounts.extraNumbersSubscriptionId,
      state: billingAccounts.extraNumbersSubscriptionState,
      cancelAtPeriodEnd: billingAccounts.extraNumbersCancelAtPeriodEnd,
    }).from(billingAccounts).where(eq(billingAccounts.businessId, input.businessId)).limit(1);
    if (!account?.subscriptionId || !isLivePolarSubscriptionState(account.state)) return null;
    const cancelAtPeriodEnd = !hasLiveEntitlement({ plan: account.plan, subscriptionState: account.subscriptionState });
    if (cancelAtPeriodEnd === account.cancelAtPeriodEnd) return null;
    return { subscriptionId: account.subscriptionId, cancelAtPeriodEnd };
  });
}
