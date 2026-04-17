import { createThread } from "@convex-dev/agent";
import { getAuthUserId } from "@convex-dev/auth/server";
import {
  getPostHogBusinessGroupKey,
  getPostHogDistinctIdForBusinessSystem,
} from "../../telemetry/shared";
import { v } from "convex/values";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from "../../_generated/server";
import { api, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { requireIdentity, requireMembership } from "../../lib/auth";
import { getKnowledgeStorageLimitBytes } from "../../lib/billing";
import {
  bulkWorkpool,
  getKnowledgeNamespace,
  highPriorityWorkpool,
  KNOWLEDGE_INDEX_VERSION,
  rag,
  receptionistAgent,
} from "../../lib/components";
import {
  getEmbeddingModelId,
} from "../../lib/providers/embeddings";
import {
  extractGenerationMetrics,
  getNonRealtimeTextModelId,
  withAiTelemetryContext,
} from "../../lib/providers/nonRealtimeText";
import {
  inferKnowledgeDocumentContentTypeFromFileName,
  isSupportedKnowledgeDocumentContentType,
  MAX_KNOWLEDGE_DOCUMENT_UPLOAD_BYTES,
} from "../../lib/knowledgeDocuments";
import { normalizeAttachmentFileName } from "../../lib/messageAttachments";
import {
  knowledgeSectionValidator,
  resolveKnowledgeSection,
  type KnowledgeSection,
} from "../../lib/knowledgeSections";
import { normalizeRuntimeLocale } from "../../lib/runtimeLocale";
import { scheduleSnapshotRefresh } from "../../businesses/admin";
import { captureAiTraceStartedBestEffort } from "../../telemetry/ai";
import { enqueuePostHogEventBestEffort } from "../../telemetry/posthog";

type KnowledgeSearchResult = Array<{ title?: string; text: string }>;
type PreviewKnowledgeAnswer = { text: string; threadId: string };
type BusinessIdArgs = { businessId: Id<"businesses"> };
type SearchKnowledgeArgs = {
  businessId: Id<"businesses">;
  query: string;
  limit?: number;
  channel?: "internal" | "voice" | "dashboard";
};
type PreviewKnowledgeArgs = {
  businessId: Id<"businesses">;
  prompt: string;
};
type DocumentIdArgs = { documentId: Id<"knowledge_documents"> };
type SnippetIdArgs = { snippetId: Id<"knowledge_snippets"> };
type DeleteKnowledgeEntryArgs =
  | {
      businessId: Id<"businesses">;
      documentId: Id<"knowledge_documents">;
      snippetId?: never;
    }
  | {
      businessId: Id<"businesses">;
      snippetId: Id<"knowledge_snippets">;
      documentId?: never;
    };
type MarkDocumentIndexedArgs = {
  documentId: Id<"knowledge_documents">;
  status: string;
  indexedEntryId?: string;
  indexVersion?: string;
  error?: string;
  processingProgress?: number;
};
type MarkSnippetIndexedArgs = {
  snippetId: Id<"knowledge_snippets">;
  indexedEntryId?: string;
  indexVersion?: string;
  error?: string;
};
type UpsertKnowledgeSnippetArgs = {
  businessId: Id<"businesses">;
  snippetId?: Id<"knowledge_snippets">;
  section?: KnowledgeSection;
  title: string;
  content: string;
  tags: Array<string>;
  priority: number;
  active: boolean;
};
type ListKnowledgeArgs = {
  businessId: Id<"businesses">;
  section?: KnowledgeSection;
};
type KnowledgeDocumentViewerContentArgs = {
  businessId: Id<"businesses">;
  documentId: Id<"knowledge_documents">;
};
type CreateKnowledgeDocumentArgs = {
  businessId: Id<"businesses">;
  section?: KnowledgeSection;
  sourceType: string;
  title: string;
  storageId?: Id<"_storage">;
  extractedTextStorageId?: Id<"_storage">;
  mimeType?: string;
  textContent?: string;
  tags: Array<string>;
  importance: number;
  contentHash?: string;
};
type FinalizeKnowledgeDocumentUploadArgs = {
  businessId: Id<"businesses">;
  section?: KnowledgeSection;
  storageId: Id<"_storage">;
  fileName: string;
  title: string;
  tags: Array<string>;
};
type UploadedKnowledgeDocumentMetadata = {
  contentType: string;
  byteLength: number;
};
type KnowledgeReindexState = {
  documentIds: Array<Id<"knowledge_documents">>;
  snippetIds: Array<Id<"knowledge_snippets">>;
};

async function requireKnowledgeAccess(
  ctx: ActionCtx,
  businessId: Id<"businesses">,
): Promise<void> {
  const identity = await requireIdentity(ctx);
  const authUserId = await getAuthUserId(ctx);
  const userId = await ctx.runQuery(internal.users.resolveAuthenticatedUserForBusiness, {
    businessId,
    authSubject: identity.subject,
    ...(authUserId !== null ? { authUserId } : {}),
  });
  if (!userId) {
    throw new Error("User profile not initialized.");
  }
  const membership = await ctx.runQuery(internal.ai.agents.runtime.requireMembershipByUserId, {
    businessId,
    userId,
  });

  if (!membership) {
    throw new Error("Unauthorized.");
  }
}

function formatKnowledgeStorageLimit(limitBytes: number): string {
  if (limitBytes >= 1024 * 1024 * 1024) {
    return `${limitBytes / (1024 * 1024 * 1024)} GB`;
  }

  return `${limitBytes / (1024 * 1024)} MB`;
}

async function assertKnowledgeStorageCapacity(
  ctx: ActionCtx,
  args: {
    businessId: Id<"businesses">;
    additionalBytes: number;
  },
): Promise<void> {
  const billingSnapshot = await ctx.runQuery(internal.billing.getSnapshotForCheckout, {
    businessId: args.businessId,
  });
  const limitBytes = getKnowledgeStorageLimitBytes(billingSnapshot.plan);
  if (limitBytes === null) {
    return;
  }

  const currentUsageBytes = await ctx.runQuery(
    internal.ai.context.knowledge.getKnowledgeStorageUsageBytes,
    {
      businessId: args.businessId,
    },
  );

  if (currentUsageBytes + args.additionalBytes > limitBytes) {
    throw new Error(
      `Knowledge storage limit reached. ${formatKnowledgeStorageLimit(limitBytes)} is included on this plan.`,
    );
  }
}

async function indexKnowledgeDocumentById(
  ctx: ActionCtx,
  documentId: Id<"knowledge_documents">,
): Promise<null> {
  const document = await ctx.runQuery(internal.ai.context.knowledge.getDocumentForIndexing, {
    documentId,
  });

  let indexableText: string | null = document?.textContent ?? null;
  if (document?.extractedTextStorageId) {
    const extractedTextBlob = await ctx.storage.get(document.extractedTextStorageId);
    if (!extractedTextBlob) {
      await ctx.runMutation(internal.ai.context.knowledge.markDocumentIndexed, {
        documentId,
        status: "error",
        error: "Extracted document text could not be loaded.",
        processingProgress: 0,
      });
      return null;
    }

    indexableText = await extractedTextBlob.text();
  }

  if (!document || !indexableText) {
    await ctx.runMutation(internal.ai.context.knowledge.markDocumentIndexed, {
      documentId,
      status: "error",
      error: "No text content available for indexing.",
      processingProgress: 0,
    });
    return null;
  }

  await ctx.runMutation(internal.ai.context.knowledge.setDocumentProcessingProgress, {
    documentId,
    status: "indexing",
    processingProgress: 92,
  });

  try {
    const startedAt = Date.now();
    const result = await rag.add(ctx, {
      namespace: getKnowledgeNamespace(String(document.businessId)),
      title: document.title,
      text: indexableText,
      key: `document:${String(documentId)}`,
      ...(document.contentHash !== undefined ? { contentHash: document.contentHash } : {}),
      filterValues: [
        { name: "businessId", value: String(document.businessId) },
        { name: "sourceType", value: document.sourceType },
        {
          name: "businessAndSource",
          value: {
            businessId: String(document.businessId),
            sourceType: document.sourceType,
          },
        },
      ],
    });

    await ctx.runMutation(internal.ai.context.knowledge.markDocumentIndexed, {
      documentId,
      status: result.status === "ready" ? "indexed" : "indexing",
      indexedEntryId: String(result.entryId),
      indexVersion: KNOWLEDGE_INDEX_VERSION,
      processingProgress: result.status === "ready" ? 100 : 96,
    });
    if (result.status === "ready") {
      await enqueuePostHogEventBestEffort(ctx, {
        eventName: "knowledge.document_indexed",
        businessId: document.businessId,
        distinctId: getPostHogDistinctIdForBusinessSystem(String(document.businessId)),
        groupKey: getPostHogBusinessGroupKey(String(document.businessId)),
        properties: {
          documentId: String(documentId),
          sourceType: document.sourceType,
          section: document.section,
        },
      });
    }
    await enqueuePostHogEventBestEffort(ctx, {
      eventName: "ai.embedding.completed",
      businessId: document.businessId,
      distinctId: getPostHogDistinctIdForBusinessSystem(String(document.businessId)),
      groupKey: getPostHogBusinessGroupKey(String(document.businessId)),
      provider: "google",
      model: getEmbeddingModelId(),
      properties: {
        operation: "knowledge.index_document",
        sourceType: document.sourceType,
        section: document.section,
        inputCharacterCount: indexableText.length,
        inputItemCount: 1,
        latencyMs: Date.now() - startedAt,
      },
    });
    await ctx.runMutation(internal.ai.context.snapshots.refreshSnapshot, {
      businessId: document.businessId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to index this document.";
    await enqueuePostHogEventBestEffort(ctx, {
      eventName: "ai.embedding.failed",
      businessId: document.businessId,
      distinctId: getPostHogDistinctIdForBusinessSystem(String(document.businessId)),
      groupKey: getPostHogBusinessGroupKey(String(document.businessId)),
      provider: "google",
      model: getEmbeddingModelId(),
      properties: {
        operation: "knowledge.index_document",
        sourceType: document.sourceType,
        section: document.section,
        inputCharacterCount: indexableText.length,
        inputItemCount: 1,
        error: message,
      },
    });
    await ctx.runMutation(internal.ai.context.knowledge.markDocumentIndexed, {
      documentId,
      status: "error",
      error: message,
      processingProgress: 0,
    });
  }
  return null;
}

async function indexKnowledgeSnippetById(
  ctx: ActionCtx,
  snippetId: Id<"knowledge_snippets">,
): Promise<string | null> {
  const snippet = await ctx.runQuery(internal.ai.context.knowledge.getSnippetForIndexing, {
    snippetId,
  });

  if (!snippet || !snippet.active) {
    return null;
  }

  try {
    const startedAt = Date.now();
    const result = await rag.add(ctx, {
      namespace: getKnowledgeNamespace(String(snippet.businessId)),
      title: snippet.title,
      text: snippet.content,
      key: `snippet:${String(snippetId)}`,
      contentHash: `${snippet._creationTime}:${snippet.priority}:${snippet.active}`,
      filterValues: [
        { name: "businessId", value: String(snippet.businessId) },
        { name: "sourceType", value: "snippet" },
        {
          name: "businessAndSource",
          value: {
            businessId: String(snippet.businessId),
            sourceType: "snippet",
          },
        },
      ],
    });

    await ctx.runMutation(internal.ai.context.knowledge.markSnippetIndexed, {
      snippetId,
      indexedEntryId: String(result.entryId),
      indexVersion: KNOWLEDGE_INDEX_VERSION,
    });
    await enqueuePostHogEventBestEffort(ctx, {
      eventName: "ai.embedding.completed",
      businessId: snippet.businessId,
      distinctId: getPostHogDistinctIdForBusinessSystem(String(snippet.businessId)),
      groupKey: getPostHogBusinessGroupKey(String(snippet.businessId)),
      provider: "google",
      model: getEmbeddingModelId(),
      properties: {
        operation: "knowledge.index_snippet",
        section: snippet.section,
        inputCharacterCount: snippet.content.length,
        inputItemCount: 1,
        latencyMs: Date.now() - startedAt,
      },
    });
    await ctx.runMutation(internal.ai.context.snapshots.refreshSnapshot, {
      businessId: snippet.businessId,
    });
    return String(result.entryId);
  } catch (error) {
    await enqueuePostHogEventBestEffort(ctx, {
      eventName: "ai.embedding.failed",
      businessId: snippet.businessId,
      distinctId: getPostHogDistinctIdForBusinessSystem(String(snippet.businessId)),
      groupKey: getPostHogBusinessGroupKey(String(snippet.businessId)),
      provider: "google",
      model: getEmbeddingModelId(),
      properties: {
        operation: "knowledge.index_snippet",
        section: snippet.section,
        inputCharacterCount: snippet.content.length,
        inputItemCount: 1,
        error: error instanceof Error ? error.message : "Failed to index knowledge snippet.",
      },
    });
    throw error;
  }
}

async function searchKnowledge(
  ctx: ActionCtx,
  args: SearchKnowledgeArgs,
): Promise<KnowledgeSearchResult> {
  const staleEntries: KnowledgeReindexState = await ctx.runQuery(
    internal.ai.context.knowledge.getKnowledgeEntriesNeedingReindex,
    {
      businessId: args.businessId,
    },
  );

  for (const documentId of staleEntries.documentIds) {
    await indexKnowledgeDocumentById(ctx, documentId);
  }

  for (const snippetId of staleEntries.snippetIds) {
    await indexKnowledgeSnippetById(ctx, snippetId);
  }

  return await searchIndexedKnowledge(ctx, args);
}

async function searchIndexedKnowledge(
  ctx: ActionCtx,
  args: SearchKnowledgeArgs,
): Promise<KnowledgeSearchResult> {
  const startedAt = Date.now();

  try {
    const { entries } = await rag.search(ctx, {
      namespace: getKnowledgeNamespace(String(args.businessId)),
      query: args.query,
      limit: args.limit ?? 5,
    });

    await enqueuePostHogEventBestEffort(ctx, {
      eventName: "ai.embedding.completed",
      businessId: args.businessId,
      distinctId: getPostHogDistinctIdForBusinessSystem(String(args.businessId)),
      groupKey: getPostHogBusinessGroupKey(String(args.businessId)),
      provider: "google",
      model: getEmbeddingModelId(),
      ...(args.channel ? { channel: args.channel } : {}),
      properties: {
        operation: "knowledge.search",
        queryLength: args.query.trim().length,
        inputCharacterCount: args.query.trim().length,
        inputItemCount: 1,
        resultCount: entries.length,
        latencyMs: Date.now() - startedAt,
      },
    });

    return entries.map((entry) => ({
      ...(entry.title !== undefined ? { title: entry.title } : {}),
      text: entry.text,
    }));
  } catch (error) {
    await enqueuePostHogEventBestEffort(ctx, {
      eventName: "ai.embedding.failed",
      businessId: args.businessId,
      distinctId: getPostHogDistinctIdForBusinessSystem(String(args.businessId)),
      groupKey: getPostHogBusinessGroupKey(String(args.businessId)),
      provider: "google",
      model: getEmbeddingModelId(),
      ...(args.channel ? { channel: args.channel } : {}),
      properties: {
        operation: "knowledge.search",
        queryLength: args.query.trim().length,
        inputCharacterCount: args.query.trim().length,
        inputItemCount: 1,
        error: error instanceof Error ? error.message : "Knowledge search failed.",
      },
    });
    throw error;
  }
}

async function enqueueStaleKnowledgeReindex(
  ctx: ActionCtx,
  businessId: Id<"businesses">,
): Promise<void> {
  const staleEntries: KnowledgeReindexState = await ctx.runQuery(
    internal.ai.context.knowledge.getKnowledgeEntriesNeedingReindex,
    {
      businessId,
    },
  );

  if (staleEntries.documentIds.length > 0) {
    await highPriorityWorkpool.enqueueActionBatch(
      ctx,
      internal.ai.context.knowledge.indexKnowledgeDocument,
      staleEntries.documentIds.map((documentId) => ({ documentId })),
    );
  }

  if (staleEntries.snippetIds.length > 0) {
    await highPriorityWorkpool.enqueueActionBatch(
      ctx,
      internal.ai.context.knowledge.indexKnowledgeSnippet,
      staleEntries.snippetIds.map((snippetId) => ({ snippetId })),
    );
  }
}

async function generatePreviewAnswer(
  ctx: ActionCtx,
  args: PreviewKnowledgeArgs,
): Promise<PreviewKnowledgeAnswer> {
  const snapshot = await ctx.runQuery(internal.ai.context.snapshots.getByBusinessId, {
    businessId: args.businessId,
  });
  if (!snapshot) {
    throw new Error("Snapshot not ready.");
  }

  const context = await searchKnowledge(ctx, {
    businessId: args.businessId,
    query: args.prompt,
    limit: 4,
  });

  const threadId = await createThread(ctx, receptionistAgent.component, {
    title: `Preview for ${snapshot.displayName}`,
    summary: "Admin-side receptionist preview thread",
  });
  const traceId = crypto.randomUUID();
  const distinctId = getPostHogDistinctIdForBusinessSystem(String(args.businessId));
  const groupKey = getPostHogBusinessGroupKey(String(args.businessId));
  await captureAiTraceStartedBestEffort(ctx, {
    businessId: args.businessId,
    traceId,
    sessionId: threadId,
    distinctId,
    groupKey,
    model: getNonRealtimeTextModelId(),
    provider: "google",
    properties: {
      channel: "dashboard",
      operation: "knowledge.preview_answer",
    },
  });

  const result = await receptionistAgent.generateText(
    ctx,
    { threadId },
    withAiTelemetryContext({
      prompt: [
        `Business snapshot summary: ${snapshot.summary}`,
        `Booking policy: ${snapshot.bookingPolicy}`,
        `Knowledge digest: ${snapshot.knowledgeDigest || "No long-form knowledge configured."}`,
        `Relevant knowledge: ${context.map((entry) => entry.text).join("\n---\n")}`,
        `User prompt: ${args.prompt}`,
      ].join("\n\n"),
    } as any, {
      traceId,
      sessionId: threadId,
      distinctId,
      groupKey,
      businessId: args.businessId,
      mutationRunner: ctx,
      properties: {
        channel: "dashboard",
        operation: "knowledge.preview_answer",
      },
    }),
  );

  const metrics = extractGenerationMetrics(result);
  if (metrics.totalCostUsd !== undefined) {
    await ctx.runMutation(internal.unitEconomics.recordAiGenerationCost, {
      businessId: args.businessId,
      occurredAt: new Date().toISOString(),
      eventKey: `dashboard_ai:knowledge_preview:${traceId}`,
      eventKind: "dashboard_ai",
      channel: "dashboard",
      costUsd: metrics.totalCostUsd,
      provider: "google",
      model: getNonRealtimeTextModelId(),
      operation: "knowledge.preview_answer",
    });
  }

  return { text: result.text, threadId };
}

async function deleteKnowledgeEntryById(
  ctx: ActionCtx,
  args: DeleteKnowledgeEntryArgs,
): Promise<null> {
  await requireKnowledgeAccess(ctx, args.businessId);

  if ("documentId" in args && args.documentId) {
    const document = await ctx.runQuery(internal.ai.context.knowledge.getDocumentForIndexing, {
      documentId: args.documentId,
    });

    if (!document || document.businessId !== args.businessId) {
      throw new Error("Knowledge document not found.");
    }

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
      documentId: args.documentId,
    });
    await ctx.runMutation(internal.ai.context.snapshots.refreshSnapshot, {
      businessId: args.businessId,
    });
    return null;
  }

  const snippetId = args.snippetId;
  if (!snippetId) {
    throw new Error("Knowledge snippet not found.");
  }

  const snippet = await ctx.runQuery(internal.ai.context.knowledge.getSnippetForIndexing, {
    snippetId,
  });

  if (!snippet || snippet.businessId !== args.businessId) {
    throw new Error("Knowledge snippet not found.");
  }

  if (snippet.indexedEntryId) {
    await rag.delete(ctx, { entryId: snippet.indexedEntryId as never });
  }

  await ctx.runMutation(internal.ai.context.knowledge.deleteKnowledgeSnippetRecord, {
    snippetId,
  });
  await ctx.runMutation(internal.ai.context.snapshots.refreshSnapshot, {
    businessId: args.businessId,
  });
  return null;
}

export const getDocumentForIndexing = internalQuery({
  args: {
    documentId: v.id("knowledge_documents"),
  },
  handler: async (ctx: QueryCtx, args: DocumentIdArgs) => {
    return await ctx.db.get(args.documentId);
  },
});

export const getUploadedKnowledgeDocumentMetadata = internalQuery({
  args: {
    storageId: v.id("_storage"),
  },
  handler: async (
    ctx: QueryCtx,
    args: { storageId: Id<"_storage"> },
  ): Promise<UploadedKnowledgeDocumentMetadata> => {
    const metadata = await ctx.db.system.get("_storage", args.storageId);
    if (!metadata) {
      throw new Error("Uploaded file not found.");
    }

    return {
      contentType: metadata.contentType ?? "application/octet-stream",
      byteLength: metadata.size,
    };
  },
});

export const getKnowledgeStorageUsageBytes = internalQuery({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (
    ctx: QueryCtx,
    args: BusinessIdArgs,
  ): Promise<number> => {
    let totalBytes = 0;

    for await (const document of ctx.db
      .query("knowledge_documents")
      .withIndex("by_business_id_and_status", (q) => q.eq("businessId", args.businessId))) {
      if (document.storageId) {
        const metadata = await ctx.db.system.get("_storage", document.storageId);
        totalBytes += metadata?.size ?? 0;
      }

      if (document.extractedTextStorageId) {
        const metadata = await ctx.db.system.get("_storage", document.extractedTextStorageId);
        totalBytes += metadata?.size ?? 0;
      }
    }

    return totalBytes;
  },
});

export const getBusinessDefaultLocale = internalQuery({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx: QueryCtx, args: BusinessIdArgs) => {
    const business = await ctx.db.get(args.businessId);
    return normalizeRuntimeLocale(business?.defaultLocale) ?? null;
  },
});

