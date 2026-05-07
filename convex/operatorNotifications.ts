import {
  DateTime } from "luxon";
import { observedInternalAction as internalAction, observedInternalMutation as internalMutation } from "./telemetry/observedFunctions";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc,
  Id } from "./_generated/dataModel";
import {
  type ActionCtx,
  type QueryCtx,
  internalQuery,
} from "./_generated/server";
import { sendTransactionalEmail } from "./lib/providers/email";
import {
  DEFAULT_DAILY_SUMMARY_SEND_TIME,
  buildDefaultOperatorNotificationEventPreferences,
  operatorNotificationChannelValidator,
  operatorNotificationEventKindValidator,
  type OperatorNotificationChannel,
  type OperatorNotificationEventKey,
  type OperatorNotificationEventPreferences,
} from "./lib/operatorNotificationPreferences";

type EffectivePreferences = {
  emailEnabled: boolean;
  smsEnabled: boolean;
  eventPreferences: OperatorNotificationEventPreferences;
  dailySummaryEnabled: boolean;
  dailySummarySendTime: string;
};

type NotificationRecipient = {
  userId: Id<"users">;
  email?: string;
  phone?: string;
  emailEnabled: boolean;
  smsEnabled: boolean;
  eventPreferences: OperatorNotificationEventPreferences;
};

type DigestTarget = {
  businessId: Id<"businesses">;
  businessName: string;
  timezone: string;
  userId: Id<"users">;
  email: string;
  dailySummarySendTime: string;
  isActiveBusinessForUser: boolean;
};

type DigestSummary = {
  callsHandled: number;
  appointmentsBooked: number;
  voiceMessagesCaptured: number;
  pausedSmsRepliesWaiting: number;
  systemIssuesOpened: number;
};

function buildTwilioSmsStatusCallbackUrl(): string {
  const siteUrl = process.env.CONVEX_SITE_URL;
  if (!siteUrl) {
    throw new Error("CONVEX_SITE_URL is required to receive Twilio SMS callbacks.");
  }

  return new URL("/twilio/sms/status", siteUrl).toString();
}

function getEffectivePreferences(
  preferences: Doc<"operator_notification_preferences"> | null,
): EffectivePreferences {
  return {
    emailEnabled: preferences?.emailEnabled ?? true,
    smsEnabled: preferences?.smsEnabled ?? false,
    eventPreferences:
      preferences?.eventPreferences ?? buildDefaultOperatorNotificationEventPreferences(),
    dailySummaryEnabled: preferences?.dailySummaryEnabled ?? true,
    dailySummarySendTime:
      preferences?.dailySummarySendTime ?? DEFAULT_DAILY_SUMMARY_SEND_TIME,
  };
}

function isEventPreferenceEnabled(
  preferences: EffectivePreferences,
  eventKind: OperatorNotificationEventKey,
  channel: OperatorNotificationChannel,
): boolean {
  if (channel === "email" && !preferences.emailEnabled) {
    return false;
  }
  if (channel === "sms" && !preferences.smsEnabled) {
    return false;
  }
  return preferences.eventPreferences[eventKind][channel];
}

function formatEventBody(input: {
  businessName?: string;
  body: string;
}): string {
  return [input.businessName ? `Business: ${input.businessName}` : null, input.body]
    .filter((part): part is string => Boolean(part))
    .join("\n\n");
}

function buildOperatorSmsBody(input: {
  subject: string;
  body: string;
}): string {
  const body = `${input.subject}\n${input.body}`.trim();
  if (body.length <= 600) {
    return body;
  }
  return `${body.slice(0, 597)}...`;
}

function estimateSmsSegments(body: string): number {
  const gsmBasic =
    "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ" +
    " !\"#¤%&'()*+,-./0123456789:;<=>?" +
    "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
  const gsmExtended = "^{}\\[~]|€";
  let gsmSeptetLength = 0;

  for (const char of body) {
    if (gsmBasic.includes(char)) {
      gsmSeptetLength += 1;
      continue;
    }
    if (gsmExtended.includes(char)) {
      gsmSeptetLength += 2;
      continue;
    }

    const unicodeLength = body.length;
    return unicodeLength <= 70 ? 1 : Math.max(1, Math.ceil(unicodeLength / 67));
  }

  return gsmSeptetLength <= 160
    ? 1
    : Math.max(1, Math.ceil(gsmSeptetLength / 153));
}

