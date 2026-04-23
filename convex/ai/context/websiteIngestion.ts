import { getAuthUserId } from "@convex-dev/auth/server";
import type { WorkflowId } from "@convex-dev/workflow";
import { v } from "convex/values";

import { internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from "../../_generated/server";
import { workflowManager } from "../../lib/components";
import { requireMembership } from "../../lib/auth";
import {
  WEBSITE_CRAWL_DEPTH,
  WEBSITE_CRAWL_HTTP_MODE,
  WEBSITE_CRAWL_PAGE_LIMIT,
  WEBSITE_INGESTION_PROVIDER,
} from "../../lib/websiteIngestion";

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
  crawlFinishedCount?: number;
  crawlTotalCount?: number;
  lastProgressAt?: string;
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

type WebsiteIngestionListItem = Doc<"website_ingestion_jobs"> & {
  documentCount: number;
  indexedDocumentCount: number;
  errorDocumentCount: number;
  pendingDocumentCount: number;
};

type SubmitWebsiteIngestionArgs = {
  businessId: Id<"businesses">;
  websiteUrl: string;
  nextOnboardingStage?: "phone_number";
};

type DeleteWebsiteIngestionJobArgs = {
  businessId: Id<"businesses">;
  websiteIngestionJobId: Id<"website_ingestion_jobs">;
};

type SubmitWebsiteIngestionResult = {
  status: "submitted";
  websiteUrl: string;
  websiteIngestionJobId: Id<"website_ingestion_jobs">;
};

const ACTIVE_WEBSITE_INGESTION_STATUSES = ["queued", "crawling", "indexing"] as const;

async function assertWebsiteIngestionAccess(
  ctx: ActionCtx,
  businessId: Id<"businesses">,
): Promise<void> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Authentication required.");
  }

  const authUserId = await getAuthUserId(ctx);
  await ctx.runQuery(internal.businesses.catalog.assertCatalogWriteAccess, {
    businessId,
    authSubject: identity.subject,
    ...(authUserId ? { authUserId: String(authUserId) } : {}),
  });
}

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

export const listWebsiteIngestionJobs = query({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (
    ctx: QueryCtx,
    args: { businessId: Id<"businesses"> },
  ): Promise<Array<WebsiteIngestionListItem>> => {
    await requireMembership(ctx, args.businessId);

    const jobs = await ctx.db
      .query("website_ingestion_jobs")
      .withIndex("by_business_id", (q) => q.eq("businessId", args.businessId))
      .collect();

    const jobsWithCounts = await Promise.all(
      jobs.map(async (job) => {
        const documents = await ctx.db
          .query("knowledge_documents")
          .withIndex("by_website_ingestion_job_id", (q) =>
            q.eq("websiteIngestionJobId", job._id),
          )
          .collect();

        let indexedDocumentCount = 0;
        let errorDocumentCount = 0;
        let pendingDocumentCount = 0;

        for (const document of documents) {
          if (document.active === false) {
            indexedDocumentCount += 1;
            continue;
          }

          if (document.status === "indexed") {
            indexedDocumentCount += 1;
          } else if (document.status === "error") {
            errorDocumentCount += 1;
          } else {
            pendingDocumentCount += 1;
          }
        }

        return {
          ...job,
          documentCount: documents.length,
          indexedDocumentCount,
          errorDocumentCount,
          pendingDocumentCount,
        };
      }),
    );

    return jobsWithCounts.sort((left, right) => right._creationTime - left._creationTime);
  },
});

export const submitWebsiteIngestionAfterPreflight = internalMutation({
  args: {
    businessId: v.id("businesses"),
    websiteUrl: v.string(),
    nextOnboardingStage: v.optional(v.literal("phone_number")),
  },
  handler: async (
    ctx: MutationCtx,
    args: SubmitWebsiteIngestionArgs,
  ): Promise<SubmitWebsiteIngestionResult> => {
    await requireMembership(ctx, args.businessId);

    const websiteIngestionJobId = await ctx.db.insert("website_ingestion_jobs", {
      businessId: args.businessId,
      websiteUrl: args.websiteUrl,
      provider: WEBSITE_INGESTION_PROVIDER,
      status: "queued",
      crawlMode: WEBSITE_CRAWL_HTTP_MODE,
      fallbackTriggered: false,
      pageLimit: WEBSITE_CRAWL_PAGE_LIMIT,
      depth: WEBSITE_CRAWL_DEPTH,
      importedCount: 0,
      indexedCount: 0,
      errorCount: 0,
    });

    try {
      const workflowId = await workflowManager.start(
        ctx,
        internal.ai.workflows.runtime.importWebsiteKnowledgeWorkflow,
        {
          websiteIngestionJobId,
        },
      );

      await ctx.db.patch(websiteIngestionJobId, {
        workflowId,
      });

      await ctx.db.patch(args.businessId, {
        websiteUrl: args.websiteUrl,
        ...(args.nextOnboardingStage ? { onboardingStage: args.nextOnboardingStage } : {}),
      });
    } catch (error) {
      await ctx.db.delete(websiteIngestionJobId);
      throw error;
    }

    return {
      status: "submitted",
      websiteUrl: args.websiteUrl,
      websiteIngestionJobId,
    };
  },
});

