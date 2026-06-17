import {
  v } from "convex/values";
import { observedMutation as mutation } from "../telemetry/observedFunctions";

import { internal } from "../_generated/api";
import type { Doc,
  Id } from "../_generated/dataModel";
import { internalQuery, query } from "../_generated/server";
import { ensureCurrentUser, requireCurrentUser, requireMembership } from "../lib/auth";
import { dashboardAbuseRateLimiter } from "../lib/components";
import {
  buildDefaultOperatorNotificationEventPreferences,
  hasEnabledSmsEventPreference,
  operatorNotificationChannelValidator,
  operatorNotificationEventPreferencesValidator,
  type OperatorNotificationChannel,
  type OperatorNotificationEventPreferences,
} from "../lib/operatorNotificationPreferences";
import {
  OPERATOR_SMS_DISCLOSURE_TEXT,
  OPERATOR_SMS_DISCLOSURE_VERSION,
} from "../lib/smsConsent";
import { recordSmsConsentEvent } from "../lib/smsConsentState";

import { observedAction as action } from "../telemetry/observedFunctions";
const localeValidator = v.union(v.literal("en"), v.literal("fr"));
export const TEST_OPERATOR_NOTIFICATION_RATE_LIMIT_MESSAGE =
  "Too many test notifications. Please try again later.";

type NotificationPreferencesPayload = {
  emailEnabled: boolean;
  smsEnabled: boolean;
  eventPreferences: OperatorNotificationEventPreferences;
  email: string | null;
  phone: string | null;
  phoneVerified: boolean;
  canUseSms: boolean;
  smsUnavailableReason: SmsUnavailableReason;
  smsConsentGranted: boolean;
  smsConsentDisclosureVersion: string;
  smsConsentDisclosureText: string;
};

type NotificationActionContext = {
  businessId: Id<"businesses">;
  businessName: string;
  userId: Id<"users">;
  email: string | null;
  phone: string | null;
  phoneVerified: boolean;
};

type SmsUnavailableReason = "phone_unverified" | "sender_missing" | null;

function getSmsUnavailableReason(input: {
  user: Doc<"users">;
  alertSmsSenderConfigured: boolean;
}): SmsUnavailableReason {
  if (!input.user.phone || !input.user.phoneVerificationTime) {
    return "phone_unverified";
  }
  if (!input.alertSmsSenderConfigured) {
    return "sender_missing";
  }
  return null;
}

function isAlertSmsSenderConfigured(input: {
  fromPhoneNumber?: string;
  twilioMessagingServiceSid?: string;
}): boolean {
  return Boolean(input.fromPhoneNumber || input.twilioMessagingServiceSid);
}

function getSmsPreferenceErrorMessage(reason: SmsUnavailableReason): string {
  if (reason === "sender_missing") {
    return "An alert SMS sender is required for SMS notifications.";
  }
  return "A verified phone number is required for SMS notifications.";
}

function resolveNotificationPreferencesPayload(input: {
  user: Doc<"users">;
  preferences: Doc<"operator_notification_preferences"> | null;
  smsUnavailableReason: SmsUnavailableReason;
}): NotificationPreferencesPayload {
  const phoneVerified = Boolean(input.user.phone && input.user.phoneVerificationTime);
  const canUseSms = input.smsUnavailableReason === null;
  const grantedAt = input.preferences?.smsConsentGrantedAt;
  const revokedAt = input.preferences?.smsConsentRevokedAt;
  const smsConsentGranted = Boolean(
    grantedAt &&
      input.preferences?.smsConsentDisclosureVersion === OPERATOR_SMS_DISCLOSURE_VERSION &&
      (!revokedAt || revokedAt < grantedAt),
  );
  const canSendSms = canUseSms && smsConsentGranted;
  const eventPreferences =
    input.preferences?.eventPreferences ?? buildDefaultOperatorNotificationEventPreferences();

  return {
    emailEnabled: input.preferences?.emailEnabled ?? true,
    smsEnabled: canSendSms ? (input.preferences?.smsEnabled ?? false) : false,
    eventPreferences: canSendSms
      ? eventPreferences
      : {
          voiceMessage: { ...eventPreferences.voiceMessage, sms: false },
          pausedSms: { ...eventPreferences.pausedSms, sms: false },
          smsFailed: { ...eventPreferences.smsFailed, sms: false },
          calendarSync: { ...eventPreferences.calendarSync, sms: false },
          transferFailed: { ...eventPreferences.transferFailed, sms: false },
          aiReplyFailed: { ...eventPreferences.aiReplyFailed, sms: false },
        },
    email: input.user.email ?? null,
    phone: input.user.phone ?? null,
    phoneVerified,
    canUseSms,
    smsUnavailableReason: input.smsUnavailableReason,
    smsConsentGranted,
    smsConsentDisclosureVersion: OPERATOR_SMS_DISCLOSURE_VERSION,
    smsConsentDisclosureText: OPERATOR_SMS_DISCLOSURE_TEXT,
  };
}

