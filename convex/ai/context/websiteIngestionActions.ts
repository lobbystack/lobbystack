"use node";

import { lookup } from "node:dns/promises";
import Firecrawl, { type CrawlJob, type Document as FirecrawlDocument } from "firecrawl";

import { v } from "convex/values";

import { internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import { internalAction, type ActionCtx } from "../../_generated/server";
import { getKnowledgeStorageLimitBytes } from "../../lib/billing";
import { bulkWorkpool, firecrawlScrape, KNOWLEDGE_INDEX_VERSION, rag } from "../../lib/components";
import { buildKnowledgeDocumentPreviewText } from "../../lib/knowledgeDocuments";
import { deleteWebsiteIngestionStorageBlob } from "../../lib/websiteIngestionStorage";
import {
  buildWebsiteCrawlExcludePatterns,
  buildWebsiteCrawlIncludePatterns,
  computeWebsiteDocumentImportance,
  countUtf8Bytes,
  isDirectlyBlockedWebsiteHostname,
  normalizeWebsiteMarkdown,
  normalizeWebsitePageUrl,
  normalizeWebsiteUrl,
  resolveWebsiteCrawlBudget,
  shouldImportWebsitePage,
  shouldSkipWebsitePage,
  shouldTriggerBrowserFallback,
  WEBSITE_CRAWL_FIRECRAWL_MODE,
  WEBSITE_CRAWL_BROWSER_MODE,
  WEBSITE_CRAWL_HTTP_MODE,
  WEBSITE_INGESTION_PROVIDER,
  WEBSITE_PUBLIC_URL_ERROR_MESSAGE,
} from "../../lib/websiteIngestion";

type WebsiteIngestionJobIdArgs = {
  websiteIngestionJobId: Id<"website_ingestion_jobs">;
};

type SubmitCloudflareWebsiteCrawlArgs = WebsiteIngestionJobIdArgs & {
  render: boolean;
  crawlTargetUrl?: string;
  pageLimit?: number;
  depth?: number;
};

type WebsiteKnowledgeSourceArgs = {
  businessId: Id<"businesses">;
  sourceUrl: string;
};

type FirecrawlScrapeJobState = {
  url: string;
  jobId: string;
};

type CloudflareCrawlRecord = {
  url?: string;
  status?: string | number;
  markdown?: string;
  metadata?: {
    status?: number;
    title?: string;
  };
};

type CloudflareCrawlResult = {
  id?: string;
  status?: string;
  finished?: number;
  skipped?: number;
  records?: Array<CloudflareCrawlRecord>;
  cursor?: string | number;
  total?: number;
};

type WebsiteImportSummary = {
  importedDocumentCount: number;
  resultsReady: boolean;
  weak: boolean;
};

type SubmitFirecrawlWebsiteCrawlArgs = WebsiteIngestionJobIdArgs;

type ImportFirecrawlWebsiteCrawlArgs = WebsiteIngestionJobIdArgs & {
  providerJobId: string;
  commitChanges?: boolean;
};

type ImportCloudflareWebsiteCrawlArgs = WebsiteIngestionJobIdArgs & {
  cloudflareJobId: string;
  crawlMode: string;
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

const CLOUDFLARE_CRAWL_MAX_ATTEMPTS = 5;
const CLOUDFLARE_CRAWL_RETRY_DELAY_MS = 1_000;
const WEBSITE_CRAWL_STALL_WINDOW_MS = 30 * 60 * 1_000;
const WEBSITE_CRAWL_HARD_TIMEOUT_MS = 2 * 60 * 60 * 1_000;
const WEBSITE_CRAWL_PARTIAL_COMPLETION_GRACE_MS = 5 * 60 * 1_000;
const WEBSITE_CRAWL_RESULTS_NOT_READY_MESSAGE =
  "Website crawl results are still becoming available.";
const FIRECRAWL_DISCOVERY_PAGE_LIMIT_MULTIPLIER = 4;
const FIRECRAWL_DISCOVERY_MAX_PAGE_LIMIT = 120;
const FIRECRAWL_SCRAPE_WAIT_FOR_MS = 2_000;
const FIRECRAWL_PROGRESS_TOTAL = 100;
const FIRECRAWL_DISCOVERY_PROGRESS_MAX = 68;
const FIRECRAWL_SCRAPE_PROGRESS_MAX = 90;
const FIRECRAWL_INDEXING_PROGRESS_VALUE = 92;

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

function requireCloudflareCredentials(): {
  accountId: string;
  apiToken: string;
} {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim();

  if (!accountId || !apiToken) {
    throw new Error("Cloudflare website ingestion is not configured.");
  }

  return { accountId, apiToken };
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

function getCloudflareCrawlEndpoint(input: {
  accountId: string;
  cloudflareJobId?: string;
  cursor?: string | number;
  limit?: number;
  status?: string;
  cacheTTL?: number;
}): string {
  const baseUrl = `https://api.cloudflare.com/client/v4/accounts/${input.accountId}/browser-rendering/crawl`;
  const url = new URL(input.cloudflareJobId ? `${baseUrl}/${input.cloudflareJobId}` : baseUrl);

  if (input.cursor !== undefined) {
    url.searchParams.set("cursor", String(input.cursor));
  }
  if (input.limit !== undefined) {
    url.searchParams.set("limit", String(input.limit));
  }
  if (input.status !== undefined) {
    url.searchParams.set("status", input.status);
  }
  if (input.cacheTTL !== undefined) {
    url.searchParams.set("cacheTTL", String(input.cacheTTL));
  }

  return url.toString();
}

async function readCloudflareResult<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as {
    success?: boolean;
    result?: T;
    errors?: Array<{ message?: string }>;
    messages?: Array<{ message?: string }>;
  };

  if (!response.ok || payload.success === false || payload.result === undefined) {
    const message =
      payload.errors?.map((error) => error.message).find(Boolean) ??
      payload.messages?.map((item) => item.message).find(Boolean) ??
      `Cloudflare crawl request failed with status ${response.status}.`;
    throw new Error(message);
  }

  return payload.result;
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

function isRetriableCloudflareCrawlError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);

  return (
    /Durable Object exceeded its CPU time limit and was reset/iu.test(message) ||
    /Cloudflare crawl request failed with status (408|429|500|502|503|504)/iu.test(message) ||
    /fetch failed/iu.test(message)
  );
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function parseIsoTimestamp(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function getCloudflareProcessedPageCount(input: {
  finished?: number | undefined;
  skipped?: number | undefined;
  total?: number | null;
}): number {
  const rawProcessedCount = Math.max(0, (input.finished ?? 0) + (input.skipped ?? 0));
  if (typeof input.total === "number" && input.total > 0) {
    return Math.min(input.total, rawProcessedCount);
  }

  return rawProcessedCount;
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

function hasSuccessfulCloudflarePageResponse(record: CloudflareCrawlRecord): boolean {
  const pageStatus = record.metadata?.status;
  return pageStatus === undefined || (pageStatus >= 200 && pageStatus < 300);
}

function isTerminalCloudflareCrawlRecordStatus(status: CloudflareCrawlRecord["status"]): boolean {
  return (
    status === undefined ||
    status === "completed" ||
    status === "cancelled" ||
    typeof status === "number"
  );
}

function isAcceptablePartialBrowserCrawl(input: {
  allowPartial?: boolean;
  expectedPageLimit: number;
  crawlMode: string;
  processedCount: number;
  records?: Array<CloudflareCrawlRecord>;
  total: number | null;
}): boolean {
  if (
    input.crawlMode !== WEBSITE_CRAWL_BROWSER_MODE ||
    input.total === null ||
    input.total <= 1 ||
    input.total > input.expectedPageLimit
  ) {
    return false;
  }

  const remainingCount = input.total - input.processedCount;
  if (remainingCount !== 1) {
    return false;
  }

  if (input.allowPartial !== true) {
    return false;
  }

  if (!input.records) {
    return true;
  }

  const returnedRecordCount = input.records.length;
  const completedRecordCount = input.records.filter((record) => {
    return record.status === "completed" || record.status === 200;
  }).length;

  return returnedRecordCount >= input.processedCount && completedRecordCount > 0;
}

function formatKnowledgeStorageLimit(limitBytes: number): string {
  if (limitBytes >= 1024 * 1024 * 1024) {
    return `${limitBytes / (1024 * 1024 * 1024)} GB`;
  }

  return `${limitBytes / (1024 * 1024)} MB`;
}

async function fetchCloudflareCrawlResult(input: {
  cloudflareJobId: string;
  cursor?: string;
  limit?: number;
  status?: string;
  cacheTTL?: number;
}): Promise<CloudflareCrawlResult> {
  const { accountId, apiToken } = requireCloudflareCredentials();
  let lastError: unknown;

  for (let attempt = 1; attempt <= CLOUDFLARE_CRAWL_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(
        getCloudflareCrawlEndpoint({
          accountId,
          cloudflareJobId: input.cloudflareJobId,
          ...(input.cursor !== undefined ? { cursor: input.cursor } : {}),
          ...(input.limit !== undefined ? { limit: input.limit } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.cacheTTL !== undefined ? { cacheTTL: input.cacheTTL } : {}),
        }),
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${apiToken}`,
          },
        },
      );

      return await readCloudflareResult<CloudflareCrawlResult>(response);
    } catch (error) {
      lastError = error;

      if (
        attempt === CLOUDFLARE_CRAWL_MAX_ATTEMPTS ||
        !isRetriableCloudflareCrawlError(error)
      ) {
        throw error;
      }

      await sleep(CLOUDFLARE_CRAWL_RETRY_DELAY_MS * attempt);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Cloudflare crawl request failed.");
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

    const scrapeJob = await ctx.runMutation(firecrawlScrape.api.lib.startScrape, {
      url: candidate.sourceUrl,
      apiKey: requireFirecrawlApiKey(),
      options: {
        formats: ["markdown"],
        ttlMs: 0,
        force: true,
        onlyMainContent: true,
        waitFor: FIRECRAWL_SCRAPE_WAIT_FOR_MS,
        proxy: "auto",
      },
    });

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

    return {
      providerJobId: crawl.id,
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
    const crawl = await client.getCrawlStatus(args.providerJobId, {
      autoPaginate: false,
    });

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

    await ctx.runMutation(internal.ai.context.websiteIngestion.patchWebsiteIngestionJob, {
      websiteIngestionJobId: args.websiteIngestionJobId,
      crawlFinishedCount: progressValue,
      crawlTotalCount: FIRECRAWL_PROGRESS_TOTAL,
      ...(progressAdvanced || !job.lastProgressAt ? { lastProgressAt: nowIso } : {}),
    });

    return {
      status:
        crawl.status === "scraping"
          ? "running"
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
    const crawl = await client.getCrawlStatus(args.providerJobId);

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

    const existingWebsiteDocuments = filterWebsiteDocumentsForScope(
      await listExistingWebsiteDocuments(ctx, job.businessId),
      job.websiteUrl,
    );
    const existingDocumentsBySourceUrl = new Map(
      existingWebsiteDocuments
        .filter((document): document is Doc<"knowledge_documents"> & { sourceUrl: string } =>
          typeof document.sourceUrl === "string",
        )
        .map((document) => [document.sourceUrl, document]),
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

    const documentsToIndex: Array<{
      documentId: Id<"knowledge_documents">;
      skipSnapshotRefresh: true;
    }> = [];
    const staleDocuments =
      crawledSourceUrls.size > 0
        ? existingWebsiteDocuments.filter(
            (document) => document.sourceUrl && !crawledSourceUrls.has(document.sourceUrl),
          )
        : [];
    const staleDocumentReclaimedBytes = (
      await Promise.all(
        staleDocuments.map(async (document) => await getKnowledgeDocumentStorageBytes(ctx, document)),
      )
    ).reduce((total, byteLength) => total + byteLength, 0);

    for (const [sourceUrl, record] of scrapeResults.recordsBySourceUrl) {
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

export const submitCloudflareWebsiteCrawl = internalAction({
  args: {
    websiteIngestionJobId: v.id("website_ingestion_jobs"),
    render: v.boolean(),
    crawlTargetUrl: v.optional(v.string()),
    pageLimit: v.optional(v.number()),
    depth: v.optional(v.number()),
  },
  handler: async (
    ctx: ActionCtx,
    args: SubmitCloudflareWebsiteCrawlArgs,
  ): Promise<{ cloudflareJobId: string; crawlMode: string }> => {
    const job = await loadWebsiteIngestionJobRecord(ctx, args.websiteIngestionJobId);
    const crawlTargetUrl = args.crawlTargetUrl
      ? normalizeWebsitePageUrl(args.crawlTargetUrl, job.websiteUrl)
      : job.websiteUrl;

    if (!crawlTargetUrl) {
      throw new Error("Priority website crawl target must stay on the submitted website.");
    }

    const crawlBudget = resolveWebsiteCrawlBudget({
      render: args.render,
      pageLimit: args.pageLimit ?? job.pageLimit,
      depth: args.depth ?? job.depth,
    });
    await assertWebsiteCrawlTargetIsPublic(crawlTargetUrl);
    const { accountId, apiToken } = requireCloudflareCredentials();
    const response = await fetch(
      getCloudflareCrawlEndpoint({
        accountId,
      }),
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: crawlTargetUrl,
          limit: crawlBudget.pageLimit,
          depth: crawlBudget.depth,
          source: "all",
          formats: ["markdown"],
          crawlPurposes: ["ai-input"],
          render: args.render,
          options: {
            includeExternalLinks: false,
            includeSubdomains: false,
            includePatterns: buildWebsiteCrawlIncludePatterns(crawlTargetUrl),
            excludePatterns: buildWebsiteCrawlExcludePatterns(crawlTargetUrl),
          },
        }),
      },
    );

    const cloudflareJobId = await readCloudflareResult<string>(response);
    return {
      cloudflareJobId,
      crawlMode: args.render ? WEBSITE_CRAWL_BROWSER_MODE : WEBSITE_CRAWL_HTTP_MODE,
    };
  },
});

export const cancelCloudflareWebsiteCrawlJob = internalAction({
  args: {
    cloudflareJobId: v.string(),
  },
  handler: async (_ctx: ActionCtx, args: { cloudflareJobId: string }): Promise<null> => {
    const { accountId, apiToken } = requireCloudflareCredentials();
    const response = await fetch(
      getCloudflareCrawlEndpoint({
        accountId,
        cloudflareJobId: args.cloudflareJobId,
      }),
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${apiToken}`,
        },
      },
    );

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as
        | {
          errors?: Array<{ message?: string }>;
          messages?: Array<{ message?: string }>;
        }
        | null;
      const message =
        payload?.errors?.map((error) => error.message).find(Boolean) ??
        payload?.messages?.map((item) => item.message).find(Boolean) ??
        `Cloudflare crawl cancel request failed with status ${response.status}.`;
      throw new Error(message);
    }

    return null;
  },
});

