"use node";

import { v } from "convex/values";
import twilio from "twilio";

import type { Id } from "../_generated/dataModel";
import { internalAction } from "../_generated/server";
import {
  buildTwilioBasicAuthHeader,
  getTwilioClient,
  requireTwilioCredentials,
} from "../lib/node/twilioClient";
import {
  canDeliverAsMms,
  inferFileNameFromContentType,
  normalizeAttachmentFileName,
} from "../lib/messageAttachments";
import { generateImagePreview } from "../lib/node/imagePreviews";

function extractAttachmentFileName(input: {
  contentDisposition: string | null;
  contentType: string;
  url: string;
  index: number;
}): string {
  const fromHeader = input.contentDisposition?.match(/filename\*?=(?:UTF-8''|\"?)([^\";]+)/i)?.[1];
  const decodedHeader = fromHeader ? decodeURIComponent(fromHeader.replace(/\"/g, "").trim()) : null;
  const fromPath = (() => {
    try {
      const pathname = new URL(input.url).pathname;
      const lastSegment = pathname.split("/").pop();
      return lastSegment && lastSegment.length > 0 ? lastSegment : null;
    } catch {
      return null;
    }
  })();
  const fallbackName = inferFileNameFromContentType(input.contentType);
  const candidate = decodedHeader ?? fromPath ?? fallbackName;
  const normalized = normalizeAttachmentFileName(
    candidate,
    fallbackName.split(".").pop() ?? "bin",
  );

  if (normalized !== "attachment.bin") {
    return normalized;
  }

  const inferred = inferFileNameFromContentType(input.contentType);
  if (inferred !== "attachment.bin") {
    return inferred;
  }

  return `attachment-${input.index + 1}.bin`;
}

export const validateWebhookSignature = internalAction({
  args: {
    signatureHeader: v.optional(v.string()),
    url: v.string(),
    params: v.record(v.string(), v.string()),
  },
  handler: async (_ctx, args): Promise<boolean> => {
    const { authToken } = requireTwilioCredentials();
    if (!args.signatureHeader) {
      return false;
    }

    return twilio.validateRequest(authToken, args.signatureHeader, args.url, args.params);
  },
});

export const sendMessage = internalAction({
  args: {
    to: v.string(),
    from: v.string(),
    body: v.string(),
    statusCallbackUrl: v.string(),
    mediaUrls: v.optional(v.array(v.string())),
  },
  handler: async (_ctx, args) => {
    const client = getTwilioClient();
    const message = await client.messages.create({
      to: args.to,
      from: args.from,
      body: args.body,
      statusCallback: args.statusCallbackUrl,
      ...(args.mediaUrls && args.mediaUrls.length > 0
        ? { mediaUrl: args.mediaUrls }
        : {}),
    });

    return {
      providerMessageSid: message.sid,
      providerStatus: message.status ?? "queued",
    };
  },
});

export const registerIncomingWebhook = internalAction({
  args: {
    phoneNumberSid: v.string(),
    smsWebhookUrl: v.optional(v.string()),
    voiceWebhookUrl: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const client = getTwilioClient();
    const phoneNumber = await client.incomingPhoneNumbers(args.phoneNumberSid).update({
      ...(args.smsWebhookUrl
        ? {
            smsUrl: args.smsWebhookUrl,
            smsMethod: "POST",
          }
        : {}),
      ...(args.voiceWebhookUrl
        ? {
            voiceUrl: args.voiceWebhookUrl,
            voiceMethod: "POST",
          }
        : {}),
    });

    return {
      phoneNumberSid: phoneNumber.sid,
      ...(args.smsWebhookUrl
        ? {
            smsWebhookTargetUrl: phoneNumber.smsUrl ?? args.smsWebhookUrl,
          }
        : {}),
      ...(args.voiceWebhookUrl
        ? {
            voiceWebhookTargetUrl: phoneNumber.voiceUrl ?? args.voiceWebhookUrl,
          }
        : {}),
    };
  },
});

export const ingestInboundMedia = internalAction({
  args: {
    media: v.array(
      v.object({
        url: v.string(),
        contentType: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const authHeader = buildTwilioBasicAuthHeader();

    return await Promise.all(
      args.media.map(async (attachment, index) => {
        try {
          const response = await fetch(attachment.url, {
            headers: {
              Authorization: authHeader,
            },
          });

          if (!response.ok) {
            throw new Error(`Twilio media fetch failed with status ${response.status}`);
          }

          const blob = await response.blob();
          const contentType =
            response.headers.get("content-type") ??
            attachment.contentType ??
            "application/octet-stream";
          const fileName = extractAttachmentFileName({
            contentDisposition: response.headers.get("content-disposition"),
            contentType,
            url: attachment.url,
            index,
          });
          const storageId: Id<"_storage"> = await ctx.storage.store(blob);
          let previewFields:
            | {
                previewStorageId: Id<"_storage">;
                previewFileName: string;
                previewContentType: string;
                previewByteLength: number;
              }
            | undefined;
          if (contentType.startsWith("image/")) {
            try {
              const preview = await generateImagePreview({
                blob,
                fileName,
              });
              if (preview) {
                const previewStorageId = await ctx.storage.store(preview.blob);
                previewFields = {
                  previewStorageId,
                  previewFileName: preview.fileName,
                  previewContentType: preview.contentType,
                  previewByteLength: preview.byteLength,
                };
              }
            } catch {
              previewFields = undefined;
            }
          }

          return {
            storageId,
            fileName,
            contentType,
            byteLength: blob.size,
            ...(previewFields ?? {}),
            deliveryMode: canDeliverAsMms(contentType) ? "mms" : "link",
          };
        } catch {
          return {
            url: attachment.url,
            ...(attachment.contentType ? { contentType: attachment.contentType } : {}),
          };
        }
      }),
    );
  },
});
