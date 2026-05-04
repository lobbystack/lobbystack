"use node";

import { lookup } from "node:dns/promises";
import Firecrawl, { type CrawlJob, type Document as FirecrawlDocument } from "firecrawl";

import { v } from "convex/values";

import { internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import { type ActionCtx } from "../../_generated/server";
import { getKnowledgeStorageLimitBytes } from "../../lib/billing";
import { bulkWorkpool, firecrawlScrape, KNOWLEDGE_INDEX_VERSION, rag } from "../../lib/components";
import { buildKnowledgeDocumentPreviewText } from "../../lib/knowledgeDocuments";
import { deleteWebsiteIngestionStorageBlob } from "../../lib/websiteIngestionStorage";
import {
  computeWebsiteDocumentImportance,
  countUtf8Bytes,
  isDirectlyBlockedWebsiteHostname,
  normalizeWebsiteMarkdown,
  normalizeWebsitePageUrl,
  normalizeWebsiteUrl,
  shouldImportWebsitePage,
  shouldSkipWebsitePage,
  WEBSITE_CRAWL_FIRECRAWL_MODE,
  WEBSITE_INGESTION_PROVIDER,
  WEBSITE_PUBLIC_URL_ERROR_MESSAGE,
} from "../../lib/websiteIngestion";
import {
  getPostHogBusinessGroupKey,
  getPostHogDistinctIdForBusinessSystem,
} from "../../telemetry/shared";
import { enqueuePostHogProviderExceptionBestEffort } from "../../telemetry/posthog";

import { observedInternalAction as internalAction } from "../../telemetry/observedFunctions";
type WebsiteIngestionJobIdArgs = {
  websiteIngestionJobId: Id<"website_ingestion_jobs">;
};

type WebsiteKnowledgeSourceArgs = {
  businessId: Id<"businesses">;
  sourceUrl: string;
};

type FirecrawlScrapeJobState = {
  url: string;
  jobId: string;
};

type FirecrawlScrapeRecord = {
  _id: string;
  status: "pending" | "scraping" | "completed" | "failed";
  expiresAt: number;
  formats: Array<string>;
};

type FirecrawlScrapeJobCtx = Pick<ActionCtx, "runMutation" | "runQuery">;

type WebsiteImportSummary = {
  importedDocumentCount: number;
  resultsReady: boolean;
  weak: boolean;
  aborted?: boolean;
};

type SubmitFirecrawlWebsiteCrawlArgs = WebsiteIngestionJobIdArgs;

type ImportFirecrawlWebsiteCrawlArgs = WebsiteIngestionJobIdArgs & {
  providerJobId: string;
  commitChanges?: boolean;
};

type WebsiteDocumentCountSummary = {
  businessId: Id<"businesses">;
  indexed: number;
  error: number;
  pending: number;
};

type FirecrawlScrapeContent = {
  markdown?: string;
  markdownFileUrl?: string | null;
};

const WEBSITE_CRAWL_STALL_WINDOW_MS = 30 * 60 * 1_000;
const WEBSITE_CRAWL_HARD_TIMEOUT_MS = 2 * 60 * 60 * 1_000;
const FIRECRAWL_DISCOVERY_PAGE_LIMIT_MULTIPLIER = 4;
const FIRECRAWL_DISCOVERY_MAX_PAGE_LIMIT = 120;
const FIRECRAWL_SCRAPE_WAIT_FOR_MS = 2_000;
const FIRECRAWL_PROGRESS_TOTAL = 100;
const FIRECRAWL_DISCOVERY_PROGRESS_MAX = 68;
const FIRECRAWL_SCRAPE_PROGRESS_MAX = 90;
const FIRECRAWL_INDEXING_PROGRESS_VALUE = 92;
const FIRECRAWL_SCRAPE_TTL_MS = 3 * 24 * 60 * 60 * 1_000;

const HIGH_PRIORITY_WEBSITE_SELECTION_SEGMENTS = new Set([
  "about",
  "booking",
  "book",
  "contact",
  "faq",
  "faqs",
  "hours",
  "menu",
  "menus",
  "pricing",
  "price",
  "service",
  "services",
]);

const LOW_PRIORITY_WEBSITE_SELECTION_SEGMENTS = new Set([
  "location",
  "locations",
]);

type FirecrawlPageCandidate = {
  sourceUrl: string;
  title: string | undefined;
  pathDepth: number;
  selectionPriority: number;
};

type FirecrawlSelectedPages = {
  crawledSourceUrls: Set<string>;
  selectedCandidates: Array<FirecrawlPageCandidate>;
};

type FirecrawlScrapeResultRecord = {
  sourceUrl: string;
  title: string;
  markdown: string;
  byteLength: number;
};

type FirecrawlScrapeCollection = {
  resultsReady: boolean;
  completedCount: number;
  failedCount: number;
  recordsBySourceUrl: Map<string, FirecrawlScrapeResultRecord>;
};

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function requireFirecrawlApiKey(): string {
  const apiKey = process.env.FIRECRAWL_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("Firecrawl website ingestion is not configured.");
  }

  return apiKey;
}

function createFirecrawlClient(): Firecrawl {
  return new Firecrawl({
    apiKey: requireFirecrawlApiKey(),
  });
}

async function captureFirecrawlProviderException(
  ctx: Pick<ActionCtx, "runMutation">,
  input: {
    job: Doc<"website_ingestion_jobs">;
    error: unknown;
    operation: string;
    providerJobId?: string;
  },
): Promise<void> {
  await enqueuePostHogProviderExceptionBestEffort(ctx, {
    provider: "firecrawl",
    error: input.error,
    operation: input.operation,
    businessId: input.job.businessId,
    distinctId: getPostHogDistinctIdForBusinessSystem(String(input.job.businessId)),
    groupKey: getPostHogBusinessGroupKey(String(input.job.businessId)),
    properties: {
      websiteIngestionJobId: String(input.job._id),
      websiteIngestionStatus: input.job.status,
      crawlMode: input.job.crawlMode ?? WEBSITE_CRAWL_FIRECRAWL_MODE,
      ...(input.providerJobId ? { providerJobId: input.providerJobId } : {}),
    },
  });
}

function resolveFirecrawlDiscoveryPageLimit(pageLimit: number): number {
  return Math.min(
    FIRECRAWL_DISCOVERY_MAX_PAGE_LIMIT,
    Math.max(pageLimit, pageLimit * FIRECRAWL_DISCOVERY_PAGE_LIMIT_MULTIPLIER),
  );
}

