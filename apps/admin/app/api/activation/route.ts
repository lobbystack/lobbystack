import { and, asc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { billingAccounts, calls, phoneNumbers, websiteIngestionJobs } from "@lobbystack/db";
import { asApiResponse, withOperatorTransaction } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

/**
 * Activation state for the dashboard: what the agent has learned, whether the
 * operator has heard it work, and whether it can answer a real phone call yet.
 * A successful web call is one that carried media and then ended, which is a
 * durable fact about the call rather than a provider status string.
 */
export async function GET(request: Request) {
  try {
    return NextResponse.json(await withOperatorTransaction(request, async ({ businessId, tx }) => {
      const account = (await tx.select({ plan: billingAccounts.plan, subscriptionState: billingAccounts.subscriptionState }).from(billingAccounts).where(eq(billingAccounts.businessId, businessId)).limit(1))[0];
      const number = (await tx.select({ id: phoneNumbers.id }).from(phoneNumbers).where(and(eq(phoneNumbers.businessId, businessId), eq(phoneNumbers.status, "active"), isNull(phoneNumbers.reclaimScheduledAt))).limit(1))[0];
      const completed = (await tx.select({ count: sql<number>`count(*)::int`, firstAt: sql<string | null>`min(${calls.endedAt})` }).from(calls).where(and(
        eq(calls.businessId, businessId),
        eq(calls.transport, "web_voice"),
        isNull(calls.prospectDemoId),
        isNotNull(calls.mediaStartedAt),
        isNotNull(calls.endedAt),
      )))[0];
      const ingestion = (await tx.select({ status: websiteIngestionJobs.status, websiteUrl: websiteIngestionJobs.websiteUrl, importedCount: websiteIngestionJobs.importedCount, indexedCount: websiteIngestionJobs.indexedCount }).from(websiteIngestionJobs).where(eq(websiteIngestionJobs.businessId, businessId)).orderBy(asc(websiteIngestionJobs.createdAt)).limit(1))[0];
      return {
        plan: account?.plan ?? "free_cloud",
        subscriptionState: account?.subscriptionState ?? null,
        hasDedicatedNumber: Boolean(number),
        completedWebCalls: completed?.count ?? 0,
        firstCompletedWebCallAt: completed?.firstAt ?? null,
        websiteImport: ingestion ?? null,
      };
    }));
  } catch (error) {
    return asApiResponse(error);
  }
}
