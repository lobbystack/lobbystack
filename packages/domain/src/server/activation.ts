import { and, count, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";

import { businesses, calls, websiteIngestionJobs, type DatabaseTransaction } from "@lobbystack/db";
import { DASHBOARD_TEST_CALL_WIDGET_ID } from "@lobbystack/shared";

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