function parseSendTime(sendTime: string): { hour: number; minute: number } {
  const [hourRaw, minuteRaw] = sendTime.split(":");
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return { hour: 8, minute: 0 };
  }
  return { hour, minute };
}

function sendTimeSortValue(sendTime: string): number {
  const { hour, minute } = parseSendTime(sendTime);
  return hour * 60 + minute;
}

function normalizeDigestEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashDigestRecipientEmail(email: string): string {
  let hash = 0x811c9dc5;
  for (const char of normalizeDigestEmail(email)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function normalizeDigestBusinessName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function shouldPreferDigestTarget(candidate: DigestTarget, existing: DigestTarget): boolean {
  if (candidate.isActiveBusinessForUser !== existing.isActiveBusinessForUser) {
    return candidate.isActiveBusinessForUser;
  }
  return (
    sendTimeSortValue(candidate.dailySummarySendTime) <
    sendTimeSortValue(existing.dailySummarySendTime)
  );
}

function deliveryErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function mergeDocsById<T extends { _id: string }>(collections: Array<Array<T>>): Array<T> {
  const byId = new Map<string, T>();
  for (const collection of collections) {
    for (const doc of collection) {
      byId.set(doc._id, doc);
    }
  }
  return Array.from(byId.values());
}

function hasAlertSmsSender(input: {
  fromPhoneNumber?: string;
  twilioMessagingServiceSid?: string;
}): boolean {
  return Boolean(input.fromPhoneNumber || input.twilioMessagingServiceSid);
}

export const listRecipientsForEvent = internalQuery({
  args: {
    businessId: v.id("businesses"),
    eventKind: v.union(
      v.literal("voiceMessage"),
      v.literal("pausedSms"),
      v.literal("smsFailed"),
      v.literal("calendarSync"),
      v.literal("transferFailed"),
      v.literal("aiReplyFailed"),
    ),
  },
  handler: async (ctx: QueryCtx, args): Promise<Array<NotificationRecipient>> => {
    const [memberships, smsPolicy] = await Promise.all([
      ctx.db
        .query("business_memberships")
        .withIndex("by_business_id", (q) => q.eq("businessId", args.businessId))
        .collect(),
      ctx.runQuery(internal.billing.getSmsCapabilityPolicy, {
        businessId: args.businessId,
        capability: "alert",
      }),
    ]);
    const alertSmsSenderConfigured = hasAlertSmsSender(smsPolicy);

    const recipients: Array<NotificationRecipient> = [];
    for (const membership of memberships) {
      if (membership.status !== "active") {
        continue;
      }

      const user = await ctx.db.get(membership.userId);
      if (!user) {
        continue;
      }

      const preference = await ctx.db
        .query("operator_notification_preferences")
        .withIndex("by_business_id_and_user_id", (q) =>
          q.eq("businessId", args.businessId).eq("userId", user._id),
        )
        .unique();
      const effective = getEffectivePreferences(preference);
      const emailEnabled =
        Boolean(user.email) && isEventPreferenceEnabled(effective, args.eventKind, "email");
      const smsEnabled =
        alertSmsSenderConfigured &&
        Boolean(user.phone && user.phoneVerificationTime) &&
        isEventPreferenceEnabled(effective, args.eventKind, "sms");

      if (!emailEnabled && !smsEnabled) {
        continue;
      }

      recipients.push({
        userId: user._id,
        ...(user.email ? { email: user.email } : {}),
        ...(user.phone && user.phoneVerificationTime ? { phone: user.phone } : {}),
        emailEnabled,
        smsEnabled,
        eventPreferences: effective.eventPreferences,
      });
    }

    return recipients;
  },
});

export const getBusinessForNotification = internalQuery({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.businessId);
  },
});

export const getDirectRecipient = internalQuery({
  args: {
    businessId: v.id("businesses"),
    userId: v.id("users"),
    channel: operatorNotificationChannelValidator,
  },
  handler: async (ctx, args): Promise<NotificationRecipient | null> => {
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_user_id_and_business_id", (q) =>
        q.eq("userId", args.userId).eq("businessId", args.businessId),
      )
      .unique();
    if (!membership || membership.status !== "active") {
      return null;
    }

    const user = await ctx.db.get(args.userId);
    if (!user) {
      return null;
    }
    if (args.channel === "email" && !user.email) {
      return null;
    }
    if (args.channel === "sms" && (!user.phone || !user.phoneVerificationTime)) {
      return null;
    }

    return {
      userId: user._id,
      ...(user.email ? { email: user.email } : {}),
      ...(user.phone && user.phoneVerificationTime ? { phone: user.phone } : {}),
      emailEnabled: args.channel === "email",
      smsEnabled: args.channel === "sms",
      eventPreferences: buildDefaultOperatorNotificationEventPreferences(),
    };
  },
});

