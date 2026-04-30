import { v } from "convex/values";

import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { action, internalQuery, mutation, query } from "../_generated/server";
import { ensureCurrentUser, requireCurrentUser, requireMembership } from "../lib/auth";
import {
  DEFAULT_DAILY_SUMMARY_SEND_TIME,
  buildDefaultOperatorNotificationEventPreferences,
  hasEnabledSmsEventPreference,
  normalizeDailySummarySendTime,
  operatorNotificationChannelValidator,
  operatorNotificationEventPreferencesValidator,
  type OperatorNotificationChannel,
  type OperatorNotificationEventPreferences,
} from "../lib/operatorNotificationPreferences";

const localeValidator = v.union(v.literal("en"), v.literal("fr"));

type NotificationPreferencesPayload = {
  emailEnabled: boolean;
  smsEnabled: boolean;
  eventPreferences: OperatorNotificationEventPreferences;
  dailySummaryEnabled: boolean;
  dailySummarySendTime: string;
  email: string | null;
  phone: string | null;
  phoneVerified: boolean;
  canUseSms: boolean;
};

type NotificationActionContext = {
  businessId: Id<"businesses">;
  businessName: string;
  userId: Id<"users">;
  email: string | null;
  phone: string | null;
  phoneVerified: boolean;
};

function resolveNotificationPreferencesPayload(input: {
  user: Doc<"users">;
  preferences: Doc<"operator_notification_preferences"> | null;
}): NotificationPreferencesPayload {
  const phoneVerified = Boolean(input.user.phone && input.user.phoneVerificationTime);
  const eventPreferences =
    input.preferences?.eventPreferences ?? buildDefaultOperatorNotificationEventPreferences();

  return {
    emailEnabled: input.preferences?.emailEnabled ?? true,
    smsEnabled: phoneVerified ? (input.preferences?.smsEnabled ?? false) : false,
    eventPreferences: phoneVerified
      ? eventPreferences
      : {
          voiceMessage: { ...eventPreferences.voiceMessage, sms: false },
          pausedSms: { ...eventPreferences.pausedSms, sms: false },
          smsFailed: { ...eventPreferences.smsFailed, sms: false },
          calendarSync: { ...eventPreferences.calendarSync, sms: false },
          transferFailed: { ...eventPreferences.transferFailed, sms: false },
          aiReplyFailed: { ...eventPreferences.aiReplyFailed, sms: false },
        },
    dailySummaryEnabled: input.preferences?.dailySummaryEnabled ?? true,
    dailySummarySendTime:
      input.preferences?.dailySummarySendTime ?? DEFAULT_DAILY_SUMMARY_SEND_TIME,
    email: input.user.email ?? null,
    phone: input.user.phone ?? null,
    phoneVerified,
    canUseSms: phoneVerified,
  };
}

function assertSmsPreferencesAllowed(input: {
  user: Doc<"users">;
  smsEnabled: boolean;
  eventPreferences: OperatorNotificationEventPreferences;
}) {
  if (
    !input.user.phone ||
    !input.user.phoneVerificationTime
  ) {
    if (input.smsEnabled || hasEnabledSmsEventPreference(input.eventPreferences)) {
      throw new Error("A verified phone number is required for SMS notifications.");
    }
  }
}

export const getPreferredLocale = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireCurrentUser(ctx);
    return user.preferredLocale ?? null;
  },
});

export const updatePreferredLocale = mutation({
  args: {
    locale: localeValidator,
  },
  handler: async (ctx, args) => {
    const user = await ensureCurrentUser(ctx);
    await ctx.db.patch(user._id, {
      preferredLocale: args.locale,
    });
    return args.locale;
  },
});

export const getNotificationPreferences = query({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args): Promise<NotificationPreferencesPayload> => {
    const user = await requireCurrentUser(ctx);
    await requireMembership(ctx, args.businessId);

    const preferences = await ctx.db
      .query("operator_notification_preferences")
      .withIndex("by_business_id_and_user_id", (q) =>
        q.eq("businessId", args.businessId).eq("userId", user._id),
      )
      .unique();

    return resolveNotificationPreferencesPayload({ user, preferences });
  },
});

export const updateNotificationPreferences = mutation({
  args: {
    businessId: v.id("businesses"),
    emailEnabled: v.boolean(),
    smsEnabled: v.boolean(),
    eventPreferences: operatorNotificationEventPreferencesValidator,
    dailySummaryEnabled: v.boolean(),
    dailySummarySendTime: v.string(),
  },
  handler: async (ctx, args): Promise<NotificationPreferencesPayload> => {
    const user = await ensureCurrentUser(ctx);
    await requireMembership(ctx, args.businessId);
    const dailySummarySendTime = normalizeDailySummarySendTime(
      args.dailySummarySendTime,
    );

    assertSmsPreferencesAllowed({
      user,
      smsEnabled: args.smsEnabled,
      eventPreferences: args.eventPreferences,
    });

    const existing = await ctx.db
      .query("operator_notification_preferences")
      .withIndex("by_business_id_and_user_id", (q) =>
        q.eq("businessId", args.businessId).eq("userId", user._id),
      )
      .unique();
    const patch = {
      emailEnabled: args.emailEnabled,
      smsEnabled: args.smsEnabled,
      eventPreferences: args.eventPreferences,
      dailySummaryEnabled: args.dailySummaryEnabled,
      dailySummarySendTime,
      updatedAt: new Date().toISOString(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("operator_notification_preferences", {
        businessId: args.businessId,
        userId: user._id,
        ...patch,
      });
    }

    return {
      ...patch,
      email: user.email ?? null,
      phone: user.phone ?? null,
      phoneVerified: Boolean(user.phone && user.phoneVerificationTime),
      canUseSms: Boolean(user.phone && user.phoneVerificationTime),
    };
  },
});

export const getNotificationActionContext = internalQuery({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args): Promise<NotificationActionContext> => {
    const user = await requireCurrentUser(ctx);
    await requireMembership(ctx, args.businessId);
    const business = await ctx.db.get(args.businessId);
    if (!business) {
      throw new Error("Business not found.");
    }

    return {
      businessId: args.businessId,
      businessName: business.name,
      userId: user._id,
      email: user.email ?? null,
      phone: user.phone ?? null,
      phoneVerified: Boolean(user.phone && user.phoneVerificationTime),
    };
  },
});

export const sendTestOperatorNotification = action({
  args: {
    businessId: v.id("businesses"),
    channel: operatorNotificationChannelValidator,
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ channel: OperatorNotificationChannel; sent: boolean }> => {
    const context: NotificationActionContext = await ctx.runQuery(
      internal.users.preferences.getNotificationActionContext,
      {
        businessId: args.businessId,
      },
    );

    if (args.channel === "email" && !context.email) {
      throw new Error("An email address is required for email notifications.");
    }
    if (args.channel === "sms" && (!context.phone || !context.phoneVerified)) {
      throw new Error("A verified phone number is required for SMS notifications.");
    }

    const result: { sent: boolean } = await ctx.runAction(
      internal.operatorNotifications.dispatchDirectNotification,
      {
        businessId: args.businessId,
        userId: context.userId,
        channel: args.channel,
        eventKind: "test",
        eventKey: `test:${String(args.businessId)}:${String(context.userId)}:${args.channel}:${Date.now()}`,
        subject: "Test notification",
        body: `This is a test ${args.channel.toUpperCase()} notification for ${context.businessName}.`,
      },
    );

    if (!result.sent) {
      throw new Error("Unable to send the test notification.");
    }

    return { channel: args.channel, sent: true };
  },
});
