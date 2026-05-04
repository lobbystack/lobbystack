import {
  v } from "convex/values";
import { observedInternalAction as internalAction, observedInternalMutation as internalMutation, observedMutation as mutation } from "../telemetry/observedFunctions";
import {
  type ActionCtx,
  internalQuery,
} from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { retrier } from "../lib/components";
import { requireMembership } from "../lib/auth";
import {
  getPostHogBusinessGroupKey,
  getPostHogDistinctIdForBusinessSystem,
} from "../telemetry/shared";
import {
  serializePostHogEvent,
} from "../telemetry/posthog";
import {
  buildLocalizedAppointmentNotificationBody,
  inferRuntimeLocaleFromBusinessContext,
  normalizeRuntimeLocale,
} from "../lib/runtimeLocale";

type AppointmentNotificationKind = "appointment_reminder" | "booking_confirmation";

type NotificationDeliveryContext = {
  businessId: Id<"businesses">;
  notificationId: Id<"notifications">;
  appointmentId: Id<"appointments">;
  to: string;
  from?: string;
  twilioMessagingServiceSid?: string;
  kind: AppointmentNotificationKind;
  serviceId: Id<"services">;
  serviceName: string;
  startsAt: string;
  timezone: string;
  locale: "en" | "fr";
  senderRole: "platform_alert" | "business_ai";
};

type DeliverNotificationResult = {
  delivered: true;
  providerMessageId: string;
};

function isAppointmentNotificationKind(kind: string): kind is AppointmentNotificationKind {
  return kind === "appointment_reminder" || kind === "booking_confirmation";
}

function buildTwilioSmsStatusCallbackUrl(): string {
  const siteUrl = process.env.CONVEX_SITE_URL;
  if (!siteUrl) {
    throw new Error("CONVEX_SITE_URL is required to receive Twilio SMS callbacks.");
  }

  return new URL("/twilio/sms/status", siteUrl).toString();
}

const GSM_7_BASIC_CHARACTERS = new Set(
  Array.from(
    "@\u00a3$\u00a5\u00e8\u00e9\u00f9\u00ec\u00f2\u00c7\n\u00d8\u00f8\r\u00c5\u00e5\u0394_\u03a6\u0393\u039b\u03a9\u03a0\u03a8\u03a3\u0398\u039e\u00c6\u00e6\u00df\u00c9 !\"#\u00a4%&'()*+,-./0123456789:;<=>?\u00a1ABCDEFGHIJKLMNOPQRSTUVWXYZ\u00c4\u00d6\u00d1\u00dc`\u00bfabcdefghijklmnopqrstuvwxyz\u00e4\u00f6\u00f1\u00fc\u00e0",
  ),
);
const GSM_7_EXTENDED_CHARACTERS = new Set(["^", "{", "}", "\\", "[", "~", "]", "|", "\u20ac"]);