export const hasDeliveryForEvent = internalQuery({
  args: {
    userId: v.id("users"),
    channel: operatorNotificationChannelValidator,
    eventKey: v.string(),
  },
  handler: async (ctx, args): Promise<boolean> => {
    const delivery = await ctx.db
      .query("operator_notification_deliveries")
      .withIndex("by_user_id_and_channel_and_event_key", (q) =>
        q.eq("userId", args.userId).eq("channel", args.channel).eq("eventKey", args.eventKey),
      )
      .unique();

    return delivery !== null;
  },
});

export const reserveDelivery = internalMutation({
  args: {
    businessId: v.id("businesses"),
    userId: v.id("users"),
    eventKind: operatorNotificationEventKindValidator,
    eventKey: v.string(),
    channel: operatorNotificationChannelValidator,
    subject: v.string(),
    body: v.string(),
    scheduledFor: v.optional(v.string()),
    digestForDate: v.optional(v.string()),
    recipientEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("operator_notification_deliveries")
      .withIndex("by_user_id_and_channel_and_event_key", (q) =>
        q.eq("userId", args.userId).eq("channel", args.channel).eq("eventKey", args.eventKey),
      )
      .unique();
    if (existing) {
      return { deliveryId: existing._id, created: false };
    }

    if (args.eventKind === "dailyDigest") {
      const existingDigest = (
        await ctx.db
          .query("operator_notification_deliveries")
          .withIndex("by_business_id_and_event_kind", (q) =>
            q.eq("businessId", args.businessId).eq("eventKind", "dailyDigest"),
          )
          .collect()
      ).find(
        (delivery) => delivery.channel === args.channel && delivery.eventKey === args.eventKey,
      );
      if (existingDigest) {
        return { deliveryId: existingDigest._id, created: false };
      }

      if (args.channel === "email" && args.digestForDate && args.recipientEmail) {
        const recipientEmail = normalizeDigestEmail(args.recipientEmail);
        const existingDigestDeliveries = await ctx.db
          .query("operator_notification_deliveries")
          .withIndex("by_business_id_and_event_kind", (q) =>
            q.eq("businessId", args.businessId).eq("eventKind", "dailyDigest"),
          )
          .collect();
        for (const delivery of existingDigestDeliveries) {
          if (
            delivery.channel !== "email" ||
            delivery.digestForDate !== args.digestForDate
          ) {
            continue;
          }
          const existingRecipient = await ctx.db.get(delivery.userId);
          if (
            existingRecipient?.email &&
            normalizeDigestEmail(existingRecipient.email) === recipientEmail
          ) {
            return { deliveryId: delivery._id, created: false };
          }
        }
      }
    }

    const deliveryId = await ctx.db.insert("operator_notification_deliveries", {
      businessId: args.businessId,
      userId: args.userId,
      eventKind: args.eventKind,
      eventKey: args.eventKey,
      channel: args.channel,
      status: "pending",
      subject: args.subject,
      body: args.body,
      ...(args.scheduledFor !== undefined ? { scheduledFor: args.scheduledFor } : {}),
      ...(args.digestForDate !== undefined ? { digestForDate: args.digestForDate } : {}),
      createdAt: new Date().toISOString(),
    });

    return { deliveryId, created: true };
  },
});

export const markDeliverySent = internalMutation({
  args: {
    deliveryId: v.id("operator_notification_deliveries"),
    providerMessageId: v.optional(v.string()),
    providerStatus: v.optional(v.string()),
    providerUpdatedAt: v.optional(v.string()),
    senderRole: v.optional(v.union(v.literal("platform_alert"), v.literal("business_ai"))),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.deliveryId, {
      status: "sent",
      sentAt: new Date().toISOString(),
      ...(args.providerMessageId !== undefined
        ? { providerMessageId: args.providerMessageId }
        : {}),
      ...(args.providerStatus !== undefined ? { providerStatus: args.providerStatus } : {}),
      ...(args.providerUpdatedAt !== undefined
        ? { providerUpdatedAt: args.providerUpdatedAt }
        : {}),
      ...(args.senderRole !== undefined ? { senderRole: args.senderRole } : {}),
    });
    return null;
  },
});

