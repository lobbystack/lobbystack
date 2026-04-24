"use node";

import { lookup } from "node:dns/promises";

import { v } from "convex/values";

import { internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import { internalAction, type ActionCtx } from "../../_generated/server";
import { getKnowledgeStorageLimitBytes } from "../../lib/billing";
import { bulkWorkpool, KNOWLEDGE_INDEX_VERSION, rag } from "../../lib/components";
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
  shouldTriggerBrowserFallback,
  WEBSITE_CRAWL_BROWSER_MODE,
  WEBSITE_CRAWL_HTTP_MODE,
  WEBSITE_PUBLIC_URL_ERROR_MESSAGE,
} from "../../lib/websiteIngestion";

type WebsiteIngestionJobIdArgs = {
  websiteIngestionJobId: Id<"website_ingestion_jobs">;
};

type WebsiteKnowledgeSourceArgs = {
  businessId: Id<"businesses">;
  sourceUrl: string;
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

const CLOUDFLARE_CRAWL_MAX_ATTEMPTS = 5;
const CLOUDFLARE_CRAWL_RETRY_DELAY_MS = 1_000;
const WEBSITE_CRAWL_STALL_WINDOW_MS = 30 * 60 * 1_000;
const WEBSITE_CRAWL_HARD_TIMEOUT_MS = 2 * 60 * 60 * 1_000;
const WEBSITE_CRAWL_PARTIAL_COMPLETION_GRACE_MS = 5 * 60 * 1_000;
const WEBSITE_CRAWL_RESULTS_NOT_READY_MESSAGE =
  "Website crawl results are still becoming available.";

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
    requireCloudflareCredentials();
    await assertWebsiteCrawlTargetIsPublic(websiteUrl);
    return websiteUrl;
  },
});

export const submitCloudflareWebsiteCrawl = internalAction({
  args: {
    websiteIngestionJobId: v.id("website_ingestion_jobs"),
    render: v.boolean(),
  },
  handler: async (
    ctx: ActionCtx,
    args: WebsiteIngestionJobIdArgs & { render: boolean },
  ): Promise<{ cloudflareJobId: string; crawlMode: string }> => {
    const job = await loadWebsiteIngestionJobRecord(ctx, args.websiteIngestionJobId);
    const crawlBudget = resolveWebsiteCrawlBudget({
      render: args.render,
      pageLimit: job.pageLimit,
      depth: job.depth,
    });
    await assertWebsiteCrawlTargetIsPublic(job.websiteUrl);
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
          url: job.websiteUrl,
          limit: crawlBudget.pageLimit,
          depth: crawlBudget.depth,
          source: "all",
          formats: ["markdown"],
          crawlPurposes: ["ai-input"],
          render: args.render,
          options: {
            includeExternalLinks: false,
            includeSubdomains: false,
            includePatterns: buildWebsiteCrawlIncludePatterns(job.websiteUrl),
            excludePatterns: buildWebsiteCrawlExcludePatterns(job.websiteUrl),
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
    const existingWebsiteDocuments = await listExistingWebsiteDocuments(ctx, job.businessId);
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

    await ctx.runMutation(internal.ai.context.websiteIngestion.patchWebsiteIngestionJob, {
      websiteIngestionJobId: args.websiteIngestionJobId,
      status: documentsToIndex.length > 0 ? "indexing" : "crawling",
      crawlMode: args.crawlMode,
      importedCount: importedDocumentCount,
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