function estimateSmsSegments(body: string): number {
  const characters = Array.from(body);
  let gsmSeptetLength = 0;

  for (const character of characters) {
    if (GSM_7_BASIC_CHARACTERS.has(character)) {
      gsmSeptetLength += 1;
      continue;
    }

    if (GSM_7_EXTENDED_CHARACTERS.has(character)) {
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

function estimateAlertSmsSegmentsUpperBound(body: string): number {
  return estimateSmsSegments(body);
}

export const getNotification = internalQuery({
  args: {
    notificationId: v.id("notifications"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.notificationId);
  },
});

export const getNotificationDeliveryContext = internalQuery({
  args: {
    notificationId: v.id("notifications"),
  },
  handler: async (ctx, args): Promise<NotificationDeliveryContext | null> => {
    const notification = await ctx.db.get(args.notificationId);
    if (!notification) {
      return null;
    }

    if (notification.channel !== "sms") {
      throw new Error("Only SMS notifications are supported.");
    }

    if (notification.status !== "pending") {
      throw new Error("Notification is no longer pending.");
    }

    if (!notification.relatedId) {
      throw new Error("Notification is missing a related appointment.");
    }

    const appointmentId = await ctx.db.normalizeId(
      "appointments",
      notification.relatedId,
    );
    if (!appointmentId) {
      throw new Error("Notification is missing a valid appointment reference.");
    }

    const appointment = await ctx.db.get(appointmentId);
    if (!appointment) {
      throw new Error("Appointment not found for notification.");
    }
    if (appointment.status === "canceled" || appointment.status === "cancelled") {
      throw new Error("Appointment is no longer confirmed.");
    }

    const [service, contact, business, profile, smsPolicy] =
      await Promise.all([
      ctx.db.get(appointment.serviceId),
      ctx.db.get(appointment.contactId),
      ctx.db.get(notification.businessId),
      ctx.db
        .query("receptionist_profiles")
        .withIndex("by_business_id", (q) => q.eq("businessId", notification.businessId))
        .unique(),
      ctx.runQuery(internal.billing.getSmsCapabilityPolicy, {
        businessId: notification.businessId,
        capability: "alert",
      }),
    ]);

    if (!service) {
      throw new Error("Service not found for notification.");
    }

    if (!contact) {
      throw new Error("Contact not found for notification.");
    }

    if (!business) {
      throw new Error("Business not found for notification.");
    }
    if (!isAppointmentNotificationKind(notification.kind)) {
      throw new Error("Unsupported notification kind.");
    }

    if (!smsPolicy.allowed) {
      throw new Error("Alert SMS quota reached. Upgrade to continue sending notifications.");
    }

    if (!smsPolicy.fromPhoneNumber && !smsPolicy.twilioMessagingServiceSid) {
      throw new Error(
        smsPolicy.senderMode === "business_phone"
          ? "At least one active SMS-enabled phone number must be mapped to the business."
          : "Configure the shared alert SMS sender before delivering hosted notifications.",
      );
    }

    const locale =
      normalizeRuntimeLocale(contact.preferredLocale) ??
      normalizeRuntimeLocale(business.defaultLocale) ??
      inferRuntimeLocaleFromBusinessContext({
        greeting: profile?.greeting,
        smsInstructions: profile?.smsInstructions,
        summary: profile?.summary,
        bookingPolicy: profile?.bookingPolicy,
      }) ??
      "en";
    return {
      businessId: notification.businessId,
      notificationId: notification._id,
      appointmentId,
      to: contact.phone,
      ...(smsPolicy.fromPhoneNumber ? { from: smsPolicy.fromPhoneNumber } : {}),
      ...(smsPolicy.twilioMessagingServiceSid
        ? { twilioMessagingServiceSid: smsPolicy.twilioMessagingServiceSid }
        : {}),
      kind: notification.kind,
      serviceId: service._id,
      serviceName: service.name,
      startsAt: appointment.startsAt,
      timezone: appointment.timezone,
      locale,
      senderRole: smsPolicy.senderRole,
    };
  },
});

export const markNotificationSent = internalMutation({
  args: {
    notificationId: v.id("notifications"),
    providerMessageId: v.optional(v.string()),
    providerStatus: v.optional(v.string()),
    providerUpdatedAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.notificationId, {
      status: "sent",
      providerMessageId: args.providerMessageId,
      ...(args.providerStatus !== undefined ? { providerStatus: args.providerStatus } : {}),
      ...(args.providerUpdatedAt !== undefined
        ? { providerUpdatedAt: args.providerUpdatedAt }
        : {}),
    });
    return null;
  },
});

export const markNotificationSendFailed = internalMutation({
  args: {
    notificationId: v.id("notifications"),
    providerUpdatedAt: v.string(),
    providerStatus: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.notificationId);
    if (!notification) {
      throw new Error("Notification not found.");
    }

    await ctx.db.patch(args.notificationId, {
      status: "failed",
      ...(args.providerStatus !== undefined ? { providerStatus: args.providerStatus } : {}),
      providerUpdatedAt: args.providerUpdatedAt,
    });

    await ctx.scheduler.runAfter(0, internal.operatorNotifications.dispatchEvent, {
      businessId: notification.businessId,
      eventKind: "smsFailed",
      eventKey: `smsFailed:${String(args.notificationId)}`,
      subject: "Customer SMS notification failed",
      body: `A ${notification.kind} SMS scheduled for ${notification.scheduledFor} failed.`,
    });

    return null;
  },
});

export const markNotificationPending = internalMutation({
  args: {
    notificationId: v.id("notifications"),
  },
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.notificationId);
    if (!notification || notification.status !== "scheduled") {
      return { ok: false };
    }

    await ctx.db.patch(args.notificationId, { status: "pending" });
    return { ok: true };
  },
});

export const cancelScheduledNotificationsForAppointment = internalMutation({
  args: {
    appointmentId: v.id("appointments"),
  },
  handler: async (ctx, args) => {
    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_kind_and_related_id", (q) =>
        q.eq("kind", "appointment_reminder").eq("relatedId", String(args.appointmentId)),
      )
      .collect();

    let cancelled = 0;
    for (const notification of notifications) {
      if (notification.status !== "scheduled" && notification.status !== "pending") {
        continue;
      }
      await ctx.db.patch(notification._id, { status: "canceled" });
      cancelled += 1;
    }

    return { cancelled };
  },
});