export const markDeliveryFailed = internalMutation({
  args: {
    deliveryId: v.id("operator_notification_deliveries"),
    error: v.string(),
    providerStatus: v.optional(v.string()),
    providerUpdatedAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.deliveryId, {
      status: "failed",
      error: args.error,
      ...(args.providerStatus !== undefined ? { providerStatus: args.providerStatus } : {}),
      ...(args.providerUpdatedAt !== undefined
        ? { providerUpdatedAt: args.providerUpdatedAt }
        : {}),
    });
    return null;
  },
});

export const reconcileProviderStatus = internalMutation({
  args: {
    providerMessageSid: v.string(),
    providerStatus: v.string(),
    providerUpdatedAt: v.string(),
    providerErrorCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const delivery = await ctx.db
      .query("operator_notification_deliveries")
      .withIndex("by_provider_message_id", (q) =>
        q.eq("providerMessageId", args.providerMessageSid),
      )
      .unique();
    if (!delivery) {
      return { matched: false };
    }

    const normalizedStatus = args.providerStatus.trim().toLowerCase();
    const status =
      normalizedStatus === "failed" || normalizedStatus === "undelivered"
        ? "failed"
        : normalizedStatus === "delivered"
          ? "delivered"
          : delivery.status;

    await ctx.db.patch(delivery._id, {
      status,
      providerStatus: args.providerStatus,
      providerUpdatedAt: args.providerUpdatedAt,
      ...(args.providerErrorCode !== undefined
        ? { providerErrorCode: args.providerErrorCode }
        : {}),
    });

    return { matched: true, status };
  },
});

async function deliverEmail(
  ctx: ActionCtx,
  input: {
    deliveryId: Id<"operator_notification_deliveries">;
    to: string;
    subject: string;
    body: string;
  },
): Promise<void> {
  const result = await sendTransactionalEmail(ctx, {
    template: "operator_alert",
    to: input.to,
    subject: input.subject,
    variables: {
      subject: input.subject,
      body: input.body,
    },
  });

  await ctx.runMutation(internal.operatorNotifications.markDeliverySent, {
    deliveryId: input.deliveryId,
    providerMessageId: result.messageId,
    providerStatus: "sent",
    providerUpdatedAt: new Date().toISOString(),
  });
}

async function deliverSms(
  ctx: ActionCtx,
  input: {
    businessId: Id<"businesses">;
    deliveryId: Id<"operator_notification_deliveries">;
    to: string;
    subject: string;
    body: string;
  },
): Promise<void> {
  const smsPolicy = await ctx.runQuery(internal.billing.getSmsCapabilityPolicy, {
    businessId: input.businessId,
    capability: "alert",
  });
  if (!smsPolicy.allowed) {
    throw new Error("Alert SMS quota reached.");
  }
  if (!smsPolicy.fromPhoneNumber && !smsPolicy.twilioMessagingServiceSid) {
    throw new Error("No alert SMS sender is configured.");
  }

  const body = buildOperatorSmsBody({ subject: input.subject, body: input.body });
  const usageSourceKey = `alert_sms:operator_notification:${String(input.deliveryId)}`;
  const providerUpdatedAt = new Date().toISOString();
  let reservedAlertUsage:
    | {
        usageEventId?: Id<"billing_usage_events">;
        syncNeeded?: boolean;
      }
    | null = null;
  let messageAcceptedByProvider = false;

  try {
    if (smsPolicy.senderRole === "platform_alert") {
      const reservedUsage = await ctx.runMutation(internal.billing.reserveAlertSmsUsage, {
        businessId: input.businessId,
        sourceKey: usageSourceKey,
        estimatedSegments: estimateSmsSegments(body),
        recordedAt: providerUpdatedAt,
      });
      if (!reservedUsage.allowed) {
        throw new Error("Alert SMS quota reached.");
      }
      reservedAlertUsage = {
        ...(reservedUsage.usageEventId ? { usageEventId: reservedUsage.usageEventId } : {}),
        ...(reservedUsage.syncNeeded !== undefined
          ? { syncNeeded: reservedUsage.syncNeeded }
          : {}),
      };
      if (reservedUsage.syncNeeded && reservedUsage.usageEventId) {
        await ctx.scheduler.runAfter(0, internal.billing.syncUsageEventToPolar, {
          usageEventId: reservedUsage.usageEventId,
        });
      }
    }

    const result: { providerMessageSid: string; providerStatus: string } = await ctx.runAction(
      internal.integrations.twilioSms.sendMessage,
      {
        to: input.to,
        body,
        statusCallbackUrl: buildTwilioSmsStatusCallbackUrl(),
        ...(smsPolicy.fromPhoneNumber ? { from: smsPolicy.fromPhoneNumber } : {}),
        ...(smsPolicy.twilioMessagingServiceSid
          ? { messagingServiceSid: smsPolicy.twilioMessagingServiceSid }
          : {}),
      },
    );
    messageAcceptedByProvider = true;

    await ctx.runMutation(internal.operatorNotifications.markDeliverySent, {
      deliveryId: input.deliveryId,
      providerMessageId: result.providerMessageSid,
      providerStatus: result.providerStatus,
      providerUpdatedAt,
      senderRole: smsPolicy.senderRole,
    });
  } catch (error) {
    if (
      smsPolicy.senderRole === "platform_alert" &&
      !messageAcceptedByProvider &&
      reservedAlertUsage?.usageEventId
    ) {
      const releasedUsage = await ctx.runMutation(internal.billing.recordAlertSmsUsage, {
        businessId: input.businessId,
        sourceKey: usageSourceKey,
        quantity: 0,
        recordedAt: new Date().toISOString(),
      });
      if (releasedUsage.syncNeeded && releasedUsage.usageEventId) {
        await ctx.scheduler.runAfter(0, internal.billing.syncUsageEventToPolar, {
          usageEventId: releasedUsage.usageEventId,
        });
      }
    }
    throw error;
  }
}