export const getCloudflareWebsiteCrawlJobStatus = internalAction({
  args: {
    websiteIngestionJobId: v.id("website_ingestion_jobs"),
    cloudflareJobId: v.string(),
  },
  handler: async (
    ctx: ActionCtx,
    args: WebsiteIngestionJobIdArgs & { cloudflareJobId: string },
  ): Promise<{ status: string; finished: number; total: number | null; skipped: number }> => {
    const job = await loadWebsiteIngestionJobRecord(ctx, args.websiteIngestionJobId);
    const result = await fetchCloudflareCrawlResult({
      cloudflareJobId: args.cloudflareJobId,
      limit: 1,
      cacheTTL: 0,
    });

    const finished = result.finished ?? 0;
    const skipped = result.skipped ?? 0;
    const total = typeof result.total === "number" ? result.total : null;
    const processedCount = getCloudflareProcessedPageCount({
      finished,
      skipped,
      total,
    });
    const nowIso = new Date().toISOString();
    const previousProcessedCount = job.crawlFinishedCount ?? 0;
    const progressAdvanced = processedCount > previousProcessedCount;
    const nextLastProgressAt = progressAdvanced
      ? nowIso
      : (job.lastProgressAt ?? job.startedAt ?? nowIso);
    const expectedBrowserCrawlBudget = resolveWebsiteCrawlBudget({
      render: true,
      pageLimit: job.pageLimit,
      depth: job.depth,
    });

    await ctx.runMutation(internal.ai.context.websiteIngestion.patchWebsiteIngestionJob, {
      websiteIngestionJobId: args.websiteIngestionJobId,
      crawlFinishedCount: processedCount,
      ...(total !== null ? { crawlTotalCount: total } : {}),
      ...(progressAdvanced || !job.lastProgressAt ? { lastProgressAt: nextLastProgressAt } : {}),
    });

    const startedAtMs = parseIsoTimestamp(job.startedAt) ?? Date.now();
    const lastProgressAtMs = parseIsoTimestamp(nextLastProgressAt) ?? startedAtMs;
    const elapsedMs = Date.now() - startedAtMs;
    const stalledForMs = Date.now() - lastProgressAtMs;

    let status = result.status ?? "errored";
    const fullyProcessed = total !== null && total > 0 && processedCount >= total;
    const partiallyCompleteAfterGrace = isAcceptablePartialBrowserCrawl({
      allowPartial: stalledForMs >= WEBSITE_CRAWL_PARTIAL_COMPLETION_GRACE_MS,
      expectedPageLimit: expectedBrowserCrawlBudget.pageLimit,
      crawlMode: job.crawlMode,
      processedCount,
      total,
    });

    if (fullyProcessed || partiallyCompleteAfterGrace) {
      status = "completed";
    } else {
      if (
        status === "completed" &&
        job.crawlMode === WEBSITE_CRAWL_BROWSER_MODE &&
        total !== null &&
        processedCount < total
      ) {
        status = "running";
      }

      if (status === "running") {
        if (stalledForMs >= WEBSITE_CRAWL_STALL_WINDOW_MS) {
          status = "stalled";
        } else if (elapsedMs >= WEBSITE_CRAWL_HARD_TIMEOUT_MS) {
          status = "timed_out";
        }
      }
    }

    return {
      status,
      finished: processedCount,
      total,
      skipped,
    };
  },
});

