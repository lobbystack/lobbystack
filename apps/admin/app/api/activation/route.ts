import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { billingAccounts, businesses, phoneNumbers } from "@lobbystack/db";
import { countOperatorTestCallsHeard, currentWebsiteIngestion, loadEntitlement } from "@lobbystack/domain";
import { operatorRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

/**
 * Activation state for the dashboard: what the agent has learned, whether the
 * operator has heard it work, and whether it can answer a real phone call yet.
 * A successful web call is one that carried media and then ended, which is a
 * durable fact about the call rather than a provider status string.
 */
export const GET = operatorRoute(async ({ businessId, transaction }) => NextResponse.json(await transaction(async (tx) => {
  const business = (await tx.select({ deploymentMode: businesses.deploymentMode }).from(businesses).where(eq(businesses.id, businessId)).limit(1))[0];
  const account = (await tx.select({ plan: billingAccounts.plan }).from(billingAccounts).where(eq(billingAccounts.businessId, businessId)).limit(1))[0];
  const entitlement = await loadEntitlement(tx, businessId);
  const number = (await tx.select({ id: phoneNumbers.id }).from(phoneNumbers).where(and(eq(phoneNumbers.businessId, businessId), eq(phoneNumbers.status, "active"), isNull(phoneNumbers.reclaimScheduledAt))).limit(1))[0];
  const completedWebCalls = await countOperatorTestCallsHeard(tx, businessId);
  const ingestion = await currentWebsiteIngestion(tx, businessId);
  return {
    deploymentMode: business?.deploymentMode ?? "cloud",
    plan: account?.plan ?? "free_cloud",
    // A live paid plan can still lack a number: the onboarding number step
    // can be skipped, and those operators need claiming, not checkout. A
    // partner's business never buys the host's plan, so it goes to claiming
    // too, paid or not.
    paidPlanLive: entitlement.live || entitlement.poolPartnerId !== null,
    hasDedicatedNumber: Boolean(number),
    completedWebCalls,
    websiteImport: ingestion ? { status: ingestion.status, websiteUrl: ingestion.websiteUrl, importedCount: ingestion.importedCount, indexedCount: ingestion.indexedCount } : null,
  };
})));
