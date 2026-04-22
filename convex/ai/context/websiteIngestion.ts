import { v } from "convex/values";

import type { Doc, Id } from "../../_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../../_generated/server";
import { requireMembership } from "../../lib/auth";

type WebsiteIngestionJobIdArgs = {
  websiteIngestionJobId: Id<"website_ingestion_jobs">;
};

type WebsiteKnowledgeSourceArgs = {
  businessId: Id<"businesses">;
  sourceUrl: string;
};

type PatchWebsiteIngestionJobArgs = WebsiteIngestionJobIdArgs & {
  status?: string;
  cloudflareJobId?: string;
  crawlMode?: string;
  fallbackTriggered?: boolean;
  pageLimit?: number;
  depth?: number;
  importedCount?: number;
  indexedCount?: number;
  errorCount?: number;
  lastError?: string | null;
  startedAt?: string;
  completedAt?: string;
};

type WebsiteDocumentCountSummary = {
  businessId: Id<"businesses">;
  indexed: number;
  error: number;
  pending: number;
};

export const getWebsiteIngestionJob = query({
  args: {
    websiteIngestionJobId: v.id("website_ingestion_jobs"),
  },
  handler: async (ctx: QueryCtx, args: WebsiteIngestionJobIdArgs) => {
    const job = await ctx.db.get(args.websiteIngestionJobId);
    if (!job) {
      return null;
    }

    await requireMembership(ctx, job.businessId);
    return job;
  },
});

export const getWebsiteIngestionJobRecord = internalQuery({
  args: {
    websiteIngestionJobId: v.id("website_ingestion_jobs"),
  },
  handler: async (ctx: QueryCtx, args: WebsiteIngestionJobIdArgs) => {
    return await ctx.db.get(args.websiteIngestionJobId);
  },
});

export const getWebsiteKnowledgeDocumentBySourceUrl = internalQuery({
  args: {
    businessId: v.id("businesses"),
    sourceUrl: v.string(),
  },
  handler: async (ctx: QueryCtx, args: WebsiteKnowledgeSourceArgs) => {
    return await ctx.db
      .query("knowledge_documents")
      .withIndex("by_business_id_and_source_url", (q) =>
        q.eq("businessId", args.businessId).eq("sourceUrl", args.sourceUrl),
      )
      .unique();
  },
});

export const listWebsiteKnowledgeDocumentsForBusiness = internalQuery({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx: QueryCtx, args: { businessId: Id<"businesses"> }) => {
    return await ctx.db
      .query("knowledge_documents")
      .withIndex("by_business_id_and_source_type", (q) =>
        q.eq("businessId", args.businessId).eq("sourceType", "website"),
      )
      .collect();
  },
});

export const getWebsiteIngestionDocumentCounts = internalQuery({
  args: {
    websiteIngestionJobId: v.id("website_ingestion_jobs"),
  },
  handler: async (
    ctx: QueryCtx,
    args: WebsiteIngestionJobIdArgs,
  ): Promise<WebsiteDocumentCountSummary> => {
    const job = await ctx.db.get(args.websiteIngestionJobId);
    if (!job) {
      throw new Error("Website ingestion job not found.");
    }

    const documents = await ctx.db
      .query("knowledge_documents")
      .withIndex("by_website_ingestion_job_id", (q) =>
        q.eq("websiteIngestionJobId", args.websiteIngestionJobId),
      )
      .collect();

    let indexed = 0;
    let error = 0;
    let pending = 0;

    for (const document of documents) {
      if (
        document.status === "indexed" ||
        (document.status === "indexing" && !!document.indexedEntryId)
      ) {
        indexed += 1;
      } else if (document.status === "error") {
        error += 1;
      } else {
        pending += 1;
      }
    }

    return {
      businessId: job.businessId,
      indexed,
      error,
      pending,
    };
  },
});

