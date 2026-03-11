import { createThread } from "@convex-dev/agent";
import { getAuthUserId } from "@convex-dev/auth/server";
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
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { requireIdentity, requireMembership } from "../../lib/auth";
import {
  bulkWorkpool,
  getKnowledgeNamespace,
  KNOWLEDGE_INDEX_VERSION,
  rag,
  receptionistAgent,
} from "../../lib/components";
import { scheduleSnapshotRefresh } from "../../businesses/admin";

type KnowledgeSearchResult = Array<{ title?: string; text: string }>;
type PreviewKnowledgeAnswer = { text: string; threadId: string };
type BusinessIdArgs = { businessId: Id<"businesses"> };
type SearchKnowledgeArgs = {
  businessId: Id<"businesses">;
  query: string;
  limit?: number;
};
type PreviewKnowledgeArgs = {
  businessId: Id<"businesses">;
  prompt: string;
};
type DocumentIdArgs = { documentId: Id<"knowledge_documents"> };
type SnippetIdArgs = { snippetId: Id<"knowledge_snippets"> };
type MarkDocumentIndexedArgs = {
  documentId: Id<"knowledge_documents">;
  status: string;
  indexedEntryId?: string;
  indexVersion?: string;
  error?: string;
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
  title: string;
  content: string;
  tags: Array<string>;
  priority: number;
  active: boolean;
};
type CreateKnowledgeDocumentArgs = {
  businessId: Id<"businesses">;
  sourceType: string;
  title: string;
  mimeType?: string;
  textContent?: string;
  tags: Array<string>;
  importance: number;
  contentHash?: string;
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

async function indexKnowledgeDocumentById(
  ctx: ActionCtx,
  documentId: Id<"knowledge_documents">,
): Promise<null> {
  const document = await ctx.runQuery(internal.ai.context.knowledge.getDocumentForIndexing, {
    documentId,
  });

  if (!document || !document.textContent) {
    await ctx.runMutation(internal.ai.context.knowledge.markDocumentIndexed, {
      documentId,
      status: "error",
      error: "No text content available for indexing.",
    });
    return null;
  }

  const result = await rag.add(ctx, {
    namespace: getKnowledgeNamespace(String(document.businessId)),
    title: document.title,
    text: document.textContent,
    key: `document:${String(documentId)}`,
    ...(document.contentHash !== undefined
      ? { contentHash: document.contentHash }
      : {}),
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
  });
  await ctx.runMutation(internal.ai.context.snapshots.refreshSnapshot, {
    businessId: document.businessId,
  });
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

  const result = await rag.add(ctx, {
    namespace: getKnowledgeNamespace(String(snippet.businessId)),
    title: snippet.title,
    text: snippet.content,
    key: `snippet:${String(snippetId)}`,
    contentHash: `${snippet._creationTime}:${snippet.priority}:${snippet.active}`,
    filterValues: [
      { name: "businessId", value: String(snippet.businessId) },
      { name: "sourceType", value: "faq" },
      {
        name: "businessAndSource",
        value: {
          businessId: String(snippet.businessId),
          sourceType: "faq",
        },
      },
    ],
  });

  await ctx.runMutation(internal.ai.context.knowledge.markSnippetIndexed, {
    snippetId,
    indexedEntryId: String(result.entryId),
    indexVersion: KNOWLEDGE_INDEX_VERSION,
  });
  await ctx.runMutation(internal.ai.context.snapshots.refreshSnapshot, {
    businessId: snippet.businessId,
  });
  return String(result.entryId);
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

  const { entries } = await rag.search(ctx, {
    namespace: getKnowledgeNamespace(String(args.businessId)),
    query: args.query,
    limit: args.limit ?? 5,
  });

  return entries.map((entry) => ({
    ...(entry.title !== undefined ? { title: entry.title } : {}),
    text: entry.text,
  }));
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

  const result = await receptionistAgent.generateText(
    ctx,
    { threadId },
    {
      prompt: [
        `Business snapshot summary: ${snapshot.summary}`,
        `Booking policy: ${snapshot.bookingPolicy}`,
        `Knowledge digest: ${snapshot.knowledgeDigest || "No long-form knowledge configured."}`,
        `Relevant knowledge: ${context.map((entry) => entry.text).join("\n---\n")}`,
        `User prompt: ${args.prompt}`,
      ].join("\n\n"),
    } as any,
  );

  return { text: result.text, threadId };
}

export const getDocumentForIndexing = internalQuery({
  args: {
    documentId: v.id("knowledge_documents"),
  },
  handler: async (ctx: QueryCtx, args: DocumentIdArgs) => {
    return await ctx.db.get(args.documentId);
  },
});

export const markDocumentIndexed = internalMutation({
  args: {
    documentId: v.id("knowledge_documents"),
    status: v.string(),
    indexedEntryId: v.optional(v.string()),
    indexVersion: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx: MutationCtx, args: MarkDocumentIndexedArgs) => {
    await ctx.db.patch(args.documentId, {
      status: args.status,
      indexedEntryId: args.indexedEntryId,
      indexVersion: args.indexVersion,
      error: args.error,
      lastIndexedAt: new Date().toISOString(),
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

export const upsertKnowledgeSnippet = mutation({
  args: {
    businessId: v.id("businesses"),
    snippetId: v.optional(v.id("knowledge_snippets")),
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
        title: args.title,
        content: args.content,
        tags: args.tags,
        priority: args.priority,
        active: args.active,
      }));

    if (args.snippetId) {
      await ctx.db.patch(args.snippetId, {
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
    sourceType: v.string(),
    title: v.string(),
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
      sourceType: args.sourceType,
      title: args.title,
      ...(args.mimeType !== undefined ? { mimeType: args.mimeType } : {}),
      ...(args.textContent !== undefined ? { textContent: args.textContent } : {}),
      status: "queued",
      tags: args.tags,
      importance: args.importance,
      ...(args.contentHash !== undefined ? { contentHash: args.contentHash } : {}),
    });

    await bulkWorkpool.enqueueAction(
      ctx,
      internal.ai.context.knowledge.indexKnowledgeDocument,
      { documentId },
    );
    return { documentId };
  },
});

export const listKnowledge = query({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx: QueryCtx, args: BusinessIdArgs) => {
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

    return { documents, snippets };
  },
});

export const searchKnowledgeInternal = internalAction({
  args: {
    businessId: v.id("businesses"),
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx: ActionCtx, args: SearchKnowledgeArgs): Promise<KnowledgeSearchResult> => {
    return await searchKnowledge(ctx, args);
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
    return await searchKnowledge(ctx, args);
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
            !!document.textContent &&
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