export const markDocumentIndexed = internalMutation({
  args: {
    documentId: v.id("knowledge_documents"),
    status: v.string(),
    indexedEntryId: v.optional(v.string()),
    indexVersion: v.optional(v.string()),
    error: v.optional(v.string()),
    processingProgress: v.optional(v.number()),
  },
  handler: async (ctx: MutationCtx, args: MarkDocumentIndexedArgs) => {
    await ctx.db.patch(args.documentId, {
      status: args.status,
      indexedEntryId: args.indexedEntryId,
      indexVersion: args.indexVersion,
      error: args.error,
      processingProgress: args.processingProgress,
      lastIndexedAt: new Date().toISOString(),
    });
    return null;
  },
});

export const setDocumentProcessingProgress = internalMutation({
  args: {
    documentId: v.id("knowledge_documents"),
    processingProgress: v.number(),
    status: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (
    ctx: MutationCtx,
    args: {
      documentId: Id<"knowledge_documents">;
      processingProgress: number;
      status?: string;
      error?: string;
    },
  ) => {
    await ctx.db.patch(args.documentId, {
      ...(args.status !== undefined ? { status: args.status } : {}),
      processingProgress: args.processingProgress,
      ...(args.error !== undefined ? { error: args.error } : {}),
    });
    return null;
  },
});

export const clearKnowledgeDocumentStorage = internalMutation({
  args: {
    documentId: v.id("knowledge_documents"),
  },
  handler: async (ctx: MutationCtx, args: DocumentIdArgs) => {
    await ctx.db.patch(args.documentId, {
      storageId: undefined,
      extractedTextStorageId: undefined,
    });
    return null;
  },
});

export const deleteKnowledgeDocumentRecord = internalMutation({
  args: {
    documentId: v.id("knowledge_documents"),
  },
  handler: async (ctx: MutationCtx, args: DocumentIdArgs) => {
    await ctx.db.delete(args.documentId);
    return null;
  },
});

export const storeKnowledgeDocumentExtraction = internalMutation({
  args: {
    documentId: v.id("knowledge_documents"),
    mimeType: v.string(),
    textContent: v.string(),
    contentHash: v.string(),
    extractedTextStorageId: v.optional(v.id("_storage")),
  },
  handler: async (
    ctx: MutationCtx,
    args: {
      documentId: Id<"knowledge_documents">;
      mimeType: string;
      textContent: string;
      contentHash: string;
      extractedTextStorageId?: Id<"_storage">;
    },
  ) => {
    await ctx.db.patch(args.documentId, {
      mimeType: args.mimeType,
      textContent: args.textContent,
      contentHash: args.contentHash,
      extractedTextStorageId: args.extractedTextStorageId,
      status: "queued",
      processingProgress: 88,
      error: undefined,
    });
    return null;
  },
});

export const markSnippetIndexed = internalMutation({
  args: {
    snippetId: v.id("knowledge_snippets"),
    indexedEntryId: v.optional(v.string()),
    indexVersion: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx: MutationCtx, args: MarkSnippetIndexedArgs) => {
    await ctx.db.patch(args.snippetId, {
      indexedEntryId: args.indexedEntryId,
      indexVersion: args.indexVersion,
      error: args.error,
      lastIndexedAt: new Date().toISOString(),
    });
    return null;
  },
});

export const deleteKnowledgeSnippetRecord = internalMutation({
  args: {
    snippetId: v.id("knowledge_snippets"),
  },
  handler: async (ctx: MutationCtx, args: SnippetIdArgs) => {
    await ctx.db.delete(args.snippetId);
    return null;
  },
});

export const upsertKnowledgeSnippet = mutation({
  args: {
    businessId: v.id("businesses"),
    snippetId: v.optional(v.id("knowledge_snippets")),
    section: v.optional(knowledgeSectionValidator),
    title: v.string(),
    content: v.string(),
    tags: v.array(v.string()),
    priority: v.number(),
    active: v.boolean(),
  },
  handler: async (ctx: MutationCtx, args: UpsertKnowledgeSnippetArgs) => {
    await requireMembership(ctx, args.businessId);

    const snippetId =
      args.snippetId ??
      (await ctx.db.insert("knowledge_snippets", {
        businessId: args.businessId,
        ...(args.section !== undefined ? { section: args.section } : {}),
        title: args.title,
        content: args.content,
        tags: args.tags,
        priority: args.priority,
        active: args.active,
      }));

    if (args.snippetId) {
      await ctx.db.patch(args.snippetId, {
        ...(args.section !== undefined ? { section: args.section } : {}),
        title: args.title,
        content: args.content,
        tags: args.tags,
        priority: args.priority,
        active: args.active,
      });
    }

    await bulkWorkpool.enqueueAction(
      ctx,
      internal.ai.context.knowledge.indexKnowledgeSnippet,
      {
        snippetId,
      },
    );
    await scheduleSnapshotRefresh(ctx, args.businessId);
    return { snippetId };
  },
});

export const createKnowledgeDocument = mutation({
  args: {
    businessId: v.id("businesses"),
    section: v.optional(knowledgeSectionValidator),
    sourceType: v.string(),
    title: v.string(),
    storageId: v.optional(v.id("_storage")),
    extractedTextStorageId: v.optional(v.id("_storage")),
    mimeType: v.optional(v.string()),
    textContent: v.optional(v.string()),
    tags: v.array(v.string()),
    importance: v.number(),
    contentHash: v.optional(v.string()),
  },
  handler: async (ctx: MutationCtx, args: CreateKnowledgeDocumentArgs) => {
    await requireMembership(ctx, args.businessId);
    const documentId = await ctx.db.insert("knowledge_documents", {
      businessId: args.businessId,
      ...(args.section !== undefined ? { section: args.section } : {}),
      sourceType: args.sourceType,
      title: args.title,
      ...(args.storageId !== undefined ? { storageId: args.storageId } : {}),
      ...(args.extractedTextStorageId !== undefined
        ? { extractedTextStorageId: args.extractedTextStorageId }
        : {}),
      ...(args.mimeType !== undefined ? { mimeType: args.mimeType } : {}),
      ...(args.textContent !== undefined ? { textContent: args.textContent } : {}),
      status: "queued",
      processingProgress: 0,
      tags: args.tags,
      importance: args.importance,
      ...(args.contentHash !== undefined ? { contentHash: args.contentHash } : {}),
    });

    if (args.storageId !== undefined && args.textContent === undefined) {
      await bulkWorkpool.enqueueAction(
        ctx,
        internal.ai.context.knowledgeUploads.extractUploadedKnowledgeDocument,
        { documentId },
      );
    } else {
      await bulkWorkpool.enqueueAction(
        ctx,
        internal.ai.context.knowledge.indexKnowledgeDocument,
        { documentId },
      );
    }
    return { documentId };
  },
});

export const generateKnowledgeDocumentUploadUrl = mutation({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx: MutationCtx, args: BusinessIdArgs): Promise<string> => {
    await requireMembership(ctx, args.businessId);
    return await ctx.storage.generateUploadUrl();
  },
});