function buildFirecrawlIncludePaths(websiteUrl: string): string[] | undefined {
  const parsed = new URL(websiteUrl);
  const normalizedPath =
    parsed.pathname && parsed.pathname !== "/"
      ? parsed.pathname.replace(/\/+$/u, "")
      : "";

  if (!normalizedPath) {
    return undefined;
  }

  return [normalizedPath, `${normalizedPath}/*`];
}

function getFirecrawlDocumentSourceUrl(document: FirecrawlDocument): string | null {
  const rawSourceUrl =
    typeof document.metadata?.sourceURL === "string"
      ? document.metadata.sourceURL
      : typeof document.metadata?.url === "string"
        ? document.metadata.url
        : null;

  return rawSourceUrl?.trim() ? rawSourceUrl : null;
}

function hasSuccessfulFirecrawlPageResponse(document: FirecrawlDocument): boolean {
  const statusCode = document.metadata?.statusCode;
  return statusCode === undefined || (statusCode >= 200 && statusCode < 300);
}

function computeFirecrawlSelectionPriority(pageUrl: string): number {
  const pathname = new URL(pageUrl).pathname.toLowerCase();
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0) {
    return 4;
  }

  if (segments.some((segment) => HIGH_PRIORITY_WEBSITE_SELECTION_SEGMENTS.has(segment))) {
    return 3;
  }

  if (segments.some((segment) => LOW_PRIORITY_WEBSITE_SELECTION_SEGMENTS.has(segment))) {
    return 1;
  }

  return 2;
}

function getFirecrawlPathDepth(pageUrl: string): number {
  return new URL(pageUrl).pathname.split("/").filter(Boolean).length;
}

function getFirecrawlDiscoveryProgressValue(input: {
  completed: number;
  total: number;
}): number {
  if (input.total <= 0) {
    return 8;
  }

  return Math.max(
    8,
    Math.min(
      FIRECRAWL_DISCOVERY_PROGRESS_MAX,
      Math.round((input.completed / input.total) * FIRECRAWL_DISCOVERY_PROGRESS_MAX),
    ),
  );
}

function getFirecrawlScrapeProgressValue(input: {
  completed: number;
  total: number;
}): number {
  if (input.total <= 0) {
    return FIRECRAWL_DISCOVERY_PROGRESS_MAX;
  }

  const scrapeProgress =
    FIRECRAWL_DISCOVERY_PROGRESS_MAX +
    Math.round(
      (input.completed / input.total) *
        (FIRECRAWL_SCRAPE_PROGRESS_MAX - FIRECRAWL_DISCOVERY_PROGRESS_MAX),
    );

  return Math.max(
    FIRECRAWL_DISCOVERY_PROGRESS_MAX,
    Math.min(FIRECRAWL_SCRAPE_PROGRESS_MAX, scrapeProgress),
  );
}

function parseIpv4Address(address: string): [number, number, number, number] | null {
  const parts = address.split(".");
  if (parts.length !== 4) {
    return null;
  }

  const bytes = parts.map((part) => {
    if (!/^\d{1,3}$/u.test(part)) {
      return null;
    }
    const value = Number.parseInt(part, 10);
    return value >= 0 && value <= 255 ? value : null;
  });

  if (bytes.some((byte) => byte === null)) {
    return null;
  }

  return bytes as [number, number, number, number];
}

function isNonPublicResolvedIpv4Address(address: string): boolean {
  const bytes = parseIpv4Address(address);
  if (!bytes) {
    return false;
  }

  const [first, second] = bytes;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  );
}

function isNonPublicResolvedIpv6Address(address: string): boolean {
  const normalizedAddress = address.toLowerCase();
  if (normalizedAddress === "::" || normalizedAddress === "::1") {
    return true;
  }
  if (normalizedAddress.includes("%")) {
    return true;
  }
  if (normalizedAddress.startsWith("::ffff:")) {
    return isNonPublicResolvedIpv4Address(normalizedAddress.slice(7));
  }

  const firstHextetText = normalizedAddress
    .split(":")
    .find((segment) => segment.length > 0);
  if (!firstHextetText) {
    return false;
  }

  const firstHextet = Number.parseInt(firstHextetText, 16);
  if (Number.isNaN(firstHextet)) {
    return false;
  }

  return (
    (firstHextet >= 0xfc00 && firstHextet <= 0xfdff) ||
    (firstHextet >= 0xfe80 && firstHextet <= 0xfebf) ||
    (firstHextet >= 0xff00 && firstHextet <= 0xffff)
  );
}

function isNonPublicResolvedAddress(address: string): boolean {
  return (
    isNonPublicResolvedIpv4Address(address) ||
    isNonPublicResolvedIpv6Address(address)
  );
}

function getDnsLookupErrorCode(error: unknown): string {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : "";
}

function isTransientDnsLookupError(error: unknown): boolean {
  const code = getDnsLookupErrorCode(error);

  return (
    code === "EAI_AGAIN" ||
    code === "ESERVFAIL" ||
    code === "ETIMEOUT"
  );
}

async function assertWebsiteCrawlTargetIsPublic(websiteUrl: string): Promise<void> {
  const parsed = new URL(websiteUrl);
  if (isDirectlyBlockedWebsiteHostname(parsed.hostname)) {
    throw new Error(WEBSITE_PUBLIC_URL_ERROR_MESSAGE);
  }

  try {
    const resolvedAddresses = await lookup(parsed.hostname, {
      all: true,
      verbatim: true,
    });

    if (resolvedAddresses.length === 0) {
      throw new Error("Enter a public website URL with a live hostname.");
    }

    if (resolvedAddresses.some((record) => isNonPublicResolvedAddress(record.address))) {
      throw new Error(WEBSITE_PUBLIC_URL_ERROR_MESSAGE);
    }
  } catch (error) {
    const code = getDnsLookupErrorCode(error);
    if (code === "ENODATA" || code === "ENOTFOUND") {
      throw new Error("Enter a public website URL with a live hostname.");
    }
    if (isTransientDnsLookupError(error)) {
      return;
    }
    throw error;
  }
}