export const listDueScheduledNotifications = internalQuery({
  args: {
    nowIso: v.string(),
  },
  handler: async (ctx, args) => {
    const scheduled = await ctx.db
      .query("notifications")
      .withIndex("by_status_and_scheduled_for", (q) => q.eq("status", "scheduled"))
      .collect();

    const now = new Date(args.nowIso).getTime();
    return scheduled.filter(
      (notification) => new Date(notification.scheduledFor).getTime() <= now,
    );
  },
});

export const createAppointmentNotifications = internalMutation({
  args: {
    appointmentId: v.id("appointments"),
  },
  handler: async (ctx, args) => {
    const appointment = await ctx.db.get(args.appointmentId);
    if (!appointment) {
      throw new Error("Appointment not found.");
    }
    if (appointment.status !== "confirmed") {
      return null;
    }
    const business = await ctx.db.get(appointment.businessId);
    const senderRole =
      business?.deploymentMode === "cloud" || business?.deploymentMode === "development"
        ? "platform_alert"
        : "business_ai";

    if (appointment.sourceChannel !== "sms") {
      await ctx.runMutation(
        internal.notifications.reminders.ensureBookingConfirmationNotification,
        {
          appointmentId: args.appointmentId,
        },
      );
    }

    const reminderDate = new Date(appointment.startsAt);
    reminderDate.setHours(reminderDate.getHours() - 24);
    if (reminderDate.getTime() > Date.now()) {
      const reminderNotificationId = await ctx.db.insert("notifications", {
        businessId: appointment.businessId,
        channel: "sms",
        kind: "appointment_reminder",
        relatedId: String(args.appointmentId),
        scheduledFor: reminderDate.toISOString(),
        status: "scheduled",
        senderRole,
      });

      await ctx.scheduler.runAt(
        reminderDate.getTime(),
        internal.notifications.reminders.deliverScheduledNotification,
        {
          notificationId: reminderNotificationId,
        },
      );
    }

    return null;
  },
});

export const ensureBookingConfirmationNotification = internalMutation({
  args: {
    appointmentId: v.id("appointments"),
  },
  handler: async (ctx, args) => {
    const appointment = await ctx.db.get(args.appointmentId);
    if (!appointment) {
      throw new Error("Appointment not found.");
    }
    const business = await ctx.db.get(appointment.businessId);
    const senderRole =
      business?.deploymentMode === "cloud" || business?.deploymentMode === "development"
        ? "platform_alert"
        : "business_ai";

    const existing = await ctx.db
      .query("notifications")
      .withIndex("by_kind_and_related_id", (q) =>
        q.eq("kind", "booking_confirmation").eq("relatedId", String(args.appointmentId)),
      )
      .take(1);

    const existingNotification = existing[0];
    if (existingNotification) {
      return {
        notificationId: existingNotification._id,
        created: false,
      };
    }

    const notificationId = await ctx.db.insert("notifications", {
      businessId: appointment.businessId,
      channel: "sms",
      kind: "booking_confirmation",
      relatedId: String(args.appointmentId),
      scheduledFor: new Date().toISOString(),
      status: "pending",
      senderRole,
    });

    await retrier.run(ctx, internal.notifications.reminders.deliverNotification, {
      notificationId,
    });

    return {
      notificationId,
      created: true,
    };
  },
});

export const deliverScheduledNotification = internalAction({
  args: {
    notificationId: v.id("notifications"),
  },
  handler: async (ctx, args) => {
    const result: { ok: boolean } = await ctx.runMutation(
      internal.notifications.reminders.markNotificationPending,
      {
        notificationId: args.notificationId,
      },
    );
    if (!result.ok) {
      return null;
    }
    await retrier.run(ctx, internal.notifications.reminders.deliverNotification, {
      notificationId: args.notificationId,
    });
    return null;
  },
});

