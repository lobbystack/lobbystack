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
import {
  KNOWLEDGE_DOCUMENT_OCR_PROCESSING_ERROR,
  KNOWLEDGE_DOCUMENT_OCR_UNREADABLE_ERROR,
  extractKnowledgeDocumentText,
  extractPdfTextWithLocalOcr,
} from "../../lib/node/knowledgeExtraction";

const KNOWLEDGE_DOCUMENT_UNREADABLE_ERROR =
  "We couldn't extract enough readable text from this file.";

async function extractUploadedKnowledgeDocumentText(input: {
  blob: Blob;
  mimeType: string;
}): Promise<string> {
  const rawText = await extractKnowledgeDocumentText(input);
  const normalizedText = normalizeKnowledgeDocumentText(rawText);

  if (hasMeaningfulKnowledgeDocumentText(normalizedText)) {
    return normalizedText;
  }

  if (input.mimeType !== "application/pdf") {
    throw new Error(KNOWLEDGE_DOCUMENT_UNREADABLE_ERROR);
  }

  try {
    const ocrText = await extractPdfTextWithLocalOcr({
      blob: input.blob,
    });
    const normalizedOcrText = normalizeKnowledgeDocumentText(ocrText);

    if (!hasMeaningfulKnowledgeDocumentText(normalizedOcrText)) {
      throw new Error(KNOWLEDGE_DOCUMENT_OCR_UNREADABLE_ERROR);
    }

    return normalizedOcrText;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message !== KNOWLEDGE_DOCUMENT_OCR_PROCESSING_ERROR
    ) {
      throw error;
    }

    throw new Error(KNOWLEDGE_DOCUMENT_OCR_PROCESSING_ERROR);
  }
}

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
    const normalizedText = await extractUploadedKnowledgeDocumentText({ blob, mimeType });

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
