"use node";

import { v } from "convex/values";

import { internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import { internalAction, type ActionCtx } from "../../_generated/server";
import { getKnowledgeStorageLimitBytes } from "../../lib/billing";
import { bulkWorkpool, KNOWLEDGE_INDEX_VERSION, rag } from "../../lib/components";
import { buildKnowledgeDocumentPreviewText } from "../../lib/knowledgeDocuments";
import {
  buildWebsiteCrawlExcludePatterns,
  buildWebsiteCrawlIncludePatterns,
  computeWebsiteDocumentImportance,
  countUtf8Bytes,
  normalizeWebsiteMarkdown,
  normalizeWebsitePageUrl,
  shouldImportWebsitePage,
  shouldTriggerBrowserFallback,
  WEBSITE_CRAWL_BROWSER_MODE,
  WEBSITE_CRAWL_DEPTH,
  WEBSITE_CRAWL_HTTP_MODE,
  WEBSITE_CRAWL_PAGE_LIMIT,
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
    title?: string;
  };
};

type CloudflareCrawlResult = {
  status?: string;
  records?: Array<CloudflareCrawlRecord>;
  cursor?: string;
  total?: number;
};

type WebsiteImportSummary = {
  importedDocumentCount: number;
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
  cursor?: string;
  limit?: number;
  status?: string;
  cacheTTL?: number;
}): string {
  const baseUrl = `https://api.cloudflare.com/client/v4/accounts/${input.accountId}/browser-rendering/crawl`;
  const url = new URL(input.cloudflareJobId ? `${baseUrl}/${input.cloudflareJobId}` : baseUrl);

  if (input.cursor !== undefined) {
    url.searchParams.set("cursor", input.cursor);
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

async function deleteWebsiteKnowledgeDocument(
  ctx: ActionCtx,
  document: Doc<"knowledge_documents">,
): Promise<void> {
  if (document.indexedEntryId) {
    await rag.delete(ctx, { entryId: document.indexedEntryId as never });
  }
  if (document.storageId) {
    await ctx.storage.delete(document.storageId);
  }
  if (document.extractedTextStorageId) {
    await ctx.storage.delete(document.extractedTextStorageId);
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
          limit: job.pageLimit || WEBSITE_CRAWL_PAGE_LIMIT,
          depth: job.depth || WEBSITE_CRAWL_DEPTH,
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

export const getCloudflareWebsiteCrawlJobStatus = internalAction({
  args: {
    websiteIngestionJobId: v.id("website_ingestion_jobs"),
    cloudflareJobId: v.string(),
  },
  handler: async (
    ctx: ActionCtx,
    args: WebsiteIngestionJobIdArgs & { cloudflareJobId: string },
  ): Promise<{ status: string }> => {
    await loadWebsiteIngestionJobRecord(ctx, args.websiteIngestionJobId);
    const result = await fetchCloudflareCrawlResult({
      cloudflareJobId: args.cloudflareJobId,
      limit: 1,
      cacheTTL: 0,
    });
    return {
      status: result.status ?? "errored",
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
    let crawlStatus: string | undefined;
    let crawlTotal: number | null = null;
    let sawNonCompletedRecords = false;
    const crawlRecords: Array<CloudflareCrawlRecord> = [];

    do {
      const result = await fetchCloudflareCrawlResult({
        cloudflareJobId: args.cloudflareJobId,
        ...(cursor !== undefined ? { cursor } : {}),
        limit: 10,
        cacheTTL: 0,
      });
      crawlStatus = result.status ?? crawlStatus;
      if (typeof result.total === "number") {
        crawlTotal = Math.max(crawlTotal ?? 0, result.total);
      }
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
      cursor = result.cursor;
    } while (cursor);

    if (crawlStatus !== "completed") {
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
    const importedSourceUrls = new Set<string>();
    let importedDocumentCount = 0;
    let totalMarkdownBytes = 0;

    for (const [sourceUrl, candidate] of dedupedRecords) {
      importedSourceUrls.add(sourceUrl);
      importedDocumentCount += 1;
      totalMarkdownBytes += candidate.byteLength;
    }

    const canPruneMissingDocuments =
      crawlTotal !== null && crawlTotal < job.pageLimit && !sawNonCompletedRecords;
    const staleDocuments =
      canPruneMissingDocuments && importedSourceUrls.size > 0
        ? existingWebsiteDocuments.filter(
            (document) => document.sourceUrl && !importedSourceUrls.has(document.sourceUrl),
          )
        : [];

    if (!commitChanges) {
      return {
        importedDocumentCount,
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
            status: "queued",
            processingProgress: 0,
          },
        );
        documentsToIndex.push({
          documentId: existingDocument._id,
          skipSnapshotRefresh: true,
        });
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
              status: "queued",
              processingProgress: 0,
            },
          );
          documentsToIndex.push({
            documentId: existingDocument._id,
            skipSnapshotRefresh: true,
          });

          if (existingDocument.extractedTextStorageId) {
            await ctx.storage.delete(existingDocument.extractedTextStorageId);
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
        await ctx.storage.delete(extractedTextStorageId);
        throw error;
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
