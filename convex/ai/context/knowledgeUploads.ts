"use node";

import { createHash } from "node:crypto";
import { v } from "convex/values";

import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { internalAction, type ActionCtx } from "../../_generated/server";
import {
  hasMeaningfulKnowledgeDocumentText,
  normalizeKnowledgeDocumentText,
} from "../../lib/knowledgeDocuments";
import { extractKnowledgeDocumentText } from "../../lib/node/knowledgeExtraction";

async function prepareUploadedKnowledgeDocument(
  ctx: ActionCtx,
  documentId: Id<"knowledge_documents">,
): Promise<null> {
  const document = await ctx.runQuery(internal.ai.context.knowledge.getDocumentForIndexing, {
    documentId,
  });

  if (!document?.storageId) {
    await ctx.runMutation(internal.ai.context.knowledge.markDocumentIndexed, {
      documentId,
      status: "error",
      error: "Uploaded file not found.",
    });
    return null;
  }

  const blob = await ctx.storage.get(document.storageId);
  if (!blob) {
    await ctx.runMutation(internal.ai.context.knowledge.markDocumentIndexed, {
      documentId,
      status: "error",
      error: "Uploaded file could not be loaded.",
    });
    return null;
  }

  const mimeType = document.mimeType ?? blob.type ?? "application/octet-stream";

  try {
    const rawText = await extractKnowledgeDocumentText({ blob, mimeType });
    const normalizedText = normalizeKnowledgeDocumentText(rawText);

    if (!hasMeaningfulKnowledgeDocumentText(normalizedText)) {
      await ctx.runMutation(internal.ai.context.knowledge.markDocumentIndexed, {
        documentId,
        status: "error",
        error:
          "We couldn't extract enough readable text from this file. Image-only PDFs aren't supported yet.",
      });
      return null;
    }

    const contentHash = createHash("sha256").update(normalizedText).digest("hex");

    await ctx.runMutation(internal.ai.context.knowledge.storeKnowledgeDocumentExtraction, {
      documentId,
      mimeType,
      textContent: normalizedText,
      contentHash,
    });
    await ctx.runAction(internal.ai.context.knowledge.indexKnowledgeDocument, {
      documentId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to process this document.";
    await ctx.runMutation(internal.ai.context.knowledge.markDocumentIndexed, {
      documentId,
      status: "error",
      error: message,
    });
  }

  return null;
}

export const extractUploadedKnowledgeDocument = internalAction({
  args: {
    documentId: v.id("knowledge_documents"),
  },
  handler: async (ctx, args) => {
    return await prepareUploadedKnowledgeDocument(ctx, args.documentId);
  },
});
