import { NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";

import { billingAccounts, billingTransactions, billingUsageEvents, billingUsageMonths } from "@lobbystack/db";
import { setOverageSpendingCap } from "@lobbystack/domain";
import { asApiResponse, businessIdFromRequest, readJson, requireApiSession, withOperatorTransaction } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    return NextResponse.json(await withOperatorTransaction(request, async ({ businessId, tx }) => {
      const [account, usage, usageMonth, transactions, incompleteUsage] = await Promise.all([
        tx.select({ plan: billingAccounts.plan, billingKey: billingAccounts.billingKey, billingInterval: billingAccounts.billingInterval, subscriptionState: billingAccounts.subscriptionState, currentPeriodStart: billingAccounts.currentPeriodStart, currentPeriodEnd: billingAccounts.currentPeriodEnd, overageSpendingCapCents: billingAccounts.overageSpendingCapCents }).from(billingAccounts).where(eq(billingAccounts.businessId, businessId)).limit(1),
        tx.select({ periodKey: billingUsageEvents.periodKey, usageKind: billingUsageEvents.usageKind, quantity: billingUsageEvents.quantity, isFinal: billingUsageEvents.isFinal, syncStatus: billingUsageEvents.syncStatus }).from(billingUsageEvents).where(and(eq(billingUsageEvents.businessId, businessId), eq(billingUsageEvents.periodKey, new Date().toISOString().slice(0, 7)))).orderBy(desc(billingUsageEvents.createdAt)).limit(100),
        tx.select({ periodKey: billingUsageMonths.periodKey, voiceSecondsUsed: billingUsageMonths.voiceSecondsUsed, alertSmsSegmentsUsed: billingUsageMonths.alertSmsSegmentsUsed, outboundCallAttemptsUsed: billingUsageMonths.outboundCallAttemptsUsed, voiceBlocked: billingUsageMonths.voiceBlocked, alertSmsBlocked: billingUsageMonths.alertSmsBlocked, outboundCallAttemptsBlocked: billingUsageMonths.outboundCallAttemptsBlocked, overageSpendCents: billingUsageMonths.overageSpendCents }).from(billingUsageMonths).where(and(eq(billingUsageMonths.businessId, businessId), eq(billingUsageMonths.periodKey, new Date().toISOString().slice(0, 7)))).limit(1),
        tx.select({ kind: billingTransactions.kind, sourceId: billingTransactions.sourceId, status: billingTransactions.status, amountCents: billingTransactions.amountCents, currency: billingTransactions.currency, description: billingTransactions.description, invoiceUrl: billingTransactions.invoiceUrl, occurredAt: billingTransactions.occurredAt }).from(billingTransactions).where(eq(billingTransactions.businessId, businessId)).orderBy(desc(billingTransactions.occurredAt)).limit(20),
        tx.select({ count: sql<number>`count(*)` }).from(billingUsageEvents).where(and(eq(billingUsageEvents.businessId, businessId), eq(billingUsageEvents.periodKey, new Date().toISOString().slice(0, 7)), eq(billingUsageEvents.isFinal, false))),
      ]);
      const month = usageMonth[0];
      const cap = account[0]?.overageSpendingCapCents ?? null;
      return { account: account[0] ?? null, usage, usageStatus: month ? { ...month, usageComplete: Number(incompleteUsage[0]?.count ?? 0) === 0, overageSpendingCapCents: cap, overageSpendingCapReached: cap !== null && month.overageSpendCents > 0 && month.overageSpendCents >= cap } : null, transactions };
    }));
  } catch (error) {
    return asApiResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireApiSession(request);
    const businessId = businessIdFromRequest(request);
    if (!businessId) return NextResponse.json({ error: "A businessId is required." }, { status: 400 });
    const body = await readJson(request);
    if (typeof body !== "object" || body === null || !("capCents" in body)) return NextResponse.json({ error: "capCents is required." }, { status: 400 });
    const capCents = (body as { capCents?: unknown }).capCents;
    if (capCents !== null && typeof capCents !== "number") return NextResponse.json({ error: "capCents must be a number or null." }, { status: 400 });
    return NextResponse.json(await setOverageSpendingCap(createDomainContext(), { userId: session.user.id, businessId, capCents: capCents as number | null }));
  } catch (error) {
    return asApiResponse(error);
  }
}
