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
  buildDefaultOperatorNotificationEventPreferences,
  operatorNotificationChannelValidator,
  operatorNotificationEventKindValidator,
  type OperatorNotificationChannel,
  type OperatorNotificationEventKey,
  type OperatorNotificationEventKind,
  type OperatorNotificationEventPreferences,
} from "./lib/operatorNotificationPreferences";
import {
  ALERT_SMS_COMPLIANCE_FOOTER,
  OPERATOR_SMS_DISCLOSURE_VERSION,
} from "./lib/smsConsent";
import { isPlatformAlertSmsOptedOut } from "./lib/smsConsentState";
import {
  getMessageContentExpiresAt,
  scheduleOperatorNotificationDeliveryContentExpiration,
} from "./privacy/retention";

type EffectivePreferences = {
  emailEnabled: boolean;
  smsEnabled: boolean;
  smsConsentGranted: boolean;
  eventPreferences: OperatorNotificationEventPreferences;
};

type NotificationRecipient = {
  userId: Id<"users">;
  email?: string;
  phone?: string;
  emailEnabled: boolean;
  smsEnabled: boolean;
  eventPreferences: OperatorNotificationEventPreferences;
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
    smsConsentGranted: Boolean(
      preferences?.smsConsentGrantedAt &&
        preferences.smsConsentDisclosureVersion === OPERATOR_SMS_DISCLOSURE_VERSION &&
        (!preferences.smsConsentRevokedAt ||
          preferences.smsConsentRevokedAt < preferences.smsConsentGrantedAt),
    ),
    eventPreferences:
      preferences?.eventPreferences ?? buildDefaultOperatorNotificationEventPreferences(),
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
  const content = `${input.subject}\n${input.body}`.trim();
  const body = `${content}\n${ALERT_SMS_COMPLIANCE_FOOTER}`.trim();
  if (body.length <= 600) {
    return body;
  }
  const maxContentLength = Math.max(0, 600 - ALERT_SMS_COMPLIANCE_FOOTER.length - 4);
  return `${content.slice(0, maxContentLength)}...\n${ALERT_SMS_COMPLIANCE_FOOTER}`;
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

function getSensitiveDeliveryContentExpiresAt(
  eventKind: OperatorNotificationEventKind,
): string | undefined {
  return eventKind === "voiceMessage" || eventKind === "pausedSms"
    ? getMessageContentExpiresAt()
    : undefined;
}

function deliveryErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function hasAlertSmsSender(input: {
  fromPhoneNumber?: string;
  twilioMessagingServiceSid?: string;
}): boolean {
  return Boolean(input.fromPhoneNumber || input.twilioMessagingServiceSid);
}

export const isPlatformAlertPhoneOptedOut = internalQuery({
  args: {
    phone: v.string(),
  },
  handler: async (ctx, args): Promise<boolean> => {
    return await isPlatformAlertSmsOptedOut(ctx, args.phone);
  },
});

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
        effective.smsConsentGranted &&
        !(user.phone ? await isPlatformAlertSmsOptedOut(ctx, user.phone) : false) &&
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
    if (args.channel === "sms") {
      const phone = user.phone;
      if (!phone) {
        return null;
      }
      const preference = await ctx.db
        .query("operator_notification_preferences")
        .withIndex("by_business_id_and_user_id", (q) =>
          q.eq("businessId", args.businessId).eq("userId", args.userId),
        )
        .unique();
      const effective = getEffectivePreferences(preference);
      if (!effective.smsConsentGranted || await isPlatformAlertSmsOptedOut(ctx, phone)) {
        return null;
      }
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
    contentExpiresAt: v.optional(v.string()),
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
      ...(args.contentExpiresAt !== undefined
        ? {
            contentRetentionStatus: "active" as const,
            contentExpiresAt: args.contentExpiresAt,
          }
        : {}),
      createdAt: new Date().toISOString(),
    });
    if (args.contentExpiresAt !== undefined) {
      await scheduleOperatorNotificationDeliveryContentExpiration(
        ctx,
        deliveryId,
        args.contentExpiresAt,
      );
    }

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
  const optedOut: boolean = await ctx.runQuery(
    internal.operatorNotifications.isPlatformAlertPhoneOptedOut,
    { phone: input.to },
  );
  if (optedOut) {
    throw new Error("Recipient has opted out of SMS alerts.");
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
    eventKind: OperatorNotificationEventKind;
    eventKey: string;
    subject: string;
    body: string;
    scheduledFor?: string;
    contentExpiresAt?: string;
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
      ...(input.contentExpiresAt !== undefined
        ? { contentExpiresAt: input.contentExpiresAt }
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
    const contentExpiresAt = getSensitiveDeliveryContentExpiresAt(args.eventKind);
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
          ...(contentExpiresAt !== undefined ? { contentExpiresAt } : {}),
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
          ...(contentExpiresAt !== undefined ? { contentExpiresAt } : {}),
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
    });

    return {
      sent: result.sent,
      ...(result.error !== undefined ? { error: result.error } : {}),
    };
  },
});