export const patchWebsiteIngestionJob = internalMutation({
  args: {
    websiteIngestionJobId: v.id("website_ingestion_jobs"),
    status: v.optional(v.string()),
    cloudflareJobId: v.optional(v.string()),
    crawlMode: v.optional(v.string()),
    fallbackTriggered: v.optional(v.boolean()),
    pageLimit: v.optional(v.number()),
    depth: v.optional(v.number()),
    importedCount: v.optional(v.number()),
    indexedCount: v.optional(v.number()),
    errorCount: v.optional(v.number()),
    lastError: v.optional(v.union(v.string(), v.null())),
    startedAt: v.optional(v.string()),
    completedAt: v.optional(v.string()),
  },
  handler: async (ctx: MutationCtx, args: PatchWebsiteIngestionJobArgs) => {
    const patch: Record<string, unknown> = {};

    if (args.status !== undefined) {
      patch.status = args.status;
    }
    if (args.cloudflareJobId !== undefined) {
      patch.cloudflareJobId = args.cloudflareJobId;
    }
    if (args.crawlMode !== undefined) {
      patch.crawlMode = args.crawlMode;
    }
    if (args.fallbackTriggered !== undefined) {
      patch.fallbackTriggered = args.fallbackTriggered;
    }
    if (args.pageLimit !== undefined) {
      patch.pageLimit = args.pageLimit;
    }
    if (args.depth !== undefined) {
      patch.depth = args.depth;
    }
    if (args.importedCount !== undefined) {
      patch.importedCount = args.importedCount;
    }
    if (args.indexedCount !== undefined) {
      patch.indexedCount = args.indexedCount;
    }
    if (args.errorCount !== undefined) {
      patch.errorCount = args.errorCount;
    }
    if (args.lastError !== undefined) {
      patch.lastError = args.lastError ?? undefined;
    }
    if (args.startedAt !== undefined) {
      patch.startedAt = args.startedAt;
    }
    if (args.completedAt !== undefined) {
      patch.completedAt = args.completedAt;
    }

    await ctx.db.patch(args.websiteIngestionJobId, patch as Partial<Doc<"website_ingestion_jobs">>);
    return null;
  },
});

export const createWebsiteKnowledgeDocument = internalMutation({
  args: {
    businessId: v.id("businesses"),
    websiteIngestionJobId: v.id("website_ingestion_jobs"),
    sourceUrl: v.string(),
    title: v.string(),
    textContent: v.string(),
    extractedTextStorageId: v.id("_storage"),
    contentHash: v.string(),
    importance: v.number(),
  },
  handler: async (
    ctx: MutationCtx,
    args: {
      businessId: Id<"businesses">;
      websiteIngestionJobId: Id<"website_ingestion_jobs">;
      sourceUrl: string;
      title: string;
      textContent: string;
      extractedTextStorageId: Id<"_storage">;
      contentHash: string;
      importance: number;
    },
  ) => {
    return await ctx.db.insert("knowledge_documents", {
      businessId: args.businessId,
      section: "knowledge",
      sourceType: "website",
      sourceUrl: args.sourceUrl,
      websiteIngestionJobId: args.websiteIngestionJobId,
      title: args.title,
      extractedTextStorageId: args.extractedTextStorageId,
      mimeType: "text/markdown",
      textContent: args.textContent,
      status: "queued",
      processingProgress: 0,
      tags: [],
      importance: args.importance,
      contentHash: args.contentHash,
    });
  },
});

export const updateWebsiteKnowledgeDocument = internalMutation({
  args: {
    documentId: v.id("knowledge_documents"),
    websiteIngestionJobId: v.id("website_ingestion_jobs"),
    title: v.string(),
    sourceUrl: v.string(),
    textContent: v.optional(v.string()),
    extractedTextStorageId: v.optional(v.id("_storage")),
    contentHash: v.optional(v.string()),
    importance: v.optional(v.number()),
    status: v.optional(v.string()),
    processingProgress: v.optional(v.number()),
  },
  handler: async (
    ctx: MutationCtx,
    args: {
      documentId: Id<"knowledge_documents">;
      websiteIngestionJobId: Id<"website_ingestion_jobs">;
      title: string;
      sourceUrl: string;
      textContent?: string;
      extractedTextStorageId?: Id<"_storage">;
      contentHash?: string;
      importance?: number;
      status?: string;
      processingProgress?: number;
    },
  ) => {
    await ctx.db.patch(args.documentId, {
      websiteIngestionJobId: args.websiteIngestionJobId,
      title: args.title,
      sourceUrl: args.sourceUrl,
      ...(args.textContent !== undefined ? { textContent: args.textContent } : {}),
      ...(args.extractedTextStorageId !== undefined
        ? { extractedTextStorageId: args.extractedTextStorageId }
        : {}),
      ...(args.contentHash !== undefined ? { contentHash: args.contentHash } : {}),
      ...(args.importance !== undefined ? { importance: args.importance } : {}),
      ...(args.status !== undefined ? { status: args.status } : {}),
      ...(args.processingProgress !== undefined
        ? { processingProgress: args.processingProgress }
        : {}),
      mimeType: "text/markdown",
      error: undefined,
    });
    return null;
  },
});