function parseIsoTimestamp(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

export function resolveRunningWebsiteCrawlStatus(input: {
  status: string;
  startedAt?: string;
  lastProgressAt?: string;
  nowMs?: number;
}): string {
  if (input.status !== "running") {
    return input.status;
  }

  const nowMs = input.nowMs ?? Date.now();
  const startedAtMs = parseIsoTimestamp(input.startedAt) ?? nowMs;
  const lastProgressAtMs = parseIsoTimestamp(input.lastProgressAt) ?? startedAtMs;
  const elapsedMs = nowMs - startedAtMs;
  const stalledForMs = nowMs - lastProgressAtMs;

  if (stalledForMs >= WEBSITE_CRAWL_STALL_WINDOW_MS) {
    return "stalled";
  }

  if (elapsedMs >= WEBSITE_CRAWL_HARD_TIMEOUT_MS) {
    return "timed_out";
  }

  return "running";
}

function buildWebsiteDocumentTitle(input: {
  pageUrl: string;
  title: string | undefined;
}): string {
  const providedTitle = input.title?.trim();
  if (providedTitle) {
    return providedTitle;
  }

  const parsed = new URL(input.pageUrl);
  if (parsed.pathname === "/" || parsed.pathname === "") {
    return parsed.hostname.replace(/^www\./u, "");
  }

  const lastSegment = parsed.pathname.split("/").filter(Boolean).at(-1) ?? parsed.hostname;
  return lastSegment
    .replace(/[-_]+/gu, " ")
    .replace(/\b\w/gu, (value) => value.toUpperCase());
}

function formatKnowledgeStorageLimit(limitBytes: number): string {
  if (limitBytes >= 1024 * 1024 * 1024) {
    return `${limitBytes / (1024 * 1024 * 1024)} GB`;
  }

  return `${limitBytes / (1024 * 1024)} MB`;
}

function buildSelectedFirecrawlPageCandidates(
  job: Doc<"website_ingestion_jobs">,
  documents: Array<FirecrawlDocument>,
): FirecrawlSelectedPages {
  const crawledSourceUrls = new Set<string>();
  const candidatesBySourceUrl = new Map<string, FirecrawlPageCandidate>();

  for (const document of documents) {
    const rawSourceUrl = getFirecrawlDocumentSourceUrl(document);
    if (!rawSourceUrl) {
      continue;
    }

    const sourceUrl = normalizeWebsitePageUrl(rawSourceUrl, job.websiteUrl);
    if (!sourceUrl || !hasSuccessfulFirecrawlPageResponse(document)) {
      continue;
    }

    crawledSourceUrls.add(sourceUrl);

    if (shouldSkipWebsitePage(sourceUrl)) {
      continue;
    }

    const candidate: FirecrawlPageCandidate = {
      sourceUrl,
      title:
        typeof document.metadata?.title === "string" ? document.metadata.title.trim() : undefined,
      pathDepth: getFirecrawlPathDepth(sourceUrl),
      selectionPriority: computeFirecrawlSelectionPriority(sourceUrl),
    };
    const existing = candidatesBySourceUrl.get(sourceUrl);

    if (
      !existing ||
      candidate.selectionPriority > existing.selectionPriority ||
      (candidate.selectionPriority === existing.selectionPriority &&
        candidate.pathDepth < existing.pathDepth) ||
      (candidate.selectionPriority === existing.selectionPriority &&
        candidate.pathDepth === existing.pathDepth &&
        candidate.sourceUrl.localeCompare(existing.sourceUrl) < 0)
    ) {
      candidatesBySourceUrl.set(sourceUrl, candidate);
    }
  }

  const selectedCandidates = [...candidatesBySourceUrl.values()]
    .sort((left, right) => {
      if (left.selectionPriority !== right.selectionPriority) {
        return right.selectionPriority - left.selectionPriority;
      }
      if (left.pathDepth !== right.pathDepth) {
        return left.pathDepth - right.pathDepth;
      }
      return left.sourceUrl.localeCompare(right.sourceUrl);
    })
    .slice(0, job.pageLimit);

  return {
    crawledSourceUrls,
    selectedCandidates,
  };
}

async function ensureFirecrawlScrapeJobs(
  ctx: ActionCtx,
  job: Doc<"website_ingestion_jobs">,
  selectedCandidates: Array<FirecrawlPageCandidate>,
): Promise<Array<FirecrawlScrapeJobState>> {
  const existingScrapeJobsByUrl = new Map(
    (job.firecrawlScrapeJobs ?? []).map((scrapeJob) => [scrapeJob.url, scrapeJob.jobId]),
  );
  const nextScrapeJobs: Array<FirecrawlScrapeJobState> = [];

  for (const candidate of selectedCandidates) {
    const existingJobId = existingScrapeJobsByUrl.get(candidate.sourceUrl);

    if (existingJobId) {
      nextScrapeJobs.push({
        url: candidate.sourceUrl,
        jobId: existingJobId,
      });
      continue;
    }

    const scrapeJob = await startOrReuseFirecrawlScrapeJob(ctx, candidate.sourceUrl);

    nextScrapeJobs.push({
      url: candidate.sourceUrl,
      jobId: scrapeJob.jobId,
    });
  }

  const storedScrapeJobs = job.firecrawlScrapeJobs ?? [];
  const jobsChanged =
    storedScrapeJobs.length !== nextScrapeJobs.length ||
    storedScrapeJobs.some(
      (storedJob, index) =>
        storedJob.url !== nextScrapeJobs[index]?.url ||
        storedJob.jobId !== nextScrapeJobs[index]?.jobId,
    );

  if (jobsChanged) {
    await ctx.runMutation(internal.ai.context.websiteIngestion.patchWebsiteIngestionJob, {
      websiteIngestionJobId: job._id,
      firecrawlScrapeJobs: nextScrapeJobs,
    });
  }

  return nextScrapeJobs;
}

function canReuseFirecrawlScrapeRecord(
  scrape: FirecrawlScrapeRecord | null,
  now: number,
): scrape is FirecrawlScrapeRecord {
  if (!scrape) {
    return false;
  }

  if (scrape.status === "pending" || scrape.status === "scraping") {
    return true;
  }

  return (
    scrape.status === "completed" &&
    scrape.expiresAt > now &&
    scrape.formats.includes("markdown")
  );
}

async function getReusableFirecrawlScrapeJobId(
  ctx: FirecrawlScrapeJobCtx,
  sourceUrl: string,
): Promise<string | null> {
  const scrape = await ctx.runQuery(firecrawlScrape.api.lib.getByUrl, {
    url: sourceUrl,
  });

  if (!canReuseFirecrawlScrapeRecord(scrape, Date.now())) {
    return null;
  }

  return String(scrape._id);
}

export async function startOrReuseFirecrawlScrapeJob(
  ctx: FirecrawlScrapeJobCtx,
  sourceUrl: string,
): Promise<{ jobId: string }> {
  const existingJobId = await getReusableFirecrawlScrapeJobId(ctx, sourceUrl);
  if (existingJobId) {
    return { jobId: existingJobId };
  }

  try {
    return await ctx.runMutation(firecrawlScrape.api.lib.startScrape, {
      url: sourceUrl,
      apiKey: requireFirecrawlApiKey(),
      options: {
        formats: ["markdown"],
        ttlMs: FIRECRAWL_SCRAPE_TTL_MS,
        onlyMainContent: true,
        waitFor: FIRECRAWL_SCRAPE_WAIT_FOR_MS,
        proxy: "auto",
      },
    });
  } catch (error) {
    const racedJobId = await getReusableFirecrawlScrapeJobId(ctx, sourceUrl);
    if (racedJobId) {
      return { jobId: racedJobId };
    }

    throw error;
  }
}

async function collectReadyFirecrawlScrapeResults(
  ctx: ActionCtx,
  input: {
    scrapeJobs: Array<FirecrawlScrapeJobState>;
    discoveredCandidatesBySourceUrl: Map<string, FirecrawlPageCandidate>;
  },
): Promise<FirecrawlScrapeCollection> {
  const recordsBySourceUrl = new Map<string, FirecrawlScrapeResultRecord>();
  let completedCount = 0;
  let failedCount = 0;

  for (const scrapeJob of input.scrapeJobs) {
    const status = await ctx.runQuery(firecrawlScrape.api.lib.getStatus, {
      id: scrapeJob.jobId,
    });

    if (!status || status.status === "pending" || status.status === "scraping") {
      continue;
    }

    if (status.status === "failed") {
      failedCount += 1;
      continue;
    }

    completedCount += 1;

    const content = await ctx.runQuery(firecrawlScrape.api.lib.getContent, {
      id: scrapeJob.jobId,
    });

    const statusCode = content?.metadata?.statusCode;
    const markdown = await resolveFirecrawlMarkdownContent(content);
    if (
      !markdown ||
      (statusCode !== undefined && (statusCode < 200 || statusCode >= 300))
    ) {
      continue;
    }

    const sourceUrl = scrapeJob.url;

    const normalizedMarkdown = normalizeWebsiteMarkdown(markdown);
    if (!shouldImportWebsitePage({ pageUrl: sourceUrl, markdown: normalizedMarkdown })) {
      continue;
    }

    const byteLength = countUtf8Bytes(normalizedMarkdown);
    const discoveredCandidate = input.discoveredCandidatesBySourceUrl.get(sourceUrl);
    const title = buildWebsiteDocumentTitle({
      pageUrl: sourceUrl,
      title:
        (typeof content?.metadata?.title === "string" ? content.metadata.title : undefined) ??
        discoveredCandidate?.title,
    });

    const existing = recordsBySourceUrl.get(sourceUrl);
    if (!existing || byteLength > existing.byteLength) {
      recordsBySourceUrl.set(sourceUrl, {
        sourceUrl,
        title,
        markdown: normalizedMarkdown,
        byteLength,
      });
    }
  }

  return {
    resultsReady: completedCount + failedCount >= input.scrapeJobs.length,
    completedCount,
    failedCount,
    recordsBySourceUrl,
  };
}

async function loadWebsiteIngestionJobRecord(
  ctx: ActionCtx,
  websiteIngestionJobId: Id<"website_ingestion_jobs">,
): Promise<Doc<"website_ingestion_jobs">> {
  const job: Doc<"website_ingestion_jobs"> | null = await ctx.runQuery(
    internal.ai.context.websiteIngestion.getWebsiteIngestionJobRecord,
    {
      websiteIngestionJobId,
    },
  );

  if (!job) {
    throw new Error("Website ingestion job not found.");
  }

  return job;
}

async function listExistingWebsiteDocuments(
  ctx: ActionCtx,
  businessId: Id<"businesses">,
): Promise<Array<Doc<"knowledge_documents">>> {
  return await ctx.runQuery(
    internal.ai.context.websiteIngestion.listWebsiteKnowledgeDocumentsForBusiness,
    {
      businessId,
    },
  );
}

export function isWebsiteDocumentInScope(input: {
  sourceUrl: string;
  websiteUrl: string;
}): boolean {
  return normalizeWebsitePageUrl(input.sourceUrl, input.websiteUrl) !== null;
}

function filterWebsiteDocumentsForScope(
  documents: Array<Doc<"knowledge_documents">>,
  websiteUrl: string,
): Array<Doc<"knowledge_documents"> & { sourceUrl: string }> {
  return documents.filter((document): document is Doc<"knowledge_documents"> & { sourceUrl: string } => {
    return (
      typeof document.sourceUrl === "string" &&
      isWebsiteDocumentInScope({
        sourceUrl: document.sourceUrl,
        websiteUrl,
      })
    );
  });
}

export function buildExistingWebsiteDocumentsBySourceUrl(
  documents: Array<Doc<"knowledge_documents">>,
  websiteUrl: string,
): Map<string, Doc<"knowledge_documents"> & { sourceUrl: string }> {
  const documentsBySourceUrl = new Map<
    string,
    Doc<"knowledge_documents"> & { sourceUrl: string }
  >();

  for (const document of filterWebsiteDocumentsForScope(documents, websiteUrl)) {
    const normalizedSourceUrl = normalizeWebsitePageUrl(document.sourceUrl, websiteUrl);
    if (!normalizedSourceUrl) {
      continue;
    }

    documentsBySourceUrl.set(normalizedSourceUrl, document);
  }

  return documentsBySourceUrl;
}

export async function resolveFirecrawlMarkdownContent(
  content: FirecrawlScrapeContent | null,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  if (typeof content?.markdown === "string") {
    return content.markdown;
  }

  if (!content?.markdownFileUrl) {
    return null;
  }

  const response = await fetchImpl(content.markdownFileUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch Firecrawl markdown file (${response.status} ${response.statusText}).`,
    );
  }

  return await response.text();
}

function isIndexedWebsiteDocumentCurrent(document: Doc<"knowledge_documents">): boolean {
  return (
    document.status === "indexed" &&
    !!document.indexedEntryId &&
    document.indexVersion === KNOWLEDGE_INDEX_VERSION
  );
}

function isKnowledgeDocumentActive(document: Pick<Doc<"knowledge_documents">, "active">): boolean {
  return document.active !== false;
}

async function deleteWebsiteKnowledgeDocument(
  ctx: ActionCtx,
  document: Doc<"knowledge_documents">,
): Promise<void> {
  if (document.indexedEntryId) {
    await rag.delete(ctx, { entryId: document.indexedEntryId as never });
  }
  if (document.storageId) {
    await deleteWebsiteIngestionStorageBlob(ctx, document.storageId);
  }
  if (document.extractedTextStorageId) {
    await deleteWebsiteIngestionStorageBlob(ctx, document.extractedTextStorageId);
  }

  await ctx.runMutation(internal.ai.context.knowledge.deleteKnowledgeDocumentRecord, {
    documentId: document._id,
  });
}

async function getWebsiteDocumentCounts(
  ctx: ActionCtx,
  websiteIngestionJobId: Id<"website_ingestion_jobs">,
): Promise<WebsiteDocumentCountSummary> {
  const counts: WebsiteDocumentCountSummary = await ctx.runQuery(
    internal.ai.context.websiteIngestion.getWebsiteIngestionDocumentCounts,
    {
      websiteIngestionJobId,
    },
  );
  return counts;
}

async function assertWebsiteStorageCapacity(
  ctx: ActionCtx,
  args: {
    businessId: Id<"businesses">;
    additionalBytes: number;
    reclaimedBytes: number;
  },
): Promise<void> {
  const billingSnapshot: {
    plan: "self_host" | "free_cloud" | "pro" | "enterprise";
  } = await ctx.runQuery(internal.billing.getSnapshotForCheckout, {
    businessId: args.businessId,
  });
  const limitBytes = getKnowledgeStorageLimitBytes(billingSnapshot.plan);
  if (limitBytes === null) {
    return;
  }

  const currentUsageBytes: number = await ctx.runQuery(
    internal.ai.context.knowledge.getKnowledgeStorageUsageBytes,
    {
      businessId: args.businessId,
    },
  );

  if (currentUsageBytes + args.additionalBytes - args.reclaimedBytes > limitBytes) {
    throw new Error(
      `Knowledge storage limit reached. ${formatKnowledgeStorageLimit(limitBytes)} is included on this plan.`,
    );
  }
}

async function getKnowledgeDocumentStorageBytes(
  ctx: ActionCtx,
  document: Pick<Doc<"knowledge_documents">, "storageId" | "extractedTextStorageId">,
): Promise<number> {
  let totalBytes = 0;

  for (const storageId of [document.storageId, document.extractedTextStorageId]) {
    if (!storageId) {
      continue;
    }

    try {
      const metadata: { byteLength: number } = await ctx.runQuery(
        internal.ai.context.knowledge.getUploadedKnowledgeDocumentMetadata,
        {
          storageId,
        },
      );
      totalBytes += metadata.byteLength;
    } catch {
      // Missing storage metadata should not block website cleanup or capacity planning.
    }
  }

  return totalBytes;
}

export const preflightWebsiteCrawlTarget = internalAction({
  args: {
    websiteUrl: v.string(),
  },
  handler: async (
    _ctx: ActionCtx,
    args: { websiteUrl: string },
  ): Promise<string> => {
    const websiteUrl = normalizeWebsiteUrl(args.websiteUrl);
    await assertWebsiteCrawlTargetIsPublic(websiteUrl);
    requireFirecrawlApiKey();
    return websiteUrl;
  },
});

export const submitFirecrawlWebsiteCrawl = internalAction({
  args: {
    websiteIngestionJobId: v.id("website_ingestion_jobs"),
  },
  handler: async (
    ctx: ActionCtx,
    args: SubmitFirecrawlWebsiteCrawlArgs,
  ): Promise<{ providerJobId: string; crawlMode: string }> => {
    const job = await loadWebsiteIngestionJobRecord(ctx, args.websiteIngestionJobId);

    await assertWebsiteCrawlTargetIsPublic(job.websiteUrl);

    const client = createFirecrawlClient();
    const includePaths = buildFirecrawlIncludePaths(job.websiteUrl);
    let providerJobId: string;
    try {
      const crawl = await client.startCrawl(job.websiteUrl, {
        crawlEntireDomain: false,
        allowExternalLinks: false,
        allowSubdomains: false,
        deduplicateSimilarURLs: true,
        ignoreQueryParameters: true,
        limit: resolveFirecrawlDiscoveryPageLimit(job.pageLimit),
        maxDiscoveryDepth: job.depth,
        sitemap: "include",
        scrapeOptions: {
          formats: ["markdown"],
          onlyMainContent: true,
          waitFor: FIRECRAWL_SCRAPE_WAIT_FOR_MS,
        },
        ...(includePaths ? { includePaths } : {}),
      });
      providerJobId = crawl.id;
    } catch (error) {
      await captureFirecrawlProviderException(ctx, {
        job,
        error,
        operation: "firecrawl_start_crawl",
      });
      throw error;
    }

    return {
      providerJobId,
      crawlMode: WEBSITE_CRAWL_FIRECRAWL_MODE,
    };
  },
});

export const cancelFirecrawlWebsiteCrawlJob = internalAction({
  args: {
    providerJobId: v.string(),
  },
  handler: async (
    _ctx: ActionCtx,
    args: { providerJobId: string },
  ): Promise<null> => {
    const client = createFirecrawlClient();
    await client.cancelCrawl(args.providerJobId);
    return null;
  },
});

export const getFirecrawlWebsiteCrawlJobStatus = internalAction({
  args: {
    websiteIngestionJobId: v.id("website_ingestion_jobs"),
    providerJobId: v.string(),
  },
  handler: async (
    ctx: ActionCtx,
    args: WebsiteIngestionJobIdArgs & { providerJobId: string },
  ): Promise<{ status: string; finished: number; total: number | null }> => {
    const job = await loadWebsiteIngestionJobRecord(ctx, args.websiteIngestionJobId);
    const client = createFirecrawlClient();
    let crawl: CrawlJob;
    try {
      crawl = await client.getCrawlStatus(args.providerJobId, {
        autoPaginate: false,
      });
    } catch (error) {
      await captureFirecrawlProviderException(ctx, {
        job,
        error,
        operation: "firecrawl_get_crawl_status",
        providerJobId: args.providerJobId,
      });
      throw error;
    }

    const total = typeof crawl.total === "number" ? crawl.total : null;
    const completed = typeof crawl.completed === "number" ? crawl.completed : 0;
    const progressValue = getFirecrawlDiscoveryProgressValue({
      completed,
      total: total ?? 0,
    });
    const nowIso = new Date().toISOString();
    const previousProgressValue =
      typeof job.crawlFinishedCount === "number" ? job.crawlFinishedCount : 0;
    const progressAdvanced = progressValue > previousProgressValue;
    const nextLastProgressAt =
      progressAdvanced || !job.lastProgressAt
        ? nowIso
        : (job.lastProgressAt ?? job.startedAt ?? nowIso);

    await ctx.runMutation(internal.ai.context.websiteIngestion.patchWebsiteIngestionJob, {
      websiteIngestionJobId: args.websiteIngestionJobId,
      crawlFinishedCount: progressValue,
      crawlTotalCount: FIRECRAWL_PROGRESS_TOTAL,
      ...(progressAdvanced || !job.lastProgressAt ? { lastProgressAt: nextLastProgressAt } : {}),
    });

    return {
      status:
        crawl.status === "scraping"
          ? resolveRunningWebsiteCrawlStatus({
              status: "running",
              ...(job.startedAt !== undefined ? { startedAt: job.startedAt } : {}),
              lastProgressAt: nextLastProgressAt,
            })
          : crawl.status === "cancelled"
            ? "canceled"
            : crawl.status,
      finished: progressValue,
      total: FIRECRAWL_PROGRESS_TOTAL,
    };
  },
});

export const importFirecrawlWebsiteCrawlResults = internalAction({
  args: {
    websiteIngestionJobId: v.id("website_ingestion_jobs"),
    providerJobId: v.string(),
    commitChanges: v.optional(v.boolean()),
  },
  handler: async (
    ctx: ActionCtx,
    args: ImportFirecrawlWebsiteCrawlArgs,
  ): Promise<WebsiteImportSummary> => {
    const commitChanges = args.commitChanges ?? true;
    const job = await loadWebsiteIngestionJobRecord(ctx, args.websiteIngestionJobId);
    const client = createFirecrawlClient();
    let crawl: CrawlJob;
    try {
      crawl = await client.getCrawlStatus(args.providerJobId);
    } catch (error) {
      await captureFirecrawlProviderException(ctx, {
        job,
        error,
        operation: "firecrawl_import_crawl_results",
        providerJobId: args.providerJobId,
      });
      throw error;
    }

    if (crawl.status === "scraping") {
      return {
        importedDocumentCount: 0,
        resultsReady: false,
        weak: false,
      };
    }

    if (crawl.status === "failed" || crawl.status === "cancelled") {
      throw new Error(`Website crawl ended with status ${crawl.status}.`);
    }

    const existingDocumentsBySourceUrl = buildExistingWebsiteDocumentsBySourceUrl(
      await listExistingWebsiteDocuments(ctx, job.businessId),
      job.websiteUrl,
    );
    const { crawledSourceUrls, selectedCandidates } = buildSelectedFirecrawlPageCandidates(
      job,
      crawl.data ?? [],
    );
    const discoveredCandidatesBySourceUrl = new Map(
      selectedCandidates.map((candidate) => [candidate.sourceUrl, candidate]),
    );
    const scrapeJobs = await ensureFirecrawlScrapeJobs(ctx, job, selectedCandidates);
    const scrapeResults = await collectReadyFirecrawlScrapeResults(ctx, {
      scrapeJobs,
      discoveredCandidatesBySourceUrl,
    });
    const scrapeProgressValue = getFirecrawlScrapeProgressValue({
      completed: scrapeResults.completedCount + scrapeResults.failedCount,
      total: Math.max(scrapeJobs.length, 1),
    });
    const previousProgressValue =
      typeof job.crawlFinishedCount === "number" ? job.crawlFinishedCount : 0;
    const progressAdvanced = scrapeProgressValue > previousProgressValue;

    await ctx.runMutation(internal.ai.context.websiteIngestion.patchWebsiteIngestionJob, {
      websiteIngestionJobId: args.websiteIngestionJobId,
      crawlFinishedCount: scrapeProgressValue,
      crawlTotalCount: FIRECRAWL_PROGRESS_TOTAL,
      ...(progressAdvanced || !job.lastProgressAt
        ? { lastProgressAt: new Date().toISOString() }
        : {}),
    });

    if (!scrapeResults.resultsReady) {
      return {
        importedDocumentCount: 0,
        resultsReady: false,
        weak: false,
      };
    }

    let importedDocumentCount = 0;

    for (const record of scrapeResults.recordsBySourceUrl.values()) {
      importedDocumentCount += 1;
    }

    if (!commitChanges) {
      return {
        importedDocumentCount,
        resultsReady: true,
        weak: false,
      };
    }

    if (await shouldAbortWebsiteImportCommit(ctx, args.websiteIngestionJobId)) {
      return {
        importedDocumentCount: 0,
        resultsReady: true,
        weak: false,
        aborted: true,
      };
    }

    const documentsToIndex: Array<{
      documentId: Id<"knowledge_documents">;
      skipSnapshotRefresh: true;
    }> = [];
    // Firecrawl discovery is intentionally bounded, so a missing URL may simply
    // be outside this crawl window rather than deleted from the source website.
    const staleDocuments: Array<Doc<"knowledge_documents">> = [];
    const staleDocumentReclaimedBytes = (
      await Promise.all(
        staleDocuments.map(async (document) => await getKnowledgeDocumentStorageBytes(ctx, document)),
      )
    ).reduce((total, byteLength) => total + byteLength, 0);

    for (const [sourceUrl, record] of scrapeResults.recordsBySourceUrl) {
      if (await shouldAbortWebsiteImportCommit(ctx, args.websiteIngestionJobId)) {
        return {
          importedDocumentCount: 0,
          resultsReady: true,
          weak: false,
          aborted: true,
        };
      }

      const contentHash = await sha256Hex(record.markdown);
      const existingDocument = existingDocumentsBySourceUrl.get(sourceUrl) ?? null;
      const existingDocumentIsActive = existingDocument ? isKnowledgeDocumentActive(existingDocument) : false;

      if (existingDocument?.contentHash === contentHash && isIndexedWebsiteDocumentCurrent(existingDocument)) {
        await ctx.runMutation(internal.ai.context.websiteIngestion.updateWebsiteKnowledgeDocument, {
          documentId: existingDocument._id,
          websiteIngestionJobId: args.websiteIngestionJobId,
          title: record.title,
          sourceUrl,
        });
        continue;
      }

      if (existingDocument?.contentHash === contentHash) {
        await ctx.runMutation(internal.ai.context.websiteIngestion.updateWebsiteKnowledgeDocument, {
          documentId: existingDocument._id,
          websiteIngestionJobId: args.websiteIngestionJobId,
          title: record.title,
          sourceUrl,
          ...(existingDocumentIsActive
            ? {
                status: "queued",
                processingProgress: 0,
              }
            : {}),
        });
        if (existingDocumentIsActive) {
          documentsToIndex.push({
            documentId: existingDocument._id,
            skipSnapshotRefresh: true,
          });
        }
        continue;
      }

      const reclaimedBytes =
        staleDocumentReclaimedBytes +
        (existingDocument ? await getKnowledgeDocumentStorageBytes(ctx, existingDocument) : 0);

      await assertWebsiteStorageCapacity(ctx, {
        businessId: job.businessId,
        additionalBytes: record.byteLength,
        reclaimedBytes,
      });

      const extractedTextStorageId = await ctx.storage.store(
        new Blob([record.markdown], {
          type: "text/markdown;charset=utf-8",
        }),
      );

      try {
        if (existingDocument) {
          await ctx.runMutation(internal.ai.context.websiteIngestion.updateWebsiteKnowledgeDocument, {
            documentId: existingDocument._id,
            websiteIngestionJobId: args.websiteIngestionJobId,
            title: record.title,
            sourceUrl,
            textContent: buildKnowledgeDocumentPreviewText(record.markdown),
            extractedTextStorageId,
            contentHash,
            importance: computeWebsiteDocumentImportance(sourceUrl),
            ...(existingDocumentIsActive
              ? {
                  status: "queued",
                  processingProgress: 0,
                }
              : {}),
          });
          if (existingDocumentIsActive) {
            documentsToIndex.push({
              documentId: existingDocument._id,
              skipSnapshotRefresh: true,
            });
          }
        } else {
          const documentId: Id<"knowledge_documents"> = await ctx.runMutation(
            internal.ai.context.websiteIngestion.createWebsiteKnowledgeDocument,
            {
              businessId: job.businessId,
              websiteIngestionJobId: args.websiteIngestionJobId,
              sourceUrl,
              title: record.title,
              textContent: buildKnowledgeDocumentPreviewText(record.markdown),
              extractedTextStorageId,
              contentHash,
              importance: computeWebsiteDocumentImportance(sourceUrl),
            },
          );

          documentsToIndex.push({
            documentId,
            skipSnapshotRefresh: true,
          });
        }
      } catch (error) {
        await deleteWebsiteIngestionStorageBlob(ctx, extractedTextStorageId);
        throw error;
      }

      if (existingDocument?.extractedTextStorageId) {
        try {
          await deleteWebsiteIngestionStorageBlob(ctx, existingDocument.extractedTextStorageId);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Failed to delete outdated website storage.";
          console.warn(
            `[websiteIngestion] Failed to delete outdated extracted text for ${sourceUrl}: ${message}`,
          );
        }
      }
    }

    for (const staleDocument of staleDocuments) {
      await deleteWebsiteKnowledgeDocument(ctx, staleDocument);
    }

    if (await shouldAbortWebsiteImportCommit(ctx, args.websiteIngestionJobId)) {
      return {
        importedDocumentCount: 0,
        resultsReady: true,
        weak: false,
        aborted: true,
      };
    }

    if (documentsToIndex.length > 0) {
      await bulkWorkpool.enqueueActionBatch(
        ctx,
        internal.ai.context.knowledge.indexKnowledgeDocument,
        documentsToIndex,
      );
    }

    const documentCounts = await getWebsiteDocumentCounts(ctx, args.websiteIngestionJobId);
    const totalImportedDocumentCount =
      documentCounts.indexed + documentCounts.error + documentCounts.pending;

    if (await shouldAbortWebsiteImportCommit(ctx, args.websiteIngestionJobId)) {
      return {
        importedDocumentCount: 0,
        resultsReady: true,
        weak: false,
        aborted: true,
      };
    }

    await ctx.runMutation(internal.ai.context.websiteIngestion.patchWebsiteIngestionJob, {
      websiteIngestionJobId: args.websiteIngestionJobId,
      status: documentsToIndex.length > 0 ? "indexing" : "crawling",
      crawlMode: WEBSITE_CRAWL_FIRECRAWL_MODE,
      importedCount: totalImportedDocumentCount,
      crawlFinishedCount: FIRECRAWL_INDEXING_PROGRESS_VALUE,
      crawlTotalCount: FIRECRAWL_PROGRESS_TOTAL,
      lastError: null,
    });

    return {
      importedDocumentCount,
      resultsReady: true,
      weak: false,
    };
  },
});

export const waitForWebsiteIngestionDocuments = internalAction({
  args: {
    websiteIngestionJobId: v.id("website_ingestion_jobs"),
  },
  handler: async (
    ctx: ActionCtx,
    args: WebsiteIngestionJobIdArgs,
  ): Promise<WebsiteDocumentCountSummary> => {
    return await getWebsiteDocumentCounts(ctx, args.websiteIngestionJobId);
  },
});

function isTerminalWebsiteIngestionStatus(status: string): boolean {
  return status === "completed" || status === "failed" || status === "canceled";
}

async function shouldAbortWebsiteImportCommit(
  ctx: ActionCtx,
  websiteIngestionJobId: Id<"website_ingestion_jobs">,
): Promise<boolean> {
  const latestJob = await loadWebsiteIngestionJobRecord(ctx, websiteIngestionJobId);
  return isTerminalWebsiteIngestionStatus(latestJob.status);
}

async function markWebsiteIngestionJobFailed(
  ctx: ActionCtx,
  websiteIngestionJobId: Id<"website_ingestion_jobs">,
  message: string,
): Promise<void> {
  await ctx.runMutation(internal.ai.context.websiteIngestion.patchWebsiteIngestionJob, {
    websiteIngestionJobId,
    status: "failed",
    lastError: message,
    completedAt: new Date().toISOString(),
  });
}

async function finalizeWebsiteIngestionJobIndexing(
  ctx: ActionCtx,
  websiteIngestionJobId: Id<"website_ingestion_jobs">,
): Promise<WebsiteDocumentCountSummary> {
  const indexingCounts = await getWebsiteDocumentCounts(ctx, websiteIngestionJobId);

  if (indexingCounts.pending > 0) {
    return indexingCounts;
  }

  await ctx.runMutation(internal.ai.context.snapshots.refreshSnapshot, {
    businessId: indexingCounts.businessId,
  });

  await ctx.runMutation(internal.ai.context.websiteIngestion.patchWebsiteIngestionJob, {
    websiteIngestionJobId,
    status: indexingCounts.indexed > 0 ? "completed" : "failed",
    indexedCount: indexingCounts.indexed,
    errorCount: indexingCounts.error,
    lastError:
      indexingCounts.indexed > 0 ? null : "Website pages were imported but failed to index.",
    completedAt: new Date().toISOString(),
  });

  return indexingCounts;
}

export const reconcileWebsiteIngestionJob = internalAction({
  args: {
    websiteIngestionJobId: v.id("website_ingestion_jobs"),
  },
  handler: async (
    ctx: ActionCtx,
    args: WebsiteIngestionJobIdArgs,
  ): Promise<{ status: string }> => {
    const nowIso = new Date().toISOString();

    try {
      const job = await loadWebsiteIngestionJobRecord(ctx, args.websiteIngestionJobId);

      if (isTerminalWebsiteIngestionStatus(job.status)) {
        return { status: job.status };
      }

      if (job.status === "indexing") {
        const indexingCounts = await finalizeWebsiteIngestionJobIndexing(ctx, args.websiteIngestionJobId);
        return {
          status: indexingCounts.pending > 0 ? "indexing" : indexingCounts.indexed > 0 ? "completed" : "failed",
        };
      }

      if (job.provider === WEBSITE_INGESTION_PROVIDER) {
        if (job.status === "queued" || !job.providerJobId) {
          const crawl = await ctx.runAction(
            internal.ai.context.websiteIngestionActions.submitFirecrawlWebsiteCrawl,
            {
              websiteIngestionJobId: args.websiteIngestionJobId,
            },
          );

          await ctx.runMutation(internal.ai.context.websiteIngestion.patchWebsiteIngestionJob, {
            websiteIngestionJobId: args.websiteIngestionJobId,
            status: "crawling",
            providerJobId: crawl.providerJobId,
            crawlMode: crawl.crawlMode,
            startedAt: job.startedAt ?? nowIso,
            lastProgressAt: nowIso,
            crawlFinishedCount: 8,
            crawlTotalCount: FIRECRAWL_PROGRESS_TOTAL,
            lastError: null,
          });

          return { status: "crawling" };
        }

        const crawlStatus = await ctx.runAction(
          internal.ai.context.websiteIngestionActions.getFirecrawlWebsiteCrawlJobStatus,
          {
            websiteIngestionJobId: args.websiteIngestionJobId,
            providerJobId: job.providerJobId,
          },
        );

        const previousFinished = job.crawlFinishedCount ?? 0;
        const progressAdvanced = crawlStatus.finished > previousFinished;
        const nextLastProgressAt = progressAdvanced
          ? nowIso
          : (job.lastProgressAt ?? job.startedAt ?? nowIso);
        const startedAtMs = parseIsoTimestamp(job.startedAt) ?? Date.now();
        const lastProgressAtMs = parseIsoTimestamp(nextLastProgressAt) ?? startedAtMs;
        const elapsedMs = Date.now() - startedAtMs;
        const stalledForMs = Date.now() - lastProgressAtMs;

        if (crawlStatus.status === "running") {
          if (stalledForMs >= WEBSITE_CRAWL_STALL_WINDOW_MS) {
            await markWebsiteIngestionJobFailed(
              ctx,
              args.websiteIngestionJobId,
              "Website crawl stopped making progress before completion. Please retry the import.",
            );
            return { status: "failed" };
          }

          if (elapsedMs >= WEBSITE_CRAWL_HARD_TIMEOUT_MS) {
            await markWebsiteIngestionJobFailed(
              ctx,
              args.websiteIngestionJobId,
              "Website crawl exceeded the maximum allowed runtime. Please retry the import.",
            );
            return { status: "failed" };
          }

          return { status: "crawling" };
        }

        if (crawlStatus.status !== "completed") {
          await markWebsiteIngestionJobFailed(
            ctx,
            args.websiteIngestionJobId,
            `Website crawl ended with status ${crawlStatus.status}.`,
          );
          return { status: "failed" };
        }

        const importSummary = await ctx.runAction(
          internal.ai.context.websiteIngestionActions.importFirecrawlWebsiteCrawlResults,
          {
            websiteIngestionJobId: args.websiteIngestionJobId,
            providerJobId: job.providerJobId,
            commitChanges: true,
          },
        );

        if (!importSummary.resultsReady) {
          return { status: "crawling" };
        }

        if (importSummary.aborted) {
          const latestJob = await loadWebsiteIngestionJobRecord(ctx, args.websiteIngestionJobId);
          return { status: latestJob.status };
        }

        if (importSummary.importedDocumentCount === 0) {
          await markWebsiteIngestionJobFailed(
            ctx,
            args.websiteIngestionJobId,
            "We couldn't import any public website pages from this site.",
          );
          return { status: "failed" };
        }

        const indexingCounts = await finalizeWebsiteIngestionJobIndexing(ctx, args.websiteIngestionJobId);

        return {
          status: indexingCounts.pending > 0 ? "indexing" : indexingCounts.indexed > 0 ? "completed" : "failed",
        };
      }

      await markWebsiteIngestionJobFailed(
        ctx,
        args.websiteIngestionJobId,
        `Unsupported website ingestion provider: ${job.provider}.`,
      );
      return { status: "failed" };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Website import failed unexpectedly.";

      await markWebsiteIngestionJobFailed(ctx, args.websiteIngestionJobId, message);
      return { status: "failed" };
    }
  },
});

export const reconcileActiveWebsiteIngestionJobs = internalAction({
  args: {},
  handler: async (_ctx: ActionCtx): Promise<{ reconciledCount: number }> => {
    const ctx = _ctx;
    const activeJobs = (
      await Promise.all(
        ["queued", "crawling", "indexing"].map(async (status) =>
          await ctx.runQuery(internal.ai.context.websiteIngestion.listWebsiteIngestionJobsByStatus, {
            status,
          }),
        ),
      )
    ).flat();

    let reconciledCount = 0;

    for (const job of activeJobs) {
      if (job.workflowId) {
        continue;
      }

      try {
        await ctx.runAction(internal.ai.context.websiteIngestionActions.reconcileWebsiteIngestionJob, {
          websiteIngestionJobId: job._id,
        });
        reconciledCount += 1;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown website ingestion reconciliation failure.";
        console.warn(
          `[websiteIngestion] Failed to reconcile ${String(job._id)} (${job.websiteUrl}): ${message}`,
        );
      }
    }

    return { reconciledCount };
  },
});