export const deleteWebsiteIngestionJob = mutation({
  args: {
    businessId: v.id("businesses"),
    websiteIngestionJobId: v.id("website_ingestion_jobs"),
  },
  handler: async (
    ctx: MutationCtx,
    args: DeleteWebsiteIngestionJobArgs,
  ): Promise<null> => {
    await requireMembership(ctx, args.businessId);

    const job = await ctx.db.get(args.websiteIngestionJobId);
    if (!job || job.businessId !== args.businessId) {
      throw new Error("Website import not found.");
    }

    if (job.status !== "failed") {
      throw new Error("Only failed website imports can be deleted.");
    }

    const documents = await ctx.db
      .query("knowledge_documents")
      .withIndex("by_website_ingestion_job_id", (q) =>
        q.eq("websiteIngestionJobId", args.websiteIngestionJobId),
      )
      .collect();

    if (documents.length > 0) {
      throw new Error("This website import already created knowledge documents.");
    }

    if (job.workflowId) {
      await workflowManager.cancel(ctx, job.workflowId as WorkflowId);
    }

    await ctx.db.delete(args.websiteIngestionJobId);
    return null;
  },
});

export const cancelWebsiteIngestionJob = mutation({
  args: {
    businessId: v.id("businesses"),
    websiteIngestionJobId: v.id("website_ingestion_jobs"),
  },
  handler: async (
    ctx: MutationCtx,
    args: DeleteWebsiteIngestionJobArgs,
  ): Promise<null> => {
    await requireMembership(ctx, args.businessId);

    const job = await ctx.db.get(args.websiteIngestionJobId);
    if (!job || job.businessId !== args.businessId) {
      throw new Error("Website import not found.");
    }

    if (job.status === "failed" || job.status === "completed" || job.status === "canceled") {
      throw new Error("Only active website imports can be canceled.");
    }

    const documents = await ctx.db
      .query("knowledge_documents")
      .withIndex("by_website_ingestion_job_id", (q) =>
        q.eq("websiteIngestionJobId", args.websiteIngestionJobId),
      )
      .collect();

    if (documents.length > 0) {
      throw new Error("This website import has already created knowledge documents.");
    }

    if (job.workflowId) {
      await workflowManager.cancel(ctx, job.workflowId as WorkflowId);
    }

    await ctx.db.patch(args.websiteIngestionJobId, {
      status: "canceled",
      completedAt: new Date().toISOString(),
      lastError: undefined,
    });

    return null;
  },
});

export const submitWebsiteIngestion = action({
  args: {
    businessId: v.id("businesses"),
    websiteUrl: v.string(),
  },
  handler: async (
    ctx: ActionCtx,
    args: SubmitWebsiteIngestionArgs,
  ): Promise<SubmitWebsiteIngestionResult> => {
    await assertWebsiteIngestionAccess(ctx, args.businessId);

    const websiteUrl = await ctx.runAction(
      internal.ai.context.websiteIngestionActions.preflightWebsiteCrawlTarget,
      {
        websiteUrl: args.websiteUrl,
      },
    );

    return await ctx.runMutation(
      internal.ai.context.websiteIngestion.submitWebsiteIngestionAfterPreflight,
      {
        businessId: args.businessId,
        websiteUrl,
      },
    );
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

export const listWebsiteIngestionJobsForBusiness = internalQuery({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx: QueryCtx, args: { businessId: Id<"businesses"> }) => {
    return await ctx.db
      .query("website_ingestion_jobs")
      .withIndex("by_business_id", (q) => q.eq("businessId", args.businessId))
      .collect();
  },
});

export const listWebsiteIngestionJobsByStatus = internalQuery({
  args: {
    status: v.string(),
  },
  handler: async (ctx: QueryCtx, args: { status: string }) => {
    return await ctx.db
      .query("website_ingestion_jobs")
      .withIndex("by_status", (q) => q.eq("status", args.status))
      .collect();
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
      if (document.active === false) {
        indexed += 1;
        continue;
      }

      if (document.status === "indexed") {
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
    crawlFinishedCount: v.optional(v.number()),
    crawlTotalCount: v.optional(v.number()),
    lastProgressAt: v.optional(v.string()),
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
    if (args.crawlFinishedCount !== undefined) {
      patch.crawlFinishedCount = args.crawlFinishedCount;
    }
    if (args.crawlTotalCount !== undefined) {
      patch.crawlTotalCount = args.crawlTotalCount;
    }
    if (args.lastProgressAt !== undefined) {
      patch.lastProgressAt = args.lastProgressAt;
    }
    if (args.lastError !== undefined) {
      const normalizedLastError =
        typeof args.lastError === "string" ? args.lastError.trim() : args.lastError;
      patch.lastError = normalizedLastError || undefined;
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

export const resumeWebsiteIngestionJobs = action({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (
    ctx: ActionCtx,
    args: { businessId: Id<"businesses"> },
  ): Promise<{ resumedCount: number }> => {
    await assertWebsiteIngestionAccess(ctx, args.businessId);

    const jobs: Array<Doc<"website_ingestion_jobs">> = await ctx.runQuery(
      internal.ai.context.websiteIngestion.listWebsiteIngestionJobsForBusiness,
      {
        businessId: args.businessId,
      },
    );

    const activeJobs = jobs.filter((job) =>
      ACTIVE_WEBSITE_INGESTION_STATUSES.includes(
        job.status as (typeof ACTIVE_WEBSITE_INGESTION_STATUSES)[number],
      ) && !job.workflowId,
    );

    for (const job of activeJobs) {
      await ctx.runAction(internal.ai.context.websiteIngestionActions.reconcileWebsiteIngestionJob, {
        websiteIngestionJobId: job._id,
      });
    }

    return {
      resumedCount: activeJobs.length,
    };
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
      active: true,
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