function assertSmsPreferencesAllowed(input: {
  smsUnavailableReason: SmsUnavailableReason;
  smsEnabled: boolean;
  eventPreferences: OperatorNotificationEventPreferences;
  smsConsentGranted: boolean;
  smsConsentAccepted?: boolean;
}) {
  const requestedSms = input.smsEnabled || hasEnabledSmsEventPreference(input.eventPreferences);
  if (input.smsUnavailableReason !== null && requestedSms) {
    throw new Error(getSmsPreferenceErrorMessage(input.smsUnavailableReason));
  }
  if (requestedSms && !input.smsConsentGranted && input.smsConsentAccepted !== true) {
    throw new Error("SMS notification consent is required before enabling SMS alerts.");
  }
}

function logDashboardRateLimitBlocked(input: {
  limiter: string;
  reason: string;
  userId: Id<"users">;
  businessId: Id<"businesses">;
  channel: OperatorNotificationChannel;
}) {
  console.warn(
    JSON.stringify({
      scope: "dashboard_abuse_control",
      decision: "blocked",
      ...input,
    }),
  );
}

async function assertTestNotificationAllowed(
  ctx: Parameters<typeof dashboardAbuseRateLimiter.limit>[0],
  input: {
    userId: Id<"users">;
    businessId: Id<"businesses">;
    channel: OperatorNotificationChannel;
  },
): Promise<void> {
  const limit = await dashboardAbuseRateLimiter.limit(
    ctx,
    "dashboardTestNotificationPerUserPerHour",
    {
      key: `${String(input.userId)}:${input.channel}`,
    },
  );
  if (!limit.ok) {
    logDashboardRateLimitBlocked({
      limiter: "dashboardTestNotificationPerUserPerHour",
      reason: "rate_limit_user_channel",
      userId: input.userId,
      businessId: input.businessId,
      channel: input.channel,
    });
    throw new Error(TEST_OPERATOR_NOTIFICATION_RATE_LIMIT_MESSAGE);
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
    const smsPolicy = await ctx.runQuery(internal.billing.getSmsCapabilityPolicy, {
      businessId: args.businessId,
      capability: "alert",
    });

    const preferences = await ctx.db
      .query("operator_notification_preferences")
      .withIndex("by_business_id_and_user_id", (q) =>
        q.eq("businessId", args.businessId).eq("userId", user._id),
      )
      .unique();

    return resolveNotificationPreferencesPayload({
      user,
      preferences,
      smsUnavailableReason: getSmsUnavailableReason({
        user,
        alertSmsSenderConfigured: isAlertSmsSenderConfigured(smsPolicy),
      }),
    });
  },
});