async function deliverChannel(
  ctx: ActionCtx,
  input: {
    businessId: Id<"businesses">;
    userId: Id<"users">;
    channel: OperatorNotificationChannel;
    to: string;
    eventKind: "dailyDigest" | "test" | OperatorNotificationEventKey;
    eventKey: string;
    subject: string;
    body: string;
    scheduledFor?: string;
    digestForDate?: string;
  },
): Promise<{ attempted: boolean; sent: boolean; error?: string }> {
  const reservation: { deliveryId: Id<"operator_notification_deliveries">; created: boolean } =
    await ctx.runMutation(internal.operatorNotifications.reserveDelivery, {
      businessId: input.businessId,
      userId: input.userId,
      eventKind: input.eventKind,
      eventKey: input.eventKey,
      channel: input.channel,
      subject: input.subject,
      body: input.body,
      ...(input.scheduledFor !== undefined ? { scheduledFor: input.scheduledFor } : {}),
      ...(input.digestForDate !== undefined ? { digestForDate: input.digestForDate } : {}),
      ...(input.eventKind === "dailyDigest" && input.channel === "email"
        ? { recipientEmail: input.to }
        : {}),
    });

  if (!reservation.created) {
    return { attempted: false, sent: false };
  }

  try {
    if (input.channel === "email") {
      await deliverEmail(ctx, {
        deliveryId: reservation.deliveryId,
        to: input.to,
        subject: input.subject,
        body: input.body,
      });
    } else {
      await deliverSms(ctx, {
        businessId: input.businessId,
        deliveryId: reservation.deliveryId,
        to: input.to,
        subject: input.subject,
        body: input.body,
      });
    }
    return { attempted: true, sent: true };
  } catch (error) {
    const errorMessage = deliveryErrorMessage(error);
    await ctx.runMutation(internal.operatorNotifications.markDeliveryFailed, {
      deliveryId: reservation.deliveryId,
      error: errorMessage,
      providerStatus: "failed",
      providerUpdatedAt: new Date().toISOString(),
    });
    return { attempted: true, sent: false, error: errorMessage };
  }
}

