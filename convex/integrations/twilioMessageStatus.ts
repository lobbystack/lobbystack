import { v } from "convex/values";

import { internal } from "../_generated/api";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { mapTwilioStatusToMessageStatus, mapTwilioStatusToNotificationStatus, shouldApplyMessageStatusTransition, shouldApplyNotificationStatusTransition } from "../lib/twilioMessageStatus";
import {
  getPostHogBusinessGroupKey,
  getPostHogDistinctIdForBusinessSystem,
} from "../telemetry/shared";
import { serializePostHogEvent } from "../telemetry/posthog";

type ReconcileTwilioMessageStatusArgs = {
  providerMessageSid: string;
  providerStatus: string;
  providerUpdatedAt: string;
  providerErrorCode?: string;
  providerRawDlrDoneDate?: string;
};

type RecordTwilioMessagePricingArgs = {
  providerMessageSid: string;
  providerUpdatedAt?: string;
  providerPrice?: number;
  providerPriceUnit?: string;
  providerCostUsd?: number;
  providerNumSegments?: number;
};

type ReconcileTwilioMessageStatusResult =
  | { matched: false }
  | {
      matched: true;
      applied: boolean;
      resource: "message" | "notification" | "operator_notification";
      status: string;
    };

async function reconcileMessageStatus(
  ctx: MutationCtx,
  args: ReconcileTwilioMessageStatusArgs,
): Promise<ReconcileTwilioMessageStatusResult | null> {
  const message = await ctx.db
    .query("messages")
    .withIndex("by_provider_message_sid", (q) => q.eq("providerMessageSid", args.providerMessageSid))
    .unique();

  if (!message) {
    return null;
  }

  const nextStatus = mapTwilioStatusToMessageStatus(args.providerStatus);
  const shouldApply =
    nextStatus === message.status ||
    shouldApplyMessageStatusTransition(message.status, nextStatus);

  if (shouldApply) {
    await ctx.db.patch(message._id, {
      status: nextStatus,
      providerStatus: args.providerStatus,
      providerUpdatedAt: args.providerUpdatedAt,
      ...(args.providerErrorCode !== undefined
        ? { providerErrorCode: args.providerErrorCode }
        : {}),
      ...(args.providerRawDlrDoneDate !== undefined
        ? { providerRawDlrDoneDate: args.providerRawDlrDoneDate }
        : {}),
    });

    if (
      message.appointmentId &&
      (nextStatus === "failed" || nextStatus === "undelivered")
    ) {
      await ctx.runMutation(
        internal.notifications.reminders.ensureBookingConfirmationNotification,
        {
          appointmentId: message.appointmentId,
        },
      );
    }
    if (
      message.aiGenerated &&
      message.direction === "outbound" &&
      message.channel === "sms" &&
      (nextStatus === "failed" || nextStatus === "undelivered")
    ) {
      await ctx.scheduler.runAfter(0, internal.operatorNotifications.dispatchEvent, {
        businessId: message.businessId,
        eventKind: "aiReplyFailed",
        eventKey: `aiReplyFailed:${String(message._id)}:delivery`,
        subject: "SMS AI reply failed",
        body: `An AI-generated SMS failed delivery for conversation ${String(message.conversationId)}.`,
      });
    }
  }

  return {
    matched: true,
    applied: shouldApply,
    resource: "message",
    status: shouldApply ? nextStatus : message.status,
  };
}

async function reconcileNotificationStatus(
  ctx: MutationCtx,
  args: ReconcileTwilioMessageStatusArgs,
): Promise<ReconcileTwilioMessageStatusResult | null> {
  const notification = await ctx.db
    .query("notifications")
    .withIndex("by_provider_message_id", (q) => q.eq("providerMessageId", args.providerMessageSid))
    .unique();

  if (!notification) {
    return null;
  }

  const nextStatus = mapTwilioStatusToNotificationStatus(args.providerStatus);
  const shouldApply =
    nextStatus === notification.status ||
    shouldApplyNotificationStatusTransition(notification.status, nextStatus);

  if (shouldApply) {
    await ctx.db.patch(notification._id, {
      status: nextStatus,
      providerStatus: args.providerStatus,
      providerUpdatedAt: args.providerUpdatedAt,
      ...(args.providerErrorCode !== undefined
        ? { providerErrorCode: args.providerErrorCode }
        : {}),
      ...(args.providerRawDlrDoneDate !== undefined
        ? { providerRawDlrDoneDate: args.providerRawDlrDoneDate }
        : {}),
    });
    if (nextStatus === "failed") {
      await ctx.scheduler.runAfter(0, internal.operatorNotifications.dispatchEvent, {
        businessId: notification.businessId,
        eventKind: "smsFailed",
        eventKey: `smsFailed:${String(notification._id)}`,
        subject: "Customer SMS notification failed",
        body: `A ${notification.kind} SMS scheduled for ${notification.scheduledFor} failed delivery.`,
      });
    }
  }

  return {
    matched: true,
    applied: shouldApply,
    resource: "notification",
    status: shouldApply ? nextStatus : notification.status,
  };
}

