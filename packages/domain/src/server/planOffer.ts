import { and, desc, eq, exists, isNotNull, isNull, or, sql } from "drizzle-orm";

import { billingAccounts, businesses, calls, transcripts, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";
import { DASHBOARD_TEST_CALL_WIDGET_ID } from "@lobbystack/shared";

import { billingAccess } from "./billingAccess";
import type { DomainContext } from "./context";
import { loadBillingContext } from "./usage";

/** After the plans show, a newer completed test brings them back no sooner than this. */
export const PLAN_OFFER_COOLDOWN_MS = 3 * 24 * 60 * 60_000;

/** Three dismissals in a row earn a longer pause; a fourth asks after this. */
export const PLAN_OFFER_DISMISSAL_PAUSE_MS = 30 * 24 * 60 * 60_000;
export const PLAN_OFFER_DISMISSALS_BEFORE_PAUSE = 3;

/**
 * Whether the plans should show: a test completed, and either they never
 * showed, or they showed over the cooldown ago and the operator has tested
 * again since. An idle account never sees them twice.
 */
export function planOfferDue(input: { completedTestAt: Date | null; shownAt: Date | null; dismissals?: number; now: Date }): boolean {
  const { completedTestAt, shownAt, now } = input;
  if (!completedTestAt) return false;
  if (!shownAt) return true;
  const cooldown = (input.dismissals ?? 0) >= PLAN_OFFER_DISMISSALS_BEFORE_PAUSE ? PLAN_OFFER_DISMISSAL_PAUSE_MS : PLAN_OFFER_COOLDOWN_MS;
  return now.getTime() - shownAt.getTime() >= cooldown && completedTestAt.getTime() > shownAt.getTime();
}

/**
 * The end of the operator's latest test that worked: their own browser test
 * call, a call to their business number, or a test chat that got a reply. A
 * call that failed or went silent has no line, and a visitor's widget call
 * isn't the operator testing.
 */
export async function latestCompletedTestAt(tx: DatabaseTransaction, businessId: string): Promise<Date | null> {
  const [call] = await tx.select({ endedAt: calls.endedAt }).from(calls).where(and(
    eq(calls.businessId, businessId),
    isNull(calls.prospectDemoId),
    // The dashboard's test call, or a call to the business's own number. A
    // visitor's widget call belongs to the site, not the operator's test.
    or(eq(calls.widgetId, DASHBOARD_TEST_CALL_WIDGET_ID), isNull(calls.widgetId)),
    isNotNull(calls.endedAt),
    exists(tx.select({ id: transcripts.id }).from(transcripts).where(and(eq(transcripts.callId, calls.id), sql`length(trim(${transcripts.text})) > 0`))),
  )).orderBy(desc(calls.endedAt)).limit(1);
  const [business] = await tx.select({ lastTestChatAt: businesses.lastTestChatAt }).from(businesses).where(eq(businesses.id, businessId)).limit(1);
  const dates = [call?.endedAt, business?.lastTestChatAt].filter((date): date is Date => Boolean(date));
  return dates.length ? new Date(Math.max(...dates.map((date) => date.getTime()))) : null;
}

/**
 * Whether to show this person the plans now. Only someone who can buy sees
 * them: a business of the host's own on the free plan, and a person checkout
 * is open to. A partner's business pays its partner, and a self-hosted one has
 * nothing to buy.
 */
export async function readPlanOfferInTransaction(tx: DatabaseTransaction, input: { businessId: string; role: string; canCheckOut: boolean; now?: Date }): Promise<boolean> {
  if (!input.canCheckOut) return false;
  const [business] = await tx.select({ partnerId: businesses.partnerId, deploymentMode: businesses.deploymentMode, shownAt: businesses.planOfferShownAt, dismissals: businesses.planOfferDismissals }).from(businesses).where(eq(businesses.id, input.businessId)).limit(1);
  if (!business || business.partnerId || business.deploymentMode !== "cloud") return false;
  const [account] = await tx.select({ source: billingAccounts.source, customerId: billingAccounts.customerId, subscriptionId: billingAccounts.subscriptionId, plan: billingAccounts.plan, subscriptionState: billingAccounts.subscriptionState }).from(billingAccounts).where(eq(billingAccounts.businessId, input.businessId)).limit(1);
  if (!billingAccess(input.role, account ?? null, true).hasCheckoutAccess) return false;
  const { plan } = await loadBillingContext(tx, input.businessId);
  if (plan !== "free_cloud") return false;
  return planOfferDue({ completedTestAt: await latestCompletedTestAt(tx, input.businessId), shownAt: business.shownAt, dismissals: business.dismissals, now: input.now ?? new Date() });
}

/** Starts the wait before the plans can show again. */
export async function markPlanOfferShownInTransaction(tx: DatabaseTransaction, businessId: string): Promise<void> {
  await tx.update(businesses).set({ planOfferShownAt: new Date() }).where(eq(businesses.id, businessId));
}

/** Closed without a choice: counts toward the longer pause after three in a row. */
export async function markPlanOfferDismissedInTransaction(tx: DatabaseTransaction, businessId: string): Promise<void> {
  await tx.update(businesses).set({ planOfferShownAt: new Date(), planOfferDismissals: sql`${businesses.planOfferDismissals} + 1` }).where(eq(businesses.id, businessId));
}

/** A test chat keeps no conversation, so this is what proves one got a reply. */
export async function recordTestChatReply(context: DomainContext, input: { businessId: string }): Promise<void> {
  await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    await tx.update(businesses).set({ lastTestChatAt: new Date() }).where(eq(businesses.id, input.businessId));
  });
}
