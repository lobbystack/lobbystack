import { isWidgetKeyIssuanceEnabled, type HostedCheckoutPlanIntervals } from "@lobbystack/shared";
import { NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";

import { billingAccounts, billingTransactions, billingUsageEvents, billingUsageMonths } from "@lobbystack/db";
import { billingAccess, getKnowledgeStorageUsageBytes, loadBillingContext, scheduledSubscriptionEndInTransaction, setOverageSpendingCap } from "@lobbystack/domain";
import { jsonError } from "@/lib/api-helpers";
import { operatorRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

export const GET = operatorRoute(async ({ businessId, transaction }) => NextResponse.json(await transaction(async (tx, role) => {
  const periodKey = new Date().toISOString().slice(0, 7);
  const account = await tx.select({ source: billingAccounts.source, customerId: billingAccounts.customerId, subscriptionId: billingAccounts.subscriptionId, plan: billingAccounts.plan, billingKey: billingAccounts.billingKey, billingInterval: billingAccounts.billingInterval, subscriptionState: billingAccounts.subscriptionState, currentPeriodStart: billingAccounts.currentPeriodStart, currentPeriodEnd: billingAccounts.currentPeriodEnd, overageSpendingCapCents: billingAccounts.overageSpendingCapCents }).from(billingAccounts).where(eq(billingAccounts.businessId, businessId)).limit(1);
  const usage = await tx.select({ periodKey: billingUsageEvents.periodKey, usageKind: billingUsageEvents.usageKind, quantity: billingUsageEvents.quantity, isFinal: billingUsageEvents.isFinal, syncStatus: billingUsageEvents.syncStatus }).from(billingUsageEvents).where(and(eq(billingUsageEvents.businessId, businessId), eq(billingUsageEvents.periodKey, periodKey))).orderBy(desc(billingUsageEvents.createdAt)).limit(100);
  const usageMonth = await tx.select({ periodKey: billingUsageMonths.periodKey, voiceSecondsUsed: billingUsageMonths.voiceSecondsUsed, alertSmsSegmentsUsed: billingUsageMonths.alertSmsSegmentsUsed, outboundCallAttemptsUsed: billingUsageMonths.outboundCallAttemptsUsed, voiceBlocked: billingUsageMonths.voiceBlocked, alertSmsBlocked: billingUsageMonths.alertSmsBlocked, outboundCallAttemptsBlocked: billingUsageMonths.outboundCallAttemptsBlocked, overageSpendCents: billingUsageMonths.overageSpendCents }).from(billingUsageMonths).where(and(eq(billingUsageMonths.businessId, businessId), eq(billingUsageMonths.periodKey, periodKey))).limit(1);
  const transactions = await tx.select({ kind: billingTransactions.kind, sourceId: billingTransactions.sourceId, status: billingTransactions.status, amountCents: billingTransactions.amountCents, refundedAmountCents: billingTransactions.refundedAmountCents, currency: billingTransactions.currency, description: billingTransactions.description, invoiceUrl: billingTransactions.invoiceUrl, occurredAt: billingTransactions.occurredAt }).from(billingTransactions).where(eq(billingTransactions.businessId, businessId)).orderBy(desc(billingTransactions.occurredAt)).limit(20);
  const incompleteUsage = await tx.select({ count: sql<number>`count(*)` }).from(billingUsageEvents).where(and(eq(billingUsageEvents.businessId, businessId), eq(billingUsageEvents.periodKey, periodKey), eq(billingUsageEvents.isFinal, false)));
  const knowledgeStorageBytesUsed = await getKnowledgeStorageUsageBytes(tx, businessId);
  // The plan the server enforces: a canceled Pro subscription still stores plan "pro".
  const { plan: effectivePlan } = await loadBillingContext(tx, businessId);
  const month = usageMonth[0];
  const cap = account[0]?.overageSpendingCapCents ?? null;
  const permissions = billingAccess(role, account[0] ?? null, Boolean(process.env.POLAR_ACCESS_TOKEN && process.env.POLAR_ORGANIZATION_ID));
  const availableCheckoutIntervals: HostedCheckoutPlanIntervals = { starter: [], pro: [] };
  if (permissions.hasCheckoutAccess) for (const plan of ["starter", "pro"] as const) {
    for (const interval of ["monthly", "annual"] as const) {
      if (process.env[`POLAR_${plan.toUpperCase()}_${interval.toUpperCase()}_PRODUCT_ID`]) availableCheckoutIntervals[plan].push(interval);
    }
  }
  const availableCheckoutPlans = (["starter", "pro"] as const).filter(plan => availableCheckoutIntervals[plan].length > 0);
  const planEndsAt = effectivePlan === "starter" || effectivePlan === "pro" ? await scheduledSubscriptionEndInTransaction(tx, businessId) : null;
  return { availableCheckoutPlans, availableCheckoutIntervals, account: account[0] ?? null, effectivePlan, planEndsAt, knowledgeStorageBytesUsed, permissions, checkoutAvailable: permissions.hasCheckoutAccess, widgetIssuanceEnabled: isWidgetKeyIssuanceEnabled(process.env), usage, usageStatus: month ? { ...month, usageComplete: Number(incompleteUsage[0]?.count ?? 0) === 0, overageSpendingCapCents: cap, overageSpendingCapReached: cap !== null && month.overageSpendCents > 0 && month.overageSpendCents >= cap } : null, transactions: permissions.hasBillingManagementAccess ? transactions : [] };
})));

export const POST = operatorRoute(async ({ userId, businessId, body, domain }) => {
  if (!("capCents" in body)) return jsonError("capCents is required.", 400);
  const { capCents } = body;
  if (capCents !== null && (typeof capCents !== "number" || !Number.isSafeInteger(capCents) || capCents < 0)) return jsonError("capCents must be a non-negative whole number of cents or null.", 400);
  return NextResponse.json(await setOverageSpendingCap(domain, { userId, businessId, capCents: capCents as number | null }));
});
