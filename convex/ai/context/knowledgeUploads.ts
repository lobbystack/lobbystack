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
import type { RuntimeLocale } from "../../lib/runtimeLocale";
import {
  KNOWLEDGE_DOCUMENT_OCR_LANGUAGES,
  KNOWLEDGE_DOCUMENT_OCR_PROCESSING_ERROR,
  KNOWLEDGE_DOCUMENT_OCR_UNREADABLE_ERROR,
  extractKnowledgeDocumentText,
  extractPdfTextWithLocalOcr,
} from "../../lib/node/knowledgeExtraction";

const KNOWLEDGE_DOCUMENT_UNREADABLE_ERROR =
  "We couldn't extract enough readable text from this file.";

function getPreferredOcrLanguages(
  locale: RuntimeLocale | null | undefined,
): ReadonlyArray<string> {
  if (locale === "fr") {
    return ["fra"];
  }

  if (locale === "en") {
    return ["eng"];
  }

  return KNOWLEDGE_DOCUMENT_OCR_LANGUAGES;
}

async function extractUploadedKnowledgeDocumentText(input: {
  blob: Blob;
  mimeType: string;
  preferredOcrLocale?: RuntimeLocale | null;
  onProgress?: (progressPercent: number) => Promise<void>;
}): Promise<string> {
  await input.onProgress?.(10);
  const rawText = await extractKnowledgeDocumentText(input);
  const normalizedText = normalizeKnowledgeDocumentText(rawText);

  if (hasMeaningfulKnowledgeDocumentText(normalizedText)) {
    await input.onProgress?.(85);
    return normalizedText;
  }

  if (input.mimeType !== "application/pdf") {
    throw new Error(KNOWLEDGE_DOCUMENT_UNREADABLE_ERROR);
  }

  try {
    const ocrText = await extractPdfTextWithLocalOcr({
      blob: input.blob,
      languages: getPreferredOcrLanguages(input.preferredOcrLocale),
      onProgress: async (ocrProgressPercent) => {
        await input.onProgress?.(Math.round(10 + ocrProgressPercent * 0.75));
      },
    });
    const normalizedOcrText = normalizeKnowledgeDocumentText(ocrText);

    if (!hasMeaningfulKnowledgeDocumentText(normalizedOcrText)) {
      throw new Error(KNOWLEDGE_DOCUMENT_OCR_UNREADABLE_ERROR);
    }

    await input.onProgress?.(85);
    return normalizedOcrText;
  } catch (error) {
    console.error("Uploaded PDF OCR fallback failed", {
      error:
        error instanceof Error
          ? {
              message: error.message,
              name: error.name,
              stack: error.stack,
            }
          : error,
    });

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
  const preferredOcrLocale =
    mimeType === "application/pdf"
      ? await ctx.runQuery(internal.ai.context.knowledge.getBusinessDefaultLocale, {
          businessId: document.businessId,
        })
      : null;

  try {
    await ctx.runMutation(internal.ai.context.knowledge.setDocumentProcessingProgress, {
      documentId,
      status: "queued",
      processingProgress: 5,
    });

    const normalizedText = await extractUploadedKnowledgeDocumentText({
      blob,
      mimeType,
      preferredOcrLocale,
      onProgress: async (progressPercent) => {
        await ctx.runMutation(internal.ai.context.knowledge.setDocumentProcessingProgress, {
          documentId,
          status: "queued",
          processingProgress: progressPercent,
        });
      },
    });

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
      processingProgress: 0,
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
