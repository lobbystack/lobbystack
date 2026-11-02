import { and, desc, eq, exists, isNotNull, isNull, sql } from "drizzle-orm";

import { billingAccounts, businesses, calls, transcripts, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";
import { DASHBOARD_TEST_CALL_WIDGET_ID } from "@lobbystack/shared";

import { billingAccess } from "./billingAccess";
import type { DomainContext } from "./context";
import { loadBillingContext } from "./usage";

/** After the plans show, a newer completed test brings them back no sooner than this. */
export const PLAN_OFFER_COOLDOWN_MS = 7 * 24 * 60 * 60_000;

/**
 * Whether the plans should show: a test completed, and either they never
 * showed, or they showed over a week ago and the operator has tested again
 * since. An idle account never sees them twice.
 */
export function planOfferDue(input: { completedTestAt: Date | null; shownAt: Date | null; now: Date }): boolean {
  const { completedTestAt, shownAt, now } = input;
  if (!completedTestAt) return false;
  if (!shownAt) return true;
  return now.getTime() - shownAt.getTime() >= PLAN_OFFER_COOLDOWN_MS && completedTestAt.getTime() > shownAt.getTime();
}

/**
 * The end of the operator's latest test that worked: a browser call with a
 * line of transcript from either side, or a test chat that got a reply. A call
 * that failed or went silent has no line.
 */
export async function latestCompletedTestAt(tx: DatabaseTransaction, businessId: string): Promise<Date | null> {
  const [call] = await tx.select({ endedAt: calls.endedAt }).from(calls).where(and(
    eq(calls.businessId, businessId),
    eq(calls.transport, "web_voice"),
    eq(calls.widgetId, DASHBOARD_TEST_CALL_WIDGET_ID),
    isNull(calls.prospectDemoId),
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
  const [business] = await tx.select({ partnerId: businesses.partnerId, deploymentMode: businesses.deploymentMode, shownAt: businesses.planOfferShownAt }).from(businesses).where(eq(businesses.id, input.businessId)).limit(1);
  if (!business || business.partnerId || business.deploymentMode !== "cloud") return false;
  const [account] = await tx.select({ source: billingAccounts.source, customerId: billingAccounts.customerId, subscriptionId: billingAccounts.subscriptionId, plan: billingAccounts.plan, subscriptionState: billingAccounts.subscriptionState }).from(billingAccounts).where(eq(billingAccounts.businessId, input.businessId)).limit(1);
  if (!billingAccess(input.role, account ?? null, true).hasCheckoutAccess) return false;
  const { plan } = await loadBillingContext(tx, input.businessId);
  if (plan !== "free_cloud") return false;
  return planOfferDue({ completedTestAt: await latestCompletedTestAt(tx, input.businessId), shownAt: business.shownAt, now: input.now ?? new Date() });
}

/** Starts the wait before the plans can show again. */
export async function markPlanOfferShownInTransaction(tx: DatabaseTransaction, businessId: string): Promise<void> {
  await tx.update(businesses).set({ planOfferShownAt: new Date() }).where(eq(businesses.id, businessId));
}

/** A test chat keeps no conversation, so this is what proves one got a reply. */
export async function recordTestChatReply(context: DomainContext, input: { businessId: string }): Promise<void> {
  await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    await tx.update(businesses).set({ lastTestChatAt: new Date() }).where(eq(businesses.id, input.businessId));
  });
}