export const deliverNotification = internalAction({
  args: {
    notificationId: v.id("notifications"),
  },
  handler: async (ctx, args): Promise<DeliverNotificationResult> => {
    const deliveryContext: NotificationDeliveryContext | null = await ctx.runQuery(
      internal.notifications.reminders.getNotificationDeliveryContext,
      { notificationId: args.notificationId },
    );
    if (!deliveryContext) {
      throw new Error("Notification not found.");
    }

    let messageAcceptedByProvider = false;
    let reservedAlertUsage:
      | {
          usageEventId?: Id<"billing_usage_events">;
          syncNeeded?: boolean;
        }
      | null = null;
    try {
      const localizedServiceName = await ctx.runAction(
        internal.services.localizedNames.ensureLocalizedServiceName,
        {
          serviceId: deliveryContext.serviceId,
          locale: deliveryContext.locale,
        },
      );
      const body = buildLocalizedAppointmentNotificationBody({
        kind: deliveryContext.kind,
        serviceName: localizedServiceName,
        startsAt: deliveryContext.startsAt,
        timezone: deliveryContext.timezone,
        locale: deliveryContext.locale,
      });
      const providerUpdatedAt = new Date().toISOString();
      if (deliveryContext.senderRole === "platform_alert") {
        const reservedUsage = await ctx.runMutation(
          internal.billing.reserveAlertSmsUsage,
          {
            businessId: deliveryContext.businessId,
            notificationId: args.notificationId,
            estimatedSegments: estimateAlertSmsSegmentsUpperBound(body),
            recordedAt: providerUpdatedAt,
          },
        );
        if (!reservedUsage.allowed) {
          throw new Error("Alert SMS quota reached. Upgrade to continue sending notifications.");
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
          to: deliveryContext.to,
          body,
          statusCallbackUrl: buildTwilioSmsStatusCallbackUrl(),
          ...(deliveryContext.from ? { from: deliveryContext.from } : {}),
          ...(deliveryContext.twilioMessagingServiceSid
            ? { messagingServiceSid: deliveryContext.twilioMessagingServiceSid }
            : {}),
        },
      );
      messageAcceptedByProvider = true;

      await ctx.runMutation(internal.notifications.reminders.markNotificationSent, {
        notificationId: args.notificationId,
        providerMessageId: result.providerMessageSid,
        providerStatus: result.providerStatus,
        providerUpdatedAt,
      });

      return {
        delivered: true,
        providerMessageId: result.providerMessageSid,
      };
    } catch (error) {
      if (
        deliveryContext.senderRole === "platform_alert" &&
        !messageAcceptedByProvider &&
        reservedAlertUsage?.usageEventId
      ) {
        const releasedUsage = await ctx.runMutation(internal.billing.recordAlertSmsUsage, {
          businessId: deliveryContext.businessId,
          notificationId: args.notificationId,
          quantity: 0,
          recordedAt: new Date().toISOString(),
        });
        if (releasedUsage.syncNeeded && releasedUsage.usageEventId) {
          await ctx.scheduler.runAfter(0, internal.billing.syncUsageEventToPolar, {
            usageEventId: releasedUsage.usageEventId,
          });
        }
      }
      await ctx.runMutation(internal.notifications.reminders.markNotificationSendFailed, {
        notificationId: args.notificationId,
        providerUpdatedAt: new Date().toISOString(),
        providerStatus: "failed",
      });
      const distinctId = getPostHogDistinctIdForBusinessSystem(
        String(deliveryContext.businessId),
      );
      const groupKey = getPostHogBusinessGroupKey(String(deliveryContext.businessId));

      if (deliveryContext.kind === "booking_confirmation") {
        await ctx.runMutation(
          internal.telemetry.posthog.enqueueEvent,
          serializePostHogEvent({
            eventName: "appointment.confirmation_notification_failed",
            distinctId,
            businessId: deliveryContext.businessId,
            groupKey,
            appointmentId: String(deliveryContext.appointmentId),
            channel: "sms",
            provider: "twilio",
            properties: {
              notificationId: String(deliveryContext.notificationId),
              appointmentId: String(deliveryContext.appointmentId),
              notificationKind: deliveryContext.kind,
              status: "failed",
            },
          }),
        );
      }
      await ctx.runMutation(
        internal.telemetry.posthog.enqueueEvent,
        serializePostHogEvent({
          eventName: "workflow.failed",
          distinctId,
          businessId: deliveryContext.businessId,
          groupKey,
          appointmentId: String(deliveryContext.appointmentId),
          channel: "sms",
          provider: "twilio",
          properties: {
            workflowName: "notifications.deliver",
            notificationId: String(deliveryContext.notificationId),
            appointmentId: String(deliveryContext.appointmentId),
            notificationKind: deliveryContext.kind,
            status: "failed",
          },
        }),
      );
      throw error;
    }
  },
});

export const dispatchDueNotifications = internalAction({
  args: {},
  handler: async (ctx: ActionCtx): Promise<{ count: number }> => {
    const due: Array<Doc<"notifications">> = await ctx.runQuery(
      internal.notifications.reminders.listDueScheduledNotifications,
      {
        nowIso: new Date().toISOString(),
      },
    );

    for (const notification of due) {
      await ctx.runAction(internal.notifications.reminders.deliverScheduledNotification, {
        notificationId: notification._id,
      });
    }

    return { count: due.length };
  },
});

export const queueOperatorAlert = mutation({
  args: {
    businessId: v.id("businesses"),
    title: v.string(),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.businessId);
    const inboxItemId = await ctx.db.insert("inbox_items", {
      businessId: args.businessId,
      kind: "operator_alert",
      title: args.title,
      body: args.body,
      status: "open",
    });
    return { inboxItemId };
  },
});