export const dispatchEvent = internalAction({
  args: {
    businessId: v.id("businesses"),
    eventKind: v.union(
      v.literal("voiceMessage"),
      v.literal("pausedSms"),
      v.literal("smsFailed"),
      v.literal("calendarSync"),
      v.literal("transferFailed"),
      v.literal("aiReplyFailed"),
    ),
    eventKey: v.string(),
    subject: v.string(),
    body: v.string(),
  },
  handler: async (ctx, args): Promise<{ attempted: number; sent: number }> => {
    const business: Doc<"businesses"> | null = await ctx.runQuery(
      internal.operatorNotifications.getBusinessForNotification,
      { businessId: args.businessId },
    );
    const recipients: Array<NotificationRecipient> = await ctx.runQuery(
      internal.operatorNotifications.listRecipientsForEvent,
      {
        businessId: args.businessId,
        eventKind: args.eventKind,
      },
    );
    const body = formatEventBody({
      ...(business?.name ? { businessName: business.name } : {}),
      body: args.body,
    });
    let attempted = 0;
    let sent = 0;

    for (const recipient of recipients) {
      if (recipient.emailEnabled && recipient.email) {
        const result = await deliverChannel(ctx, {
          businessId: args.businessId,
          userId: recipient.userId,
          channel: "email",
          to: recipient.email,
          eventKind: args.eventKind,
          eventKey: args.eventKey,
          subject: args.subject,
          body,
        });
        attempted += result.attempted ? 1 : 0;
        sent += result.sent ? 1 : 0;
      }

      if (recipient.smsEnabled && recipient.phone) {
        const result = await deliverChannel(ctx, {
          businessId: args.businessId,
          userId: recipient.userId,
          channel: "sms",
          to: recipient.phone,
          eventKind: args.eventKind,
          eventKey: args.eventKey,
          subject: args.subject,
          body,
        });
        attempted += result.attempted ? 1 : 0;
        sent += result.sent ? 1 : 0;
      }
    }

    return { attempted, sent };
  },
});

export const dispatchDirectNotification = internalAction({
  args: {
    businessId: v.id("businesses"),
    userId: v.id("users"),
    channel: operatorNotificationChannelValidator,
    eventKind: operatorNotificationEventKindValidator,
    eventKey: v.string(),
    subject: v.string(),
    body: v.string(),
    digestForDate: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ sent: boolean; error?: string }> => {
    const recipient: NotificationRecipient | null = await ctx.runQuery(
      internal.operatorNotifications.getDirectRecipient,
      {
        businessId: args.businessId,
        userId: args.userId,
        channel: args.channel,
      },
    );
    if (!recipient) {
      throw new Error(
        args.channel === "sms"
          ? "A verified phone number is required for SMS notifications."
          : "An email address is required for email notifications.",
      );
    }

    const to = args.channel === "email" ? recipient.email : recipient.phone;
    if (!to) {
      throw new Error("Notification recipient is missing a destination.");
    }

    const result = await deliverChannel(ctx, {
      businessId: args.businessId,
      userId: args.userId,
      channel: args.channel,
      to,
      eventKind: args.eventKind,
      eventKey: args.eventKey,
      subject: args.subject,
      body: args.body,
      ...(args.digestForDate !== undefined ? { digestForDate: args.digestForDate } : {}),
    });

    return {
      sent: result.sent,
      ...(result.error !== undefined ? { error: result.error } : {}),
    };
  },
});

export const listDailyDigestTargets = internalQuery({
  args: {},
  handler: async (ctx): Promise<Array<DigestTarget>> => {
    const businesses = await ctx.db.query("businesses").collect();
    const targetsByRecipient = new Map<string, DigestTarget>();

    for (const business of businesses) {
      const memberships = await ctx.db
        .query("business_memberships")
        .withIndex("by_business_id", (q) => q.eq("businessId", business._id))
        .collect();
      for (const membership of memberships) {
        if (membership.status !== "active") {
          continue;
        }

        const user = await ctx.db.get(membership.userId);
        if (!user?.email) {
          continue;
        }

        const preferences = await ctx.db
          .query("operator_notification_preferences")
          .withIndex("by_business_id_and_user_id", (q) =>
            q.eq("businessId", business._id).eq("userId", user._id),
          )
          .unique();
        const effective = getEffectivePreferences(preferences);
        if (!effective.dailySummaryEnabled || !effective.emailEnabled) {
          continue;
        }

        const target = {
          businessId: business._id,
          businessName: business.name,
          timezone: business.timezone,
          userId: user._id,
          email: user.email,
          dailySummarySendTime: effective.dailySummarySendTime,
          isActiveBusinessForUser: user.activeBusinessId === business._id,
        };
        const recipientKey = [
          normalizeDigestEmail(user.email),
          normalizeDigestBusinessName(business.name),
        ].join(":");
        const existing = targetsByRecipient.get(recipientKey);
        if (!existing || shouldPreferDigestTarget(target, existing)) {
          targetsByRecipient.set(recipientKey, target);
        }
      }
    }

    return Array.from(targetsByRecipient.values());
  },
});