export const finalizeKnowledgeDocumentUpload = action({
  args: {
    businessId: v.id("businesses"),
    section: v.optional(knowledgeSectionValidator),
    storageId: v.id("_storage"),
    fileName: v.string(),
    title: v.string(),
    tags: v.array(v.string()),
  },
  handler: async (
    ctx: ActionCtx,
    args: FinalizeKnowledgeDocumentUploadArgs,
  ): Promise<{ documentId: Id<"knowledge_documents"> }> => {
    await requireKnowledgeAccess(ctx, args.businessId);

    const metadata: UploadedKnowledgeDocumentMetadata = await ctx.runQuery(
      internal.ai.context.knowledge.getUploadedKnowledgeDocumentMetadata,
      {
        storageId: args.storageId,
      },
    );

    if (metadata.byteLength > MAX_KNOWLEDGE_DOCUMENT_UPLOAD_BYTES) {
      await ctx.storage.delete(args.storageId);
      throw new Error("Documents must be 10 MB or smaller.");
    }

    const resolvedContentType = isSupportedKnowledgeDocumentContentType(metadata.contentType)
      ? metadata.contentType
      : inferKnowledgeDocumentContentTypeFromFileName(args.fileName);

    if (!resolvedContentType || !isSupportedKnowledgeDocumentContentType(resolvedContentType)) {
      await ctx.storage.delete(args.storageId);
      throw new Error("Supported document types are PDF, DOCX, TXT, and Markdown.");
    }

    try {
      await assertKnowledgeStorageCapacity(ctx, {
        businessId: args.businessId,
        additionalBytes: metadata.byteLength,
      });
    } catch (error) {
      await ctx.storage.delete(args.storageId);
      throw error;
    }

    const fallbackExtension = resolvedContentType === "application/pdf"
      ? "pdf"
      : resolvedContentType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        ? "docx"
        : resolvedContentType === "text/markdown" || resolvedContentType === "text/x-markdown"
          ? "md"
          : "txt";
    const normalizedFileName = normalizeAttachmentFileName(args.fileName, fallbackExtension);
    const fallbackTitle = normalizedFileName.replace(/\.[^.]+$/u, "").trim();
    const documentTitle = args.title.trim() || fallbackTitle || "Uploaded document";

    return await ctx.runMutation(api.ai.context.knowledge.createKnowledgeDocument, {
      businessId: args.businessId,
      ...(args.section !== undefined ? { section: args.section } : {}),
      sourceType: "upload",
      title: documentTitle,
      storageId: args.storageId,
      mimeType: resolvedContentType,
      tags: args.tags,
      importance: 75,
    });
  },
});