export const importCloudflareWebsiteCrawlResults = internalAction({
  args: {
    websiteIngestionJobId: v.id("website_ingestion_jobs"),
    cloudflareJobId: v.string(),
    crawlMode: v.string(),
    commitChanges: v.optional(v.boolean()),
  },
  handler: async (
    ctx: ActionCtx,
    args: ImportCloudflareWebsiteCrawlArgs,
  ): Promise<WebsiteImportSummary> => {
    const commitChanges = args.commitChanges ?? true;
    const job = await loadWebsiteIngestionJobRecord(ctx, args.websiteIngestionJobId);
    const existingWebsiteDocuments = filterWebsiteDocumentsForScope(
      await listExistingWebsiteDocuments(ctx, job.businessId),
      job.websiteUrl,
    );
    const existingDocumentsBySourceUrl = new Map(
      existingWebsiteDocuments
        .filter((document): document is Doc<"knowledge_documents"> & { sourceUrl: string } =>
          typeof document.sourceUrl === "string",
        )
        .map((document) => [document.sourceUrl, document]),
    );
    let cursor: string | undefined;
    const seenCursors = new Set<string>();
    let crawlStatus: string | undefined;
    let crawlTotal: number | null = null;
    let crawlProcessedCount = 0;
    let sawNonCompletedRecords = false;
    let resultPaginationIncomplete = false;
    const crawlRecords: Array<CloudflareCrawlRecord> = [];

    do {
      // Cloudflare recommends fetching terminal crawl results without a limit so the
      // provider can return the full dataset and only paginate when the payload exceeds
      // its response-size threshold.
      const result = await fetchCloudflareCrawlResult({
        cloudflareJobId: args.cloudflareJobId,
        ...(cursor !== undefined ? { cursor } : {}),
        cacheTTL: 0,
      });
      crawlStatus = result.status ?? crawlStatus;
      if (typeof result.total === "number") {
        crawlTotal = Math.max(crawlTotal ?? 0, result.total);
      }
      crawlProcessedCount = Math.max(
        crawlProcessedCount,
        getCloudflareProcessedPageCount({
          finished: result.finished,
          skipped: result.skipped,
          total: typeof result.total === "number" ? result.total : crawlTotal,
        }),
      );
      for (const record of result.records ?? []) {
        if (
          record.status !== undefined &&
          record.status !== "completed" &&
          record.status !== 200
        ) {
          sawNonCompletedRecords = true;
        }
        crawlRecords.push(record);
      }
      const nextCursor =
        result.cursor === undefined || result.cursor === null
          ? undefined
          : String(result.cursor).trim();
      if (!nextCursor) {
        cursor = undefined;
        continue;
      }
      if (seenCursors.has(nextCursor)) {
        resultPaginationIncomplete = true;
        cursor = undefined;
        break;
      }
      seenCursors.add(nextCursor);
      cursor = nextCursor;
    } while (cursor);

    const crawlFullyProcessed =
      crawlTotal !== null && crawlTotal > 0 && crawlProcessedCount >= crawlTotal;
    const returnedAllExpectedRecords =
      crawlTotal !== null && crawlTotal > 0 && crawlRecords.length >= crawlTotal;
    const returnedRecordsAreTerminal =
      crawlRecords.length > 0 &&
      crawlRecords.every((record) => isTerminalCloudflareCrawlRecordStatus(record.status));
    const importLastProgressAtMs =
      parseIsoTimestamp(job.lastProgressAt ?? job.startedAt) ?? Date.now();
    const shouldWaitForCompleteBrowserRecords =
      args.crawlMode === WEBSITE_CRAWL_BROWSER_MODE && job.fallbackTriggered === true;
    const browserResultsSettledAfterGrace =
      shouldWaitForCompleteBrowserRecords &&
      Date.now() - importLastProgressAtMs >= WEBSITE_CRAWL_PARTIAL_COMPLETION_GRACE_MS &&
      crawlFullyProcessed &&
      crawlRecords.length > 0 &&
      returnedRecordsAreTerminal;
    const partialBrowserCrawlCompleted = isAcceptablePartialBrowserCrawl({
      allowPartial:
        Date.now() - importLastProgressAtMs >= WEBSITE_CRAWL_PARTIAL_COMPLETION_GRACE_MS,
      expectedPageLimit: resolveWebsiteCrawlBudget({
        render: true,
        pageLimit: job.pageLimit,
        depth: job.depth,
      }).pageLimit,
      crawlMode: args.crawlMode,
      processedCount: crawlProcessedCount,
      records: crawlRecords,
      total: crawlTotal,
    });
    const providerCrawlCompleted =
      crawlStatus === "completed" || crawlFullyProcessed || partialBrowserCrawlCompleted;
    const paginationBlockedIncompleteResults =
      resultPaginationIncomplete && !returnedAllExpectedRecords && !browserResultsSettledAfterGrace;
    const crawlResultsReady =
      !paginationBlockedIncompleteResults &&
      (!shouldWaitForCompleteBrowserRecords ||
        crawlTotal === null ||
        (returnedAllExpectedRecords && returnedRecordsAreTerminal) ||
        browserResultsSettledAfterGrace ||
        partialBrowserCrawlCompleted);
    const crawlCompleted =
      providerCrawlCompleted && crawlResultsReady;

    if (!crawlCompleted) {
      if (providerCrawlCompleted && !crawlResultsReady) {
        return {
          importedDocumentCount: 0,
          resultsReady: false,
          weak: false,
        };
      }
      throw new Error(`Website crawl job is ${crawlStatus ?? "not ready"} and cannot be imported.`);
    }

    const dedupedRecords = new Map<
      string,
      { title: string; markdown: string; byteLength: number }
    >();

    for (const record of crawlRecords) {
      if (!record.url || typeof record.markdown !== "string") {
        continue;
      }

      if (
        record.status !== undefined &&
        record.status !== "completed" &&
        record.status !== 200
      ) {
        continue;
      }
      if (!hasSuccessfulCloudflarePageResponse(record)) {
        continue;
      }

      const pageUrl = normalizeWebsitePageUrl(record.url, job.websiteUrl);
      if (!pageUrl) {
        continue;
      }

      if (!shouldImportWebsitePage({ pageUrl, markdown: record.markdown })) {
        continue;
      }

      const normalizedMarkdown = normalizeWebsiteMarkdown(record.markdown);
      const candidate = {
        title: buildWebsiteDocumentTitle({
          pageUrl,
          title: record.metadata?.title,
        }),
        markdown: normalizedMarkdown,
        byteLength: countUtf8Bytes(normalizedMarkdown),
      };
      const existing = dedupedRecords.get(pageUrl);

      if (!existing || candidate.byteLength > existing.byteLength) {
        dedupedRecords.set(pageUrl, candidate);
      }
    }

    const documentsToIndex: Array<{
      documentId: Id<"knowledge_documents">;
      skipSnapshotRefresh: true;
    }> = [];
    const crawledSourceUrls = new Set<string>();
    let importedDocumentCount = 0;
    let totalMarkdownBytes = 0;

    for (const record of crawlRecords) {
      if (
        !record.url ||
        (record.status !== undefined &&
          record.status !== "completed" &&
          record.status !== 200)
      ) {
        continue;
      }
      if (!hasSuccessfulCloudflarePageResponse(record)) {
        continue;
      }

      const pageUrl = normalizeWebsitePageUrl(record.url, job.websiteUrl);
      if (!pageUrl) {
        continue;
      }

      crawledSourceUrls.add(pageUrl);
    }

    for (const [sourceUrl, candidate] of dedupedRecords) {
      importedDocumentCount += 1;
      totalMarkdownBytes += candidate.byteLength;
    }

    const canPruneMissingDocuments =
      crawlTotal !== null && crawlTotal < job.pageLimit && !sawNonCompletedRecords;
    const staleDocuments =
      canPruneMissingDocuments && crawledSourceUrls.size > 0
        ? existingWebsiteDocuments.filter(
            (document) => document.sourceUrl && !crawledSourceUrls.has(document.sourceUrl),
          )
        : [];

    if (!commitChanges) {
      return {
        importedDocumentCount,
        resultsReady: true,
        weak: shouldTriggerBrowserFallback({
          importedPageCount: importedDocumentCount,
          totalMarkdownBytes,
        }),
      };
    }

    const staleDocumentReclaimedBytes = (
      await Promise.all(
        staleDocuments.map(async (document) => await getKnowledgeDocumentStorageBytes(ctx, document)),
      )
    ).reduce((total, byteLength) => total + byteLength, 0);

    for (const [sourceUrl, candidate] of dedupedRecords) {
      const contentHash = await sha256Hex(candidate.markdown);
      const existingDocument = existingDocumentsBySourceUrl.get(sourceUrl) ?? null;
      const existingDocumentIsActive = existingDocument ? isKnowledgeDocumentActive(existingDocument) : false;

      if (existingDocument?.contentHash === contentHash && isIndexedWebsiteDocumentCurrent(existingDocument)) {
        await ctx.runMutation(
          internal.ai.context.websiteIngestion.updateWebsiteKnowledgeDocument,
          {
            documentId: existingDocument._id,
            websiteIngestionJobId: args.websiteIngestionJobId,
            title: candidate.title,
            sourceUrl,
          },
        );
        continue;
      }

      if (existingDocument?.contentHash === contentHash) {
        await ctx.runMutation(
          internal.ai.context.websiteIngestion.updateWebsiteKnowledgeDocument,
          {
            documentId: existingDocument._id,
            websiteIngestionJobId: args.websiteIngestionJobId,
            title: candidate.title,
            sourceUrl,
            ...(existingDocumentIsActive
              ? {
                  status: "queued",
                  processingProgress: 0,
                }
              : {}),
          },
        );
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
        additionalBytes: candidate.byteLength,
        reclaimedBytes,
      });

      const extractedTextStorageId = await ctx.storage.store(
        new Blob([candidate.markdown], {
          type: "text/markdown;charset=utf-8",
        }),
      );

	      try {
	        if (existingDocument) {
	          await ctx.runMutation(
            internal.ai.context.websiteIngestion.updateWebsiteKnowledgeDocument,
            {
              documentId: existingDocument._id,
              websiteIngestionJobId: args.websiteIngestionJobId,
              title: candidate.title,
              sourceUrl,
              textContent: buildKnowledgeDocumentPreviewText(candidate.markdown),
              extractedTextStorageId,
              contentHash,
              importance: computeWebsiteDocumentImportance(sourceUrl),
              ...(existingDocumentIsActive
                ? {
                    status: "queued",
                    processingProgress: 0,
                  }
                : {}),
            },
          );
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
              title: candidate.title,
              textContent: buildKnowledgeDocumentPreviewText(candidate.markdown),
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

    await ctx.runMutation(internal.ai.context.websiteIngestion.patchWebsiteIngestionJob, {
      websiteIngestionJobId: args.websiteIngestionJobId,
      status: documentsToIndex.length > 0 ? "indexing" : "crawling",
      crawlMode: args.crawlMode,
      importedCount: totalImportedDocumentCount,
      lastError: null,
    });

    return {
      importedDocumentCount,
      resultsReady: true,
      weak: shouldTriggerBrowserFallback({
        importedPageCount: importedDocumentCount,
        totalMarkdownBytes,
      }),
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

      if (job.status === "queued" || !job.cloudflareJobId) {
        const crawl = await ctx.runAction(
          internal.ai.context.websiteIngestionActions.submitCloudflareWebsiteCrawl,
          {
            websiteIngestionJobId: args.websiteIngestionJobId,
            render: job.crawlMode === WEBSITE_CRAWL_BROWSER_MODE || job.fallbackTriggered,
          },
        );

        await ctx.runMutation(internal.ai.context.websiteIngestion.patchWebsiteIngestionJob, {
          websiteIngestionJobId: args.websiteIngestionJobId,
          status: "crawling",
          cloudflareJobId: crawl.cloudflareJobId,
          crawlMode: crawl.crawlMode,
          startedAt: job.startedAt ?? nowIso,
          lastProgressAt: nowIso,
          crawlFinishedCount: 0,
          crawlTotalCount: 0,
          lastError: null,
        });

        return { status: "crawling" };
      }

      const crawlStatus = await ctx.runAction(
        internal.ai.context.websiteIngestionActions.getCloudflareWebsiteCrawlJobStatus,
        {
          websiteIngestionJobId: args.websiteIngestionJobId,
          cloudflareJobId: job.cloudflareJobId,
        },
      );

      const previousFinished = job.crawlFinishedCount ?? 0;
      const progressAdvanced = crawlStatus.finished > previousFinished;
      const nextLastProgressAt = progressAdvanced
        ? nowIso
        : (job.lastProgressAt ?? job.startedAt ?? nowIso);

      await ctx.runMutation(internal.ai.context.websiteIngestion.patchWebsiteIngestionJob, {
        websiteIngestionJobId: args.websiteIngestionJobId,
        crawlFinishedCount: crawlStatus.finished,
        ...(crawlStatus.total !== null ? { crawlTotalCount: crawlStatus.total } : {}),
        ...(progressAdvanced ? { lastProgressAt: nowIso } : {}),
      });

      const startedAtMs = parseIsoTimestamp(job.startedAt) ?? Date.now();
      const lastProgressAtMs = parseIsoTimestamp(nextLastProgressAt) ?? startedAtMs;
      const elapsedMs = Date.now() - startedAtMs;
      const stalledForMs = Date.now() - lastProgressAtMs;
      const crawlCompleted =
        crawlStatus.status === "completed" ||
        (crawlStatus.total !== null &&
          crawlStatus.total > 0 &&
          crawlStatus.finished >= crawlStatus.total);

      if (!crawlCompleted) {
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

        await markWebsiteIngestionJobFailed(
          ctx,
          args.websiteIngestionJobId,
          `Website crawl ended with status ${crawlStatus.status}.`,
        );
        return { status: "failed" };
      }

      let importSummary: WebsiteImportSummary;

      if (job.crawlMode === WEBSITE_CRAWL_HTTP_MODE && !job.fallbackTriggered) {
        const dryRunSummary = await ctx.runAction(
          internal.ai.context.websiteIngestionActions.importCloudflareWebsiteCrawlResults,
          {
            websiteIngestionJobId: args.websiteIngestionJobId,
            cloudflareJobId: job.cloudflareJobId,
            crawlMode: WEBSITE_CRAWL_HTTP_MODE,
            commitChanges: false,
          },
        );

        if (dryRunSummary.resultsReady === false) {
          return { status: "crawling" };
        }

        if (dryRunSummary.weak) {
          const browserCrawlBudget = resolveWebsiteCrawlBudget({
            render: true,
            pageLimit: job.pageLimit,
            depth: job.depth,
          });
          const browserCrawl = await ctx.runAction(
            internal.ai.context.websiteIngestionActions.submitCloudflareWebsiteCrawl,
            {
              websiteIngestionJobId: args.websiteIngestionJobId,
              render: true,
            },
          );

          await ctx.runMutation(internal.ai.context.websiteIngestion.patchWebsiteIngestionJob, {
            websiteIngestionJobId: args.websiteIngestionJobId,
            status: "crawling",
            cloudflareJobId: browserCrawl.cloudflareJobId,
            crawlMode: browserCrawl.crawlMode,
            fallbackTriggered: true,
            pageLimit: browserCrawlBudget.pageLimit,
            depth: browserCrawlBudget.depth,
            crawlFinishedCount: 0,
            crawlTotalCount: 0,
            lastProgressAt: nowIso,
            lastError: null,
          });

          return { status: "crawling" };
        }

        importSummary = await ctx.runAction(
          internal.ai.context.websiteIngestionActions.importCloudflareWebsiteCrawlResults,
          {
            websiteIngestionJobId: args.websiteIngestionJobId,
            cloudflareJobId: job.cloudflareJobId,
            crawlMode: WEBSITE_CRAWL_HTTP_MODE,
            commitChanges: true,
          },
        );
      } else {
        importSummary = await ctx.runAction(
          internal.ai.context.websiteIngestionActions.importCloudflareWebsiteCrawlResults,
          {
            websiteIngestionJobId: args.websiteIngestionJobId,
            cloudflareJobId: job.cloudflareJobId,
            crawlMode: job.crawlMode,
            commitChanges: true,
          },
        );
      }

      if (importSummary.resultsReady === false) {
        return { status: "crawling" };
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
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Website import failed unexpectedly.";

      if (message === WEBSITE_CRAWL_RESULTS_NOT_READY_MESSAGE) {
        return { status: "crawling" };
      }

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