export const getDailyDigestSummary = internalQuery({
  args: {
    businessId: v.id("businesses"),
    startIso: v.string(),
    endIso: v.string(),
  },
  handler: async (ctx, args): Promise<DigestSummary> => {
    const startMs = Date.parse(args.startIso);
    const endMs = Date.parse(args.endIso);
    const [
      calls,
      appointments,
      voiceItems,
      calendarIssues,
      messagesCreatedInWindow,
      messagesUpdatedInWindow,
      notificationsScheduledInWindow,
      notificationsUpdatedInWindow,
      notificationsCreatedInWindow,
    ] =
      await Promise.all([
        ctx.db
          .query("calls")
          .withIndex("by_business_id_and_started_at", (q) =>
            q.eq("businessId", args.businessId).gte("startedAt", args.startIso).lt("startedAt", args.endIso),
          )
          .collect(),
        ctx.db
          .query("appointments")
          .withIndex("by_business_id", (q) =>
            q
              .eq("businessId", args.businessId)
              .gte("_creationTime", startMs)
              .lt("_creationTime", endMs),
          )
          .collect(),
        ctx.db
          .query("inbox_items")
          .withIndex("by_business_id_and_kind", (q) =>
            q
              .eq("businessId", args.businessId)
              .eq("kind", "voice_message")
              .gte("_creationTime", startMs)
              .lt("_creationTime", endMs),
          )
          .collect(),
        ctx.db
          .query("inbox_items")
          .withIndex("by_business_id_and_kind", (q) =>
            q
              .eq("businessId", args.businessId)
              .eq("kind", "calendar_sync_issue")
              .gte("_creationTime", startMs)
              .lt("_creationTime", endMs),
          )
          .collect(),
        ctx.db
          .query("messages")
          .withIndex("by_business_id", (q) =>
            q
              .eq("businessId", args.businessId)
              .gte("_creationTime", startMs)
              .lt("_creationTime", endMs),
          )
          .collect(),
        ctx.db
          .query("messages")
          .withIndex("by_business_id_and_provider_updated_at", (q) =>
            q
              .eq("businessId", args.businessId)
              .gte("providerUpdatedAt", args.startIso)
              .lt("providerUpdatedAt", args.endIso),
          )
          .collect(),
        ctx.db
          .query("notifications")
          .withIndex("by_business_id_and_scheduled_for", (q) =>
            q
              .eq("businessId", args.businessId)
              .gte("scheduledFor", args.startIso)
              .lt("scheduledFor", args.endIso),
          )
          .collect(),
        ctx.db
          .query("notifications")
          .withIndex("by_business_id_and_provider_updated_at", (q) =>
            q
              .eq("businessId", args.businessId)
              .gte("providerUpdatedAt", args.startIso)
              .lt("providerUpdatedAt", args.endIso),
          )
          .collect(),
        ctx.db
          .query("notifications")
          .withIndex("by_business_id", (q) =>
            q
              .eq("businessId", args.businessId)
              .gte("_creationTime", startMs)
              .lt("_creationTime", endMs),
          )
          .collect(),
      ]);

    const messages = mergeDocsById([messagesCreatedInWindow, messagesUpdatedInWindow]);
    const notifications = mergeDocsById([
      notificationsScheduledInWindow,
      notificationsUpdatedInWindow,
      notificationsCreatedInWindow,
    ]);
    const inWindowMs = (value: number) => value >= startMs && value < endMs;
    const inWindowIso = (value: string | undefined) =>
      value !== undefined && inWindowMs(Date.parse(value));
    const pausedSmsMessages = messages.filter(
      (message) =>
        message.direction === "inbound" &&
        message.channel === "sms" &&
        inWindowMs(message._creationTime),
    );
    let pausedSmsRepliesWaiting = 0;
    for (const message of pausedSmsMessages) {
      const conversation = await ctx.db.get(message.conversationId);
      if (conversation?.automationState === "human_handoff") {
        pausedSmsRepliesWaiting += 1;
      }
    }

    const failedAiMessages = messages.filter(
      (message) =>
        message.aiGenerated &&
        message.channel === "sms" &&
        (message.status === "failed" || message.status === "undelivered") &&
        (inWindowIso(message.providerUpdatedAt) || inWindowMs(message._creationTime)),
    ).length;
    const failedCustomerNotifications = notifications.filter(
      (notification) =>
        (notification.status === "failed" || notification.status === "undelivered") &&
        (inWindowIso(notification.providerUpdatedAt) ||
          inWindowIso(notification.scheduledFor) ||
          inWindowMs(notification._creationTime)),
    ).length;
    const failedTransfers = calls.filter(
      (call) =>
        call.transferState === "failed" &&
        (inWindowIso(call.endedAt) || inWindowIso(call.startedAt) || inWindowMs(call._creationTime)),
    ).length;

    return {
      callsHandled: calls.filter((call) => call.status !== "in_progress" && call.status !== "open").length,
      appointmentsBooked: appointments.filter((appointment) =>
        inWindowMs(appointment._creationTime),
      ).length,
      voiceMessagesCaptured: voiceItems.filter((item) => inWindowMs(item._creationTime)).length,
      pausedSmsRepliesWaiting,
      systemIssuesOpened:
        calendarIssues.filter((item) => inWindowMs(item._creationTime)).length +
        failedAiMessages +
        failedCustomerNotifications +
        failedTransfers,
    };
  },
});