export const listKnowledge = query({
  args: {
    businessId: v.id("businesses"),
    section: v.optional(knowledgeSectionValidator),
  },
  handler: async (ctx: QueryCtx, args: ListKnowledgeArgs) => {
    await requireMembership(ctx, args.businessId);
    const [documents, snippets] = await Promise.all([
      ctx.db
        .query("knowledge_documents")
        .withIndex("by_business_id_and_status", (q) => q.eq("businessId", args.businessId))
        .collect(),
      ctx.db
        .query("knowledge_snippets")
        .withIndex("by_business_id_and_active", (q) => q.eq("businessId", args.businessId))
        .collect(),
    ]);

    if (args.section === undefined) {
      return { documents, snippets };
    }

    return {
      documents: documents.filter(
        (document) => resolveKnowledgeSection(document.section) === args.section,
      ),
      snippets: snippets.filter(
        (snippet) => resolveKnowledgeSection(snippet.section) === args.section,
      ),
    };
  },
});

export const getKnowledgeDocumentViewerContent = query({
  args: {
    businessId: v.id("businesses"),
    documentId: v.id("knowledge_documents"),
  },
  handler: async (ctx: QueryCtx, args: KnowledgeDocumentViewerContentArgs) => {
    await requireMembership(ctx, args.businessId);

    const document = await ctx.db.get(args.documentId);
    if (!document || document.businessId !== args.businessId) {
      throw new Error("Knowledge document not found.");
    }

    return {
      textContent: document.textContent ?? "",
      extractedTextUrl: document.extractedTextStorageId
        ? await ctx.storage.getUrl(document.extractedTextStorageId)
        : null,
      error: document.error ?? null,
      status: document.status,
    };
  },
});

