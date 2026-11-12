import { sql, type SQL } from "drizzle-orm";

// Whether a website crawl that still says it's running has stopped moving.
// Nothing marks a crawl as stuck: the worker that would is often the thing
// that's down. So each read works it out from the timestamps the worker
// already writes, and a crawl the worker picks up again reads as running.

/** The outbox hands the crawl to the queue within seconds while the worker runs, so a minute without that means no worker. */
export const WEBSITE_IMPORT_UNDISPATCHED_MS = 60_000;
/**
 * Every business shares the bulk queue, two jobs per worker, with reembed,
 * summary, hours and file reads. A crawl job ahead of this one gets five
 * minutes of Firecrawl and then embeds up to 50 pages, so a healthy crawl can
 * wait behind two of them for well over five minutes. A dead worker still
 * shows within a minute while the outbox holds the crawl, since the
 * dispatcher runs in the worker; this limit covers a worker that died after it.
 */
export const WEBSITE_IMPORT_QUEUED_MS = 15 * 60_000;
/**
 * The worker writes nothing while the crawl provider reads the site: Firecrawl
 * gets five minutes, a provider outage defers the crawl up to two minutes
 * between tries, and the deferred job can wait for a queue slot again.
 */
export const WEBSITE_IMPORT_CRAWLING_MS = 15 * 60_000;
/** Indexing writes progress after each page, and one page's embeddings take seconds. */
export const WEBSITE_IMPORT_INDEXING_MS = 5 * 60_000;

/** The newest outbox message that queues this crawl: when it was written, and when the dispatcher sent it on. */
export type WebsiteImportDispatch = { createdAt: Date | string; publishedAt: Date | string | null };

export type WebsiteImportClock = {
  status: string;
  /** When the crawl was queued or last reported progress. */
  updatedAt: Date | string;
  dispatch?: WebsiteImportDispatch | null | undefined;
};

const time = (value: Date | string): number => value instanceof Date ? value.getTime() : Date.parse(value);

/** True when a crawl that should be running hasn't moved for longer than its stage allows. */
export function isWebsiteImportStalled(job: WebsiteImportClock, now: number = Date.now()): boolean {
  const updatedAt = time(job.updatedAt);
  if (job.status === "queued" || job.status === "pending") {
    if (job.dispatch && !job.dispatch.publishedAt) return now - time(job.dispatch.createdAt) > WEBSITE_IMPORT_UNDISPATCHED_MS;
    // The queue wait starts once the dispatcher sends the crawl on.
    const queuedAt = job.dispatch?.publishedAt ? Math.max(updatedAt, time(job.dispatch.publishedAt)) : updatedAt;
    return now - queuedAt > WEBSITE_IMPORT_QUEUED_MS;
  }
  if (job.status === "crawling") return now - updatedAt > WEBSITE_IMPORT_CRAWLING_MS;
  if (job.status === "indexing") return now - updatedAt > WEBSITE_IMPORT_INDEXING_MS;
  return false;
}

/**
 * The newest outbox message that queues the crawl `ingestion` (a
 * website_ingestion_jobs alias or table name in raw SQL), as JSON, while the
 * crawl waits in the queue. Null once it has started, so running crawls skip
 * the lookup.
 */
export function websiteImportDispatchSql(ingestion: string): SQL {
  const alias = sql.raw(ingestion);
  return sql`(case when ${alias}.status in ('queued', 'pending') then (select json_build_object('createdAt', message.created_at, 'publishedAt', message.published_at) from outbox_messages message where message.business_id = ${alias}.business_id and message.topic = 'knowledge.crawlWebsite' and message.payload->>'websiteIngestionJobId' = ${alias}.id::text order by message.created_at desc limit 1) end)`;
}

/** A knowledge document's crawl as the dashboard reads it: the import summary, plus the clock that says whether it stalled. */
export function websiteImportSummarySql(): SQL {
  return sql`(select json_build_object('id', ingestion.id, 'status', ingestion.status, 'websiteUrl', ingestion.website_url, 'importedCount', ingestion.imported_count, 'indexedCount', ingestion.indexed_count, 'documentCount', ingestion.indexed_count, 'crawlFinishedCount', nullif(ingestion.imported_count, 0), 'crawlTotalCount', nullif(ingestion.imported_count, 0), 'updatedAt', ingestion.updated_at, 'dispatch', ${websiteImportDispatchSql("ingestion")}) from website_ingestion_jobs ingestion where ingestion.root_document_id = knowledge_documents.id and ingestion.business_id = knowledge_documents.business_id limit 1)`;
}

export type WithWebsiteImportHealth<T> = Omit<T, "updatedAt" | "dispatch"> & { stalled: boolean };

/** Swaps a crawl's clock for whether it stalled. */
export function withWebsiteImportHealth<T extends WebsiteImportClock>(job: T, now?: number): WithWebsiteImportHealth<T>;
export function withWebsiteImportHealth<T extends WebsiteImportClock>(job: T | null, now?: number): WithWebsiteImportHealth<T> | null;
export function withWebsiteImportHealth<T extends WebsiteImportClock>(job: T | null, now: number = Date.now()): WithWebsiteImportHealth<T> | null {
  if (!job) return null;
  const { updatedAt: _updatedAt, dispatch: _dispatch, ...summary } = job;
  return { ...summary, stalled: isWebsiteImportStalled(job, now) };
}
