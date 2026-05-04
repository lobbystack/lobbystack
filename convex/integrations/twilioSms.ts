"use node";

import { v } from "convex/values";
import twilio from "twilio";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalAction } from "../_generated/server";
import {
  buildTwilioBasicAuthHeader,
  getTwilioClient,
  requireTwilioCredentials,
} from "../lib/node/twilioClient";
import { enqueuePostHogProviderExceptionBestEffort } from "../telemetry/posthog";
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
    from: v.optional(v.string()),
    messagingServiceSid: v.optional(v.string()),
    body: v.string(),
    statusCallbackUrl: v.string(),
    mediaUrls: v.optional(v.array(v.string())),
  },
  handler: async (_ctx, args) => {
    if (!args.from && !args.messagingServiceSid) {
      throw new Error("Either a Twilio from number or Messaging Service SID is required.");
    }

    const client = getTwilioClient();
    const message = await client.messages.create({
      to: args.to,
      body: args.body,
      statusCallback: args.statusCallbackUrl,
      ...(args.from ? { from: args.from } : {}),
      ...(args.messagingServiceSid
        ? { messagingServiceSid: args.messagingServiceSid }
        : {}),
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

const TERMINAL_SMS_STATUSES = new Set([
  "sent",
  "delivered",
  "undelivered",
  "failed",
  "canceled",
]);
const MESSAGE_PRICE_RETRY_DELAYS_MS = [
  30_000,
  120_000,
  600_000,
  1_800_000,
] as const;

function parseOptionalFiniteNumber(value: string | null | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizePriceUnit(value: string | null | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized && normalized.length > 0 ? normalized : undefined;
}

function normalizeProviderCostUsd(
  providerPrice: number | undefined,
  providerPriceUnit: string | undefined,
): number | undefined {
  if (providerPrice === undefined || providerPriceUnit !== "usd") {
    return undefined;
  }

  return Math.abs(providerPrice);
}

export const syncMessagePriceFromProvider = internalAction({
  args: {
    providerMessageSid: v.string(),
    providerStatus: v.string(),
    attempt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const attempt = Math.max(0, args.attempt ?? 0);
    const status = args.providerStatus.trim().toLowerCase();
    if (!TERMINAL_SMS_STATUSES.has(status)) {
      return { synced: false, scheduledRetry: false, skipped: true };
    }

    try {
      const client = getTwilioClient();
      const message = await client.messages(args.providerMessageSid).fetch();
      const providerPrice = parseOptionalFiniteNumber(message.price);
      const providerPriceUnit = normalizePriceUnit(message.priceUnit);
      const providerCostUsd = normalizeProviderCostUsd(providerPrice, providerPriceUnit);
      const providerNumSegments = parseOptionalFiniteNumber(message.numSegments);
      const normalizedProviderNumSegments =
        providerNumSegments !== undefined
          ? Math.max(0, Math.trunc(providerNumSegments))
          : undefined;
      const hasCompleteProviderPricing =
        providerCostUsd !== undefined &&
        normalizedProviderNumSegments !== undefined;

      await ctx.runMutation(internal.integrations.twilioMessageStatus.recordProviderPricing, {
        providerMessageSid: args.providerMessageSid,
        ...(message.dateUpdated
          ? { providerUpdatedAt: message.dateUpdated.toISOString() }
          : {}),
        ...(providerPrice !== undefined ? { providerPrice } : {}),
        ...(providerPriceUnit !== undefined ? { providerPriceUnit } : {}),
        ...(providerCostUsd !== undefined ? { providerCostUsd } : {}),
        ...(normalizedProviderNumSegments !== undefined
          ? { providerNumSegments: normalizedProviderNumSegments }
          : {}),
      });

      if (
        !hasCompleteProviderPricing &&
        attempt < MESSAGE_PRICE_RETRY_DELAYS_MS.length
      ) {
        const retryDelayMs = MESSAGE_PRICE_RETRY_DELAYS_MS[attempt];
        if (retryDelayMs === undefined) {
          return { synced: false, scheduledRetry: false, skipped: false };
        }
        await ctx.scheduler.runAfter(
          retryDelayMs,
          internal.integrations.twilioSms.syncMessagePriceFromProvider,
          {
            providerMessageSid: args.providerMessageSid,
            providerStatus: message.status ?? args.providerStatus,
            attempt: attempt + 1,
          },
        );
        return { synced: false, scheduledRetry: true, skipped: false };
      }

      return { synced: hasCompleteProviderPricing, scheduledRetry: false, skipped: false };
    } catch (error) {
      if (attempt < MESSAGE_PRICE_RETRY_DELAYS_MS.length) {
        const retryDelayMs = MESSAGE_PRICE_RETRY_DELAYS_MS[attempt];
        if (retryDelayMs === undefined) {
          return { synced: false, scheduledRetry: false, skipped: false };
        }
        await ctx.scheduler.runAfter(
          retryDelayMs,
          internal.integrations.twilioSms.syncMessagePriceFromProvider,
          {
            providerMessageSid: args.providerMessageSid,
            providerStatus: args.providerStatus,
            attempt: attempt + 1,
          },
        );
        return { synced: false, scheduledRetry: true, skipped: false };
      }

      console.warn("[twilioSms] Failed to hydrate provider message price", {
        providerMessageSid: args.providerMessageSid,
        error: error instanceof Error ? error.message : String(error),
      });
      await enqueuePostHogProviderExceptionBestEffort(ctx, {
        provider: "twilio",
        error,
        operation: "twilio_sms_price_sync",
        distinctId: "system:convex:provider:twilio",
        channel: "sms",
        properties: {
          providerMessageSid: args.providerMessageSid,
          providerStatus: args.providerStatus,
          attemptNumber: attempt + 1,
        },
      });
      return { synced: false, scheduledRetry: false, skipped: false };
    }
  },
});

export const registerIncomingWebhook = internalAction({
  args: {
    phoneNumberSid: v.string(),
    smsWebhookUrl: v.optional(v.string()),
    voiceWebhookUrl: v.optional(v.string()),
    voiceStatusCallbackUrl: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const client = getTwilioClient();
    const phoneNumberUpdate = {
      ...(args.smsWebhookUrl
        ? {
            smsUrl: args.smsWebhookUrl,
            smsMethod: "POST",
          }
        : {
            smsUrl: "",
          }),
      ...(args.voiceWebhookUrl
        ? {
            voiceUrl: args.voiceWebhookUrl,
            voiceMethod: "POST",
            ...(args.voiceStatusCallbackUrl
              ? {
                  statusCallback: args.voiceStatusCallbackUrl,
                  statusCallbackMethod: "POST",
                }
              : {}),
          }
        : {
            statusCallback: "",
            voiceUrl: "",
          }),
    };
    const phoneNumber = await client
      .incomingPhoneNumbers(args.phoneNumberSid)
      .update(phoneNumberUpdate);

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