export const searchKnowledgeInternal = internalAction({
  args: {
    businessId: v.id("businesses"),
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx: ActionCtx, args: SearchKnowledgeArgs): Promise<KnowledgeSearchResult> => {
    return await searchKnowledge(ctx, { ...args, channel: "internal" });
  },
});

export const searchKnowledgeForVoiceInternal = internalAction({
  args: {
    businessId: v.id("businesses"),
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx: ActionCtx, args: SearchKnowledgeArgs): Promise<KnowledgeSearchResult> => {
    await enqueueStaleKnowledgeReindex(ctx, args.businessId);
    const results = await searchIndexedKnowledge(ctx, { ...args, channel: "voice" });
    await enqueuePostHogEventBestEffort(ctx, {
      eventName: "knowledge.search_executed",
      businessId: args.businessId,
      distinctId: getPostHogDistinctIdForBusinessSystem(String(args.businessId)),
      groupKey: getPostHogBusinessGroupKey(String(args.businessId)),
      channel: "voice",
      properties: {
        queryLength: args.query.trim().length,
        resultCount: results.length,
      },
    });
    return results;
  },
});

export const searchKnowledgeForDashboard = action({
  args: {
    businessId: v.id("businesses"),
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx: ActionCtx, args: SearchKnowledgeArgs): Promise<KnowledgeSearchResult> => {
    await requireKnowledgeAccess(ctx, args.businessId);
    const results = await searchKnowledge(ctx, { ...args, channel: "dashboard" });
    await enqueuePostHogEventBestEffort(ctx, {
      eventName: "knowledge.search_executed",
      businessId: args.businessId,
      distinctId: getPostHogDistinctIdForBusinessSystem(String(args.businessId)),
      groupKey: getPostHogBusinessGroupKey(String(args.businessId)),
      channel: "dashboard",
      properties: {
        queryLength: args.query.trim().length,
        resultCount: results.length,
      },
    });
    return results;
  },
});

