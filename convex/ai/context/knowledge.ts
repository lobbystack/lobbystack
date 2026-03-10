// @ts-nocheck
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
} from "../../_generated/server";
import { internal } from "../../_generated/api";
import { requireIdentity, requireMembership } from "../../lib/auth";
import {
  bulkWorkpool,
  getKnowledgeNamespace,
  KNOWLEDGE_INDEX_VERSION,
  rag,
  receptionistAgent,
} from "../../lib/components";
import { scheduleSnapshotRefresh } from "../../businesses/admin";

export const getDocumentForIndexing = internalQuery({
  args: {
    documentId: v.id("knowledge_documents"),
  },
  handler: async (ctx, args) => {
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
  handler: async (ctx, args) => {
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
  handler: async (ctx, args) => {
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
  handler: async (ctx, args) => {
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
      internal["ai/context/knowledge"].indexKnowledgeSnippet,
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
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.businessId);
    const documentId = await ctx.db.insert("knowledge_documents", {
      businessId: args.businessId,
      sourceType: args.sourceType,
      title: args.title,
      mimeType: args.mimeType,
      textContent: args.textContent,
      status: "queued",
      tags: args.tags,
      importance: args.importance,
      contentHash: args.contentHash,
    });

    await bulkWorkpool.enqueueAction(
      ctx,
      internal["ai/context/knowledge"].indexKnowledgeDocument,
      { documentId },
    );
    return { documentId };
  },
});

export const listKnowledge = query({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
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
  handler: async (ctx, args) => {
    const staleEntries = await ctx.runQuery(
      internal["ai/context/knowledge"].getKnowledgeEntriesNeedingReindex,
      {
        businessId: args.businessId,
      },
    );

    for (const documentId of staleEntries.documentIds) {
      await ctx.runAction(internal["ai/context/knowledge"].indexKnowledgeDocument, {
        documentId,
      });
    }

    for (const snippetId of staleEntries.snippetIds) {
      await ctx.runAction(internal["ai/context/knowledge"].indexKnowledgeSnippet, {
        snippetId,
      });
    }

    const { entries } = await rag.search(ctx, {
      namespace: getKnowledgeNamespace(String(args.businessId)),
      query: args.query,
      limit: args.limit ?? 5,
    });

    return entries.map((entry) => ({
      title: entry.title,
      text: entry.text,
    }));
  },
});

export const searchKnowledgeForDashboard = action({
  args: {
    businessId: v.id("businesses"),
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Array<{ title?: string; text: string }>> => {
    await requireIdentity(ctx);
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("User profile not initialized.");
    }
    const membership = await ctx.runQuery(
      internal["ai/agents/runtime"].requireMembershipByUserId,
      {
        businessId: args.businessId,
        userId,
      },
    );

    if (!membership) {
      throw new Error("Unauthorized.");
    }

    return await ctx.runAction(internal["ai/context/knowledge"].searchKnowledgeInternal, args);
  },
});

export const indexKnowledgeDocument = internalAction({
  args: {
    documentId: v.id("knowledge_documents"),
  },
  handler: async (ctx, args) => {
    const document = await ctx.runQuery(
      internal["ai/context/knowledge"].getDocumentForIndexing,
      { documentId: args.documentId },
    );

    if (!document || !document.textContent) {
      await ctx.runMutation(internal["ai/context/knowledge"].markDocumentIndexed, {
        documentId: args.documentId,
        status: "error",
        error: "No text content available for indexing.",
      });
      return null;
    }

    const result = await rag.add(ctx, {
      namespace: getKnowledgeNamespace(String(document.businessId)),
      title: document.title,
      text: document.textContent,
      key: `document:${String(args.documentId)}`,
      contentHash: document.contentHash,
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

    await ctx.runMutation(internal["ai/context/knowledge"].markDocumentIndexed, {
      documentId: args.documentId,
      status: result.status === "ready" ? "indexed" : "indexing",
      indexedEntryId: String(result.entryId),
      indexVersion: KNOWLEDGE_INDEX_VERSION,
    });
    await ctx.runMutation(internal["ai/context/snapshots"].refreshSnapshot, {
      businessId: document.businessId,
    });
    return null;
  },
});

export const indexKnowledgeSnippet = internalAction({
  args: {
    snippetId: v.id("knowledge_snippets"),
  },
  handler: async (ctx, args) => {
    const snippet = await ctx.runQuery(internal["ai/context/knowledge"].getSnippetForIndexing, {
      snippetId: args.snippetId,
    });

    if (!snippet || !snippet.active) {
      return null;
    }

    const result = await rag.add(ctx, {
      namespace: getKnowledgeNamespace(String(snippet.businessId)),
      title: snippet.title,
      text: snippet.content,
      key: `snippet:${String(args.snippetId)}`,
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

    await ctx.runMutation(internal["ai/context/knowledge"].markSnippetIndexed, {
      snippetId: args.snippetId,
      indexedEntryId: String(result.entryId),
      indexVersion: KNOWLEDGE_INDEX_VERSION,
    });
    await ctx.runMutation(internal["ai/context/snapshots"].refreshSnapshot, {
      businessId: snippet.businessId,
    });
    return String(result.entryId);
  },
});

export const getSnippetForIndexing = internalQuery({
  args: {
    snippetId: v.id("knowledge_snippets"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.snippetId);
  },
});

export const getKnowledgeEntriesNeedingReindex = internalQuery({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
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
  handler: async (ctx, args): Promise<{ text: string; threadId: string }> => {
    const snapshot = await ctx.runQuery(internal["ai/context/snapshots"].getByBusinessId, {
      businessId: args.businessId,
    });
    if (!snapshot) {
      throw new Error("Snapshot not ready.");
    }

    const context: Array<{ title?: string; text: string }> = await ctx.runAction(
      internal["ai/context/knowledge"].searchKnowledgeInternal,
      {
        businessId: args.businessId,
        query: args.prompt,
        limit: 4,
      },
    );

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
  },
});

export const previewKnowledgeAnswer = action({
  args: {
    businessId: v.id("businesses"),
    prompt: v.string(),
  },
  handler: async (ctx, args): Promise<{ text: string; threadId: string }> => {
    await requireIdentity(ctx);
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("User profile not initialized.");
    }
    const membership = await ctx.runQuery(
      internal["ai/agents/runtime"].requireMembershipByUserId,
      {
        businessId: args.businessId,
        userId,
      },
    );

    if (!membership) {
      throw new Error("Unauthorized.");
    }

    return await ctx.runAction(internal["ai/context/knowledge"].generatePreviewKnowledgeAnswer, {
      businessId: args.businessId,
      prompt: args.prompt,
    });
  },
});
