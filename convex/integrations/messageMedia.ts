"use node";

import { v } from "convex/values";

import type { Id } from "../_generated/dataModel";
import { internalAction } from "../_generated/server";
import { generateImagePreview } from "../lib/node/imagePreviews";
import { isImageAttachment } from "../lib/messageAttachments";

export const createImagePreviewForStorage = internalAction({
  args: {
    storageId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    | {
        storageId: Id<"_storage">;
        fileName: string;
        contentType: string;
        byteLength: number;
      }
    | null
  > => {
    if (!isImageAttachment(args.contentType)) {
      return null;
    }

    const blob = await ctx.storage.get(args.storageId);
    if (!blob) {
      return null;
    }

    const preview = await generateImagePreview({
      blob,
      fileName: args.fileName,
    });
    if (!preview) {
      return null;
    }

    const previewStorageId = await ctx.storage.store(preview.blob);

    return {
      storageId: previewStorageId,
      fileName: preview.fileName,
      contentType: preview.contentType,
      byteLength: preview.byteLength,
    };
  },
});