export const deleteKnowledgeEntry = action({
  args: {
    businessId: v.id("businesses"),
    documentId: v.optional(v.id("knowledge_documents")),
    snippetId: v.optional(v.id("knowledge_snippets")),
  },
  handler: async (
    ctx: ActionCtx,
    args: {
      businessId: Id<"businesses">;
      documentId?: Id<"knowledge_documents">;
      snippetId?: Id<"knowledge_snippets">;
    },
  ) => {
    if ((args.documentId ? 1 : 0) + (args.snippetId ? 1 : 0) !== 1) {
      throw new Error("Specify exactly one knowledge entry to delete.");
    }

    return await deleteKnowledgeEntryById(
      ctx,
      args.documentId
        ? {
            businessId: args.businessId,
            documentId: args.documentId,
          }
        : {
            businessId: args.businessId,
            snippetId: args.snippetId!,
          },
    );
  },
});

export const indexKnowledgeDocument = internalAction({
  args: {
    documentId: v.id("knowledge_documents"),
  },
  handler: async (ctx: ActionCtx, args: DocumentIdArgs) => {
    return await indexKnowledgeDocumentById(ctx, args.documentId);
  },
});

export const indexKnowledgeSnippet = internalAction({
  args: {
    snippetId: v.id("knowledge_snippets"),
  },
  handler: async (ctx: ActionCtx, args: SnippetIdArgs) => {
    return await indexKnowledgeSnippetById(ctx, args.snippetId);
  },
});