function buildDigestBody(input: {
  businessName: string;
  localDate: string;
  summary: DigestSummary;
}): string {
  return [
    `Daily summary for ${input.businessName}`,
    `Date: ${input.localDate}`,
    "",
    `Calls handled: ${input.summary.callsHandled}`,
    `Appointments booked: ${input.summary.appointmentsBooked}`,
    `Voice messages captured: ${input.summary.voiceMessagesCaptured}`,
    `Paused SMS replies waiting: ${input.summary.pausedSmsRepliesWaiting}`,
    `System issues opened: ${input.summary.systemIssuesOpened}`,
  ].join("\n");
}

export const dispatchDueDailyDigests = internalAction({
  args: {},
  handler: async (ctx): Promise<{ attempted: number; sent: number }> => {
    const targets: Array<DigestTarget> = await ctx.runQuery(
      internal.operatorNotifications.listDailyDigestTargets,
      {},
    );
    const now = DateTime.utc();
    let attempted = 0;
    let sent = 0;
    const summaryCache = new Map<string, DigestSummary>();

    for (const target of targets) {
      const localNow = now.setZone(target.timezone);
      if (!localNow.isValid) {
        continue;
      }

      const { hour, minute } = parseSendTime(target.dailySummarySendTime);
      const sendAt = localNow.startOf("day").set({ hour, minute });
      if (localNow < sendAt) {
        continue;
      }

      const digestDay = localNow.minus({ days: 1 }).startOf("day");
      const digestForDate = digestDay.toISODate();
      if (!digestForDate) {
        continue;
      }
      const startIso = digestDay.toUTC().toISO();
      const endIso = digestDay.plus({ days: 1 }).toUTC().toISO();
      if (!startIso || !endIso) {
        continue;
      }

      const eventKey = [
        "dailyDigest",
        String(target.businessId),
        hashDigestRecipientEmail(target.email),
        digestForDate,
      ].join(":");
      const alreadyReserved: boolean = await ctx.runQuery(
        internal.operatorNotifications.hasDeliveryForEvent,
        { userId: target.userId, channel: "email", eventKey },
      );
      if (alreadyReserved) {
        continue;
      }

      const summaryCacheKey = `${String(target.businessId)}:${startIso}:${endIso}`;
      let summary = summaryCache.get(summaryCacheKey);
      if (!summary) {
        summary = await ctx.runQuery(internal.operatorNotifications.getDailyDigestSummary, {
          businessId: target.businessId,
          startIso,
          endIso,
        });
        summaryCache.set(summaryCacheKey, summary);
      }
      const subject = `Daily summary for ${target.businessName}`;
      const body = buildDigestBody({
        businessName: target.businessName,
        localDate: digestForDate,
        summary,
      });
      const result = await deliverChannel(ctx, {
        businessId: target.businessId,
        userId: target.userId,
        channel: "email",
        to: target.email,
        eventKind: "dailyDigest",
        eventKey,
        subject,
        body,
        digestForDate,
      });
      attempted += result.attempted ? 1 : 0;
      sent += result.sent ? 1 : 0;
    }

    return { attempted, sent };
  },
});