export const updateNotificationPreferences = mutation({
  args: {
    businessId: v.id("businesses"),
    emailEnabled: v.boolean(),
    smsEnabled: v.boolean(),
    eventPreferences: operatorNotificationEventPreferencesValidator,
    smsConsentAccepted: v.optional(v.boolean()),
    dailySummaryEnabled: v.optional(v.boolean()),
    dailySummarySendTime: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<NotificationPreferencesPayload> => {
    const user = await ensureCurrentUser(ctx);
    await requireMembership(ctx, args.businessId);
    const smsPolicy = await ctx.runQuery(internal.billing.getSmsCapabilityPolicy, {
      businessId: args.businessId,
      capability: "alert",
    });
    const smsUnavailableReason = getSmsUnavailableReason({
      user,
      alertSmsSenderConfigured: isAlertSmsSenderConfigured(smsPolicy),
    });

    const existing = await ctx.db
      .query("operator_notification_preferences")
      .withIndex("by_business_id_and_user_id", (q) =>
        q.eq("businessId", args.businessId).eq("userId", user._id),
      )
      .unique();
    const existingGrantedAt = existing?.smsConsentGrantedAt;
    const existingRevokedAt = existing?.smsConsentRevokedAt;
    const existingSmsConsentGranted = Boolean(
      existingGrantedAt &&
        existing?.smsConsentDisclosureVersion === OPERATOR_SMS_DISCLOSURE_VERSION &&
        (!existingRevokedAt || existingRevokedAt < existingGrantedAt),
    );

    assertSmsPreferencesAllowed({
      smsUnavailableReason,
      smsEnabled: args.smsEnabled,
      eventPreferences: args.eventPreferences,
      smsConsentGranted: existingSmsConsentGranted,
      ...(args.smsConsentAccepted !== undefined
        ? { smsConsentAccepted: args.smsConsentAccepted }
        : {}),
    });
    const now = new Date().toISOString();
    const requestedSms = args.smsEnabled || hasEnabledSmsEventPreference(args.eventPreferences);
    const consentGrantPatch =
      requestedSms && args.smsConsentAccepted === true
        ? {
            smsConsentGrantedAt: now,
            smsConsentSource: "operator_notification_settings",
            smsConsentDisclosureVersion: OPERATOR_SMS_DISCLOSURE_VERSION,
          }
        : {};
    const consentRevokePatch =
      existing?.smsEnabled === true && args.smsEnabled === false
        ? {
            smsConsentRevokedAt: now,
            smsConsentSource: "operator_notification_settings",
            smsConsentDisclosureVersion: OPERATOR_SMS_DISCLOSURE_VERSION,
          }
        : {};
    const patch = {
      emailEnabled: args.emailEnabled,
      smsEnabled: args.smsEnabled,
      eventPreferences: args.eventPreferences,
      ...consentGrantPatch,
      ...consentRevokePatch,
      updatedAt: now,
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

    if (user.phone && requestedSms && args.smsConsentAccepted === true) {
      await recordSmsConsentEvent(ctx, {
        businessId: args.businessId,
        userId: user._id,
        recipientType: "operator",
        phone: user.phone,
        action: "granted",
        source: "operator_notification_settings",
        disclosureVersion: OPERATOR_SMS_DISCLOSURE_VERSION,
        disclosureText: OPERATOR_SMS_DISCLOSURE_TEXT,
        createdAt: now,
      });
    }
    if (user.phone && existing?.smsEnabled === true && args.smsEnabled === false) {
      await recordSmsConsentEvent(ctx, {
        businessId: args.businessId,
        userId: user._id,
        recipientType: "operator",
        phone: user.phone,
        action: "revoked",
        source: "operator_notification_settings",
        disclosureVersion: OPERATOR_SMS_DISCLOSURE_VERSION,
        disclosureText: OPERATOR_SMS_DISCLOSURE_TEXT,
        createdAt: now,
      });
    }

    return resolveNotificationPreferencesPayload({
      user,
      preferences: existing
        ? ({ ...existing, ...patch } as Doc<"operator_notification_preferences">)
        : ({
            businessId: args.businessId,
            userId: user._id,
            ...patch,
          } as Doc<"operator_notification_preferences">),
      smsUnavailableReason,
    });
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
    if (args.channel === "sms") {
      const smsPolicy = await ctx.runQuery(internal.billing.getSmsCapabilityPolicy, {
        businessId: args.businessId,
        capability: "alert",
      });
      if (!isAlertSmsSenderConfigured(smsPolicy)) {
        throw new Error("An alert SMS sender is required before test SMS notifications can be sent.");
      }
      if (!smsPolicy.allowed) {
        throw new Error("Alert SMS quota reached.");
      }
    }
    await assertTestNotificationAllowed(ctx, {
      userId: context.userId,
      businessId: context.businessId,
      channel: args.channel,
    });

    const result: { sent: boolean; error?: string } = await ctx.runAction(
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
      throw new Error(result.error ?? "Unable to send the test notification.");
    }

    return { channel: args.channel, sent: true };
  },
});
