import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";

import { billingAccounts, billingTransactions, billingUsageEvents } from "@lobbystack/db";
import { asApiResponse, withOperatorTransaction } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    return NextResponse.json(await withOperatorTransaction(request, async ({ businessId, tx }) => {
      const [account, usage, transactions] = await Promise.all([
        tx.select({ plan: billingAccounts.plan, billingKey: billingAccounts.billingKey, subscriptionState: billingAccounts.subscriptionState, currentPeriodStart: billingAccounts.currentPeriodStart, currentPeriodEnd: billingAccounts.currentPeriodEnd }).from(billingAccounts).where(eq(billingAccounts.businessId, businessId)).limit(1),
        tx.select({ periodKey: billingUsageEvents.periodKey, usageKind: billingUsageEvents.usageKind, quantity: billingUsageEvents.quantity, syncStatus: billingUsageEvents.syncStatus }).from(billingUsageEvents).where(and(eq(billingUsageEvents.businessId, businessId), eq(billingUsageEvents.periodKey, new Date().toISOString().slice(0, 7)))).orderBy(desc(billingUsageEvents.createdAt)).limit(100),
        tx.select({ kind: billingTransactions.kind, sourceId: billingTransactions.sourceId, status: billingTransactions.status, amountCents: billingTransactions.amountCents, currency: billingTransactions.currency, description: billingTransactions.description, invoiceUrl: billingTransactions.invoiceUrl, occurredAt: billingTransactions.occurredAt }).from(billingTransactions).where(eq(billingTransactions.businessId, businessId)).orderBy(desc(billingTransactions.occurredAt)).limit(20),
      ]);
      return { account: account[0] ?? null, usage, transactions };
    }));
  } catch (error) {
    return asApiResponse(error);
  }
}
