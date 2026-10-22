import { and, count, desc, eq, isNotNull, isNull, ne, sql } from "drizzle-orm";

import { businesses, calls, knowledgeDocuments, phoneNumbers, websiteIngestionJobs, type DatabaseTransaction } from "@lobbystack/db";
import { DASHBOARD_TEST_CALL_WIDGET_ID } from "@lobbystack/shared";

import { ONBOARDING_CRAWL_PAGE_LIMIT } from "./knowledge";

/**
 * How many times the operator has heard their own agent. A call that carried
 * media and ended is one somebody actually listened to, and only the dashboard
 * test widget means that somebody was on staff: a customer reaching the
 * business through the website widget is a web_voice call too.
 */
export async function countOperatorTestCallsHeard(tx: DatabaseTransaction, businessId: string): Promise<number> {
  const [row] = await tx.select({ count: count() }).from(calls).where(and(
    eq(calls.businessId, businessId),
    eq(calls.transport, "web_voice"),
    eq(calls.widgetId, DASHBOARD_TEST_CALL_WIDGET_ID),
    isNull(calls.prospectDemoId),
    isNotNull(calls.mediaStartedAt),
    isNotNull(calls.endedAt),
  ));
  return Number(row?.count ?? 0);
}

/**
 * The crawl describing the business's own website. Resubmitting a URL reuses
 * that URL's earlier import, so creation time alone would favour whichever site
 * was tried second: submit A, then B, then A again, and B is still newest. The
 * business record holds the site they settled on, so match it first and fall
 * back to the newest crawl when nothing matches.
 */
export async function currentWebsiteIngestion(tx: DatabaseTransaction, businessId: string) {
  return (await tx.select({
    rootDocumentId: websiteIngestionJobs.rootDocumentId,
    status: websiteIngestionJobs.status,
    websiteUrl: websiteIngestionJobs.websiteUrl,
    importedCount: websiteIngestionJobs.importedCount,
    indexedCount: websiteIngestionJobs.indexedCount,
    pageLimit: websiteIngestionJobs.pageLimit,
  }).from(websiteIngestionJobs).where(eq(websiteIngestionJobs.businessId, businessId)).orderBy(
    // coalesce, because a null comparison would sort first under DESC.
    desc(sql`coalesce(${websiteIngestionJobs.websiteUrl} = (select ${businesses.websiteUrl} from ${businesses} where ${businesses.id} = ${businessId}), false)`),
    desc(websiteIngestionJobs.createdAt),
  ).limit(1))[0];
}

/** Whether the business has answered a phone call: one that carried media and ended. Calls from the web don't count. */
export async function hasAnsweredPhoneCall(tx: DatabaseTransaction, businessId: string): Promise<boolean> {
  const rows = await tx.select({ id: calls.id }).from(calls).where(and(
    eq(calls.businessId, businessId),
    sql`${calls.transport} not ilike '%web%'`,
    isNull(calls.prospectDemoId),
    isNotNull(calls.mediaStartedAt),
    isNotNull(calls.endedAt),
  )).limit(1);
  return rows.length > 0;
}

// The setup guide: what's left after onboarding, which the dashboard and the API share.

export const setupGuideStepIds = ["fullScan", "sources", "testCall", "phoneNumber"] as const;
export type SetupGuideStepId = (typeof setupGuideStepIds)[number];
export type SetupGuideStatus = "complete" | "skipped" | "needs setup";

/** Each setup guide step's status. A step that got done reads complete, even if it was skipped. */
export async function loadSetupGuideInTransaction(tx: DatabaseTransaction, businessId: string): Promise<{ steps: Record<SetupGuideStepId, SetupGuideStatus>; fullScanDocumentId: string | null }> {
  const business = (await tx.select({ skippedSteps: businesses.setupGuideSkippedSteps }).from(businesses).where(eq(businesses.id, businessId)).limit(1))[0];
  const knowledge = await tx.select({ count: count() }).from(knowledgeDocuments).where(and(eq(knowledgeDocuments.businessId, businessId), eq(knowledgeDocuments.sourceType, "upload"), ne(knowledgeDocuments.status, "error"), ne(knowledgeDocuments.status, "cancelled")));
  const sampled = await currentWebsiteIngestion(tx, businessId);
  // Onboarding samples a site, and an expansion reuses the same row, so the
  // page count cannot say which kind of crawl produced it; the cap it ran
  // with can. The step is done once the site has been read in full: with no
  // crawl at all, or a completed one that was not cut off by the sample cap.
  // A crawl still running or one that failed leaves the step open, so the
  // count never goes backwards and a failed read keeps its way back in.
  const fullyRead = !sampled?.rootDocumentId || (sampled.status === "completed" && !(sampled.pageLimit === ONBOARDING_CRAWL_PAGE_LIMIT && sampled.importedCount >= ONBOARDING_CRAWL_PAGE_LIMIT));
  const heardCalls = await countOperatorTestCallsHeard(tx, businessId);
  const businessNumber = await tx.select({ count: count() }).from(phoneNumbers).where(and(eq(phoneNumbers.businessId, businessId), eq(phoneNumbers.status, "active"), isNull(phoneNumbers.reclaimScheduledAt)));
  const skipped = business?.skippedSteps ?? [];
  const status = (done: boolean, step: SetupGuideStepId): SetupGuideStatus => done ? "complete" : skipped.includes(step) ? "skipped" : "needs setup";
  return {
    steps: {
      fullScan: status(fullyRead, "fullScan"),
      sources: status(Number(knowledge[0]?.count ?? 0) > 0, "sources"),
      testCall: status(heardCalls > 0, "testCall"),
      phoneNumber: status(Number(businessNumber[0]?.count ?? 0) > 0, "phoneNumber"),
    },
    fullScanDocumentId: sampled?.rootDocumentId ?? null,
  };
}

/** Changes which setup guide steps are skipped, holding the business row. Null when the business is gone. */
export async function updateSetupGuideSkippedStepsInTransaction(tx: DatabaseTransaction, businessId: string, change: (current: string[]) => string[]): Promise<{ before: string[]; after: string[] } | null> {
  const current = (await tx.select({ skippedSteps: businesses.setupGuideSkippedSteps }).from(businesses).where(eq(businesses.id, businessId)).limit(1).for("update"))[0];
  if (!current) return null;
  const after = change(current.skippedSteps);
  if (after.length !== current.skippedSteps.length || after.some((step, index) => step !== current.skippedSteps[index])) {
    await tx.update(businesses).set({ setupGuideSkippedSteps: after, updatedAt: new Date() }).where(eq(businesses.id, businessId));
  }
  return { before: current.skippedSteps, after };
}