export const reconcileProviderStatus = internalMutation({
  args: {
    providerMessageSid: v.string(),
    providerStatus: v.string(),
    providerUpdatedAt: v.string(),
    providerErrorCode: v.optional(v.string()),
    providerRawDlrDoneDate: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<ReconcileTwilioMessageStatusResult> => {
    const messageResult = await reconcileMessageStatus(ctx, args);
    if (messageResult) {
      return messageResult;
    }

    const notificationResult = await reconcileNotificationStatus(ctx, args);
    if (notificationResult) {
      return notificationResult;
    }

    const operatorResult: { matched: boolean; status?: string } = await ctx.runMutation(
      internal.operatorNotifications.reconcileProviderStatus,
      {
        providerMessageSid: args.providerMessageSid,
        providerStatus: args.providerStatus,
        providerUpdatedAt: args.providerUpdatedAt,
        ...(args.providerErrorCode !== undefined
          ? { providerErrorCode: args.providerErrorCode }
          : {}),
      },
    );
    if (operatorResult.matched) {
      return {
        matched: true,
        applied: true,
        resource: "operator_notification",
        status: operatorResult.status ?? args.providerStatus,
      };
    }

    return { matched: false };
  },
});

export const recordProviderPricing = internalMutation({
  args: {
    providerMessageSid: v.string(),
    providerUpdatedAt: v.optional(v.string()),
    providerPrice: v.optional(v.number()),
    providerPriceUnit: v.optional(v.string()),
    providerCostUsd: v.optional(v.number()),
    providerNumSegments: v.optional(v.number()),
  },
  handler: async (ctx, args: RecordTwilioMessagePricingArgs) => {
    const message = await ctx.db
      .query("messages")
      .withIndex("by_provider_message_sid", (q) => q.eq("providerMessageSid", args.providerMessageSid))
      .unique();

    if (!message) {
      const notification = await ctx.db
        .query("notifications")
        .withIndex("by_provider_message_id", (q) => q.eq("providerMessageId", args.providerMessageSid))
        .unique();

      if (!notification) {
        const operatorDelivery = await ctx.db
          .query("operator_notification_deliveries")
          .withIndex("by_provider_message_id", (q) =>
            q.eq("providerMessageId", args.providerMessageSid),
          )
          .unique();

        if (!operatorDelivery) {
          return { matched: false, applied: false };
        }

        const operatorDeliveryPatch: Partial<typeof operatorDelivery> = {};
        let operatorDeliveryChanged = false;
        let operatorDeliveryPricingChanged = false;

        if (
          args.providerUpdatedAt !== undefined &&
          args.providerUpdatedAt !== operatorDelivery.providerUpdatedAt
        ) {
          operatorDeliveryPatch.providerUpdatedAt = args.providerUpdatedAt;
          operatorDeliveryChanged = true;
        }
        if (
          args.providerPrice !== undefined &&
          args.providerPrice !== operatorDelivery.providerPrice
        ) {
          operatorDeliveryPatch.providerPrice = args.providerPrice;
          operatorDeliveryChanged = true;
          operatorDeliveryPricingChanged = true;
        }
        if (
          args.providerPriceUnit !== undefined &&
          args.providerPriceUnit !== operatorDelivery.providerPriceUnit
        ) {
          operatorDeliveryPatch.providerPriceUnit = args.providerPriceUnit;
          operatorDeliveryChanged = true;
          operatorDeliveryPricingChanged = true;
        }
        if (
          args.providerCostUsd !== undefined &&
          args.providerCostUsd !== operatorDelivery.providerCostUsd
        ) {
          operatorDeliveryPatch.providerCostUsd = args.providerCostUsd;
          operatorDeliveryChanged = true;
          operatorDeliveryPricingChanged = true;
        }
        if (
          args.providerNumSegments !== undefined &&
          args.providerNumSegments !== operatorDelivery.providerNumSegments
        ) {
          operatorDeliveryPatch.providerNumSegments = args.providerNumSegments;
          operatorDeliveryChanged = true;
          operatorDeliveryPricingChanged = true;
        }

        if (!operatorDeliveryChanged) {
          return { matched: true, applied: false };
        }

        await ctx.db.patch(operatorDelivery._id, operatorDeliveryPatch);

        if (
          operatorDeliveryPricingChanged &&
          args.providerNumSegments !== undefined &&
          operatorDelivery.senderRole === "platform_alert"
        ) {
          const usageResult = await ctx.runMutation(internal.billing.recordAlertSmsUsage, {
            businessId: operatorDelivery.businessId,
            sourceKey: `alert_sms:operator_notification:${String(operatorDelivery._id)}`,
            quantity: args.providerNumSegments,
            recordedAt: args.providerUpdatedAt ?? new Date().toISOString(),
          });

          if (usageResult.syncNeeded) {
            await ctx.scheduler.runAfter(0, internal.billing.syncUsageEventToPolar, {
              usageEventId: usageResult.usageEventId,
            });
          }
        }

        if (operatorDeliveryPricingChanged && args.providerCostUsd !== undefined) {
          await ctx.runMutation(internal.unitEconomics.recordOperatorNotificationProviderCost, {
            businessId: operatorDelivery.businessId,
            operatorNotificationDeliveryId: operatorDelivery._id,
            occurredAt: args.providerUpdatedAt ?? new Date().toISOString(),
            costUsd: args.providerCostUsd,
            ...(args.providerNumSegments !== undefined
              ? { numSegments: args.providerNumSegments }
              : {}),
          });
        }

        return { matched: true, applied: true };
      }

      const notificationPatch: Partial<typeof notification> = {};
      let notificationChanged = false;
      let notificationPricingChanged = false;

      if (
        args.providerUpdatedAt !== undefined &&
        args.providerUpdatedAt !== notification.providerUpdatedAt
      ) {
        notificationPatch.providerUpdatedAt = args.providerUpdatedAt;
        notificationChanged = true;
      }
      if (args.providerPrice !== undefined && args.providerPrice !== notification.providerPrice) {
        notificationPatch.providerPrice = args.providerPrice;
        notificationChanged = true;
        notificationPricingChanged = true;
      }
      if (
        args.providerPriceUnit !== undefined &&
        args.providerPriceUnit !== notification.providerPriceUnit
      ) {
        notificationPatch.providerPriceUnit = args.providerPriceUnit;
        notificationChanged = true;
        notificationPricingChanged = true;
      }
      if (
        args.providerCostUsd !== undefined &&
        args.providerCostUsd !== notification.providerCostUsd
      ) {
        notificationPatch.providerCostUsd = args.providerCostUsd;
        notificationChanged = true;
        notificationPricingChanged = true;
      }
      if (
        args.providerNumSegments !== undefined &&
        args.providerNumSegments !== notification.providerNumSegments
      ) {
        notificationPatch.providerNumSegments = args.providerNumSegments;
        notificationChanged = true;
        notificationPricingChanged = true;
      }

      if (!notificationChanged) {
        return { matched: true, applied: false };
      }

      await ctx.db.patch(notification._id, notificationPatch);

      if (
        notificationPricingChanged &&
        args.providerNumSegments !== undefined &&
        notification.senderRole === "platform_alert"
      ) {
        const usageResult = await ctx.runMutation(internal.billing.recordAlertSmsUsage, {
          businessId: notification.businessId,
          notificationId: notification._id,
          quantity: args.providerNumSegments,
          recordedAt: args.providerUpdatedAt ?? new Date().toISOString(),
        });

        if (usageResult.syncNeeded) {
          await ctx.scheduler.runAfter(0, internal.billing.syncUsageEventToPolar, {
            usageEventId: usageResult.usageEventId,
          });
        }
      }

      if (notificationPricingChanged && args.providerCostUsd !== undefined) {
        await ctx.runMutation(internal.unitEconomics.recordNotificationProviderCost, {
          businessId: notification.businessId,
          notificationId: notification._id,
          occurredAt: args.providerUpdatedAt ?? new Date().toISOString(),
          costUsd: args.providerCostUsd,
          ...(args.providerNumSegments !== undefined
            ? { numSegments: args.providerNumSegments }
            : {}),
        });
      }

      return { matched: true, applied: true };
    }

    const patch: Partial<typeof message> = {};
    let changed = false;
    let pricingChanged = false;

    if (args.providerUpdatedAt !== undefined && args.providerUpdatedAt !== message.providerUpdatedAt) {
      patch.providerUpdatedAt = args.providerUpdatedAt;
      changed = true;
    }
    if (args.providerPrice !== undefined && args.providerPrice !== message.providerPrice) {
      patch.providerPrice = args.providerPrice;
      changed = true;
      pricingChanged = true;
    }
    if (args.providerPriceUnit !== undefined && args.providerPriceUnit !== message.providerPriceUnit) {
      patch.providerPriceUnit = args.providerPriceUnit;
      changed = true;
      pricingChanged = true;
    }
    if (args.providerCostUsd !== undefined && args.providerCostUsd !== message.providerCostUsd) {
      patch.providerCostUsd = args.providerCostUsd;
      changed = true;
      pricingChanged = true;
    }
    if (args.providerNumSegments !== undefined && args.providerNumSegments !== message.providerNumSegments) {
      patch.providerNumSegments = args.providerNumSegments;
      changed = true;
      pricingChanged = true;
    }

    if (!changed) {
      return { matched: true, applied: false };
    }

    await ctx.db.patch(message._id, patch);

    if (
      pricingChanged &&
      args.providerNumSegments !== undefined &&
      message.senderRole === "business_ai" &&
      message.direction === "outbound" &&
      message.channel === "sms"
    ) {
      const usageResult = await ctx.runMutation(internal.billing.recordAiSmsUsage, {
        businessId: message.businessId,
        messageId: message._id,
        quantity: args.providerNumSegments,
        recordedAt: args.providerUpdatedAt ?? new Date().toISOString(),
      });

      if (usageResult.syncNeeded) {
        await ctx.scheduler.runAfter(0, internal.billing.syncUsageEventToPolar, {
          usageEventId: usageResult.usageEventId,
        });
      }
    }

    if (pricingChanged && args.providerCostUsd !== undefined) {
      await ctx.runMutation(internal.unitEconomics.recordSmsProviderCost, {
        businessId: message.businessId,
        messageId: message._id,
        conversationId: message.conversationId,
        occurredAt: args.providerUpdatedAt ?? new Date().toISOString(),
        costUsd: args.providerCostUsd,
        ...(args.providerNumSegments !== undefined
          ? { numSegments: args.providerNumSegments }
          : {}),
      });

      await ctx.runMutation(internal.telemetry.posthog.enqueueEvent, {
        ...serializePostHogEvent({
          eventName: "sms.provider_cost_recorded",
          businessId: message.businessId,
          distinctId: getPostHogDistinctIdForBusinessSystem(String(message.businessId)),
          groupKey: getPostHogBusinessGroupKey(String(message.businessId)),
          conversationId: String(message.conversationId),
          messageId: String(message._id),
          channel: message.channel,
          provider: "twilio",
        properties: {
          messageLinkKey: String(message._id),
          providerMessageSid: args.providerMessageSid,
          providerCostUsd: args.providerCostUsd,
            ...(args.providerUpdatedAt !== undefined
              ? { providerUpdatedAt: args.providerUpdatedAt }
              : {}),
            ...(args.providerPrice !== undefined ? { providerPrice: args.providerPrice } : {}),
            ...(args.providerPriceUnit !== undefined ? { providerPriceUnit: args.providerPriceUnit } : {}),
            ...(args.providerNumSegments !== undefined ? { providerNumSegments: args.providerNumSegments } : {}),
          },
        }),
      });
    }

    return { matched: true, applied: true };
  },
});

export const replayProviderCostRecorded = internalMutation({
  args: {
    providerMessageSid: v.string(),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db
      .query("messages")
      .withIndex("by_provider_message_sid", (q) =>
        q.eq("providerMessageSid", args.providerMessageSid),
      )
      .unique();

    if (!message || message.providerCostUsd === undefined) {
      return { matched: false, enqueued: false };
    }

    await ctx.runMutation(internal.telemetry.posthog.enqueueEvent, {
      ...serializePostHogEvent({
        eventName: "sms.provider_cost_recorded",
        businessId: message.businessId,
        distinctId: getPostHogDistinctIdForBusinessSystem(String(message.businessId)),
        groupKey: getPostHogBusinessGroupKey(String(message.businessId)),
        conversationId: String(message.conversationId),
        messageId: String(message._id),
        channel: message.channel,
        provider: "twilio",
        properties: {
          messageLinkKey: String(message._id),
          providerMessageSid: args.providerMessageSid,
          providerCostUsd: message.providerCostUsd,
          ...(message.providerUpdatedAt !== undefined
            ? { providerUpdatedAt: message.providerUpdatedAt }
            : {}),
          ...(message.providerPrice !== undefined
            ? { providerPrice: message.providerPrice }
            : {}),
          ...(message.providerPriceUnit !== undefined
            ? { providerPriceUnit: message.providerPriceUnit }
            : {}),
          ...(message.providerNumSegments !== undefined
            ? { providerNumSegments: message.providerNumSegments }
            : {}),
        },
      }),
    });

    return { matched: true, enqueued: true };
  },
});