export const getSnippetForIndexing = internalQuery({
  args: {
    snippetId: v.id("knowledge_snippets"),
  },
  handler: async (ctx: QueryCtx, args: SnippetIdArgs) => {
    return await ctx.db.get(args.snippetId);
  },
});

export const getKnowledgeEntriesNeedingReindex = internalQuery({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx: QueryCtx, args: BusinessIdArgs): Promise<KnowledgeReindexState> => {
    const [documents, snippets] = await Promise.all([
      ctx.db
        .query("knowledge_documents")
        .withIndex("by_business_id_and_status", (q) => q.eq("businessId", args.businessId))
        .collect(),
      ctx.db
        .query("knowledge_snippets")
        .withIndex("by_business_id_and_active", (q) => q.eq("businessId", args.businessId))
        .collect(),
    ]);

    return {
      documentIds: documents
        .filter(
          (document) =>
            (!!document.textContent || !!document.extractedTextStorageId) &&
            (!document.indexedEntryId ||
              document.status !== "indexed" ||
              document.indexVersion !== KNOWLEDGE_INDEX_VERSION),
        )
        .map((document) => document._id),
      snippetIds: snippets
        .filter(
          (snippet) =>
            snippet.active &&
            (!snippet.indexedEntryId || snippet.indexVersion !== KNOWLEDGE_INDEX_VERSION),
        )
        .map((snippet) => snippet._id),
    };
  },
});

export const generatePreviewKnowledgeAnswer = internalAction({
  args: {
    businessId: v.id("businesses"),
    prompt: v.string(),
  },
  handler: async (ctx: ActionCtx, args: PreviewKnowledgeArgs): Promise<PreviewKnowledgeAnswer> => {
    return await generatePreviewAnswer(ctx, args);
  },
});

export const previewKnowledgeAnswer = action({
  args: {
    businessId: v.id("businesses"),
    prompt: v.string(),
  },
  handler: async (ctx: ActionCtx, args: PreviewKnowledgeArgs): Promise<PreviewKnowledgeAnswer> => {
    await requireKnowledgeAccess(ctx, args.businessId);
    return await generatePreviewAnswer(ctx, args);
  },
});
