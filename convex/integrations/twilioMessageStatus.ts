import { v } from "convex/values";

import { internalMutation, type MutationCtx } from "../_generated/server";
import { mapTwilioStatusToMessageStatus, mapTwilioStatusToNotificationStatus, shouldApplyMessageStatusTransition, shouldApplyNotificationStatusTransition } from "../lib/twilioMessageStatus";

type ReconcileTwilioMessageStatusArgs = {
  providerMessageSid: string;
  providerStatus: string;
  providerUpdatedAt: string;
  providerErrorCode?: string;
  providerRawDlrDoneDate?: string;
};

type ReconcileTwilioMessageStatusResult =
  | { matched: false }
  | {
      matched: true;
      applied: boolean;
      resource: "message" | "notification";
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

    return { matched: false };
  },
});
