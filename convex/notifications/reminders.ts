// @ts-nocheck
import { DateTime } from "luxon";
import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
} from "../_generated/server";
import { internal } from "../_generated/api";
import { retrier } from "../lib/components";
import { requireMembership } from "../lib/auth";

function buildTwilioSmsStatusCallbackUrl(): string {
  const siteUrl = process.env.CONVEX_SITE_URL;
  if (!siteUrl) {
    throw new Error("CONVEX_SITE_URL is required to receive Twilio SMS callbacks.");
  }

  return new URL("/twilio/sms/status", siteUrl).toString();
}

function formatAppointmentTime(startsAt: string, timezone: string): string {
  return (
    DateTime.fromISO(startsAt, { setZone: true })
      .setZone(timezone)
      .toFormat("cccc, LLL d 'at' h:mm a z") || startsAt
  );
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
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.notificationId);
    if (!notification) {
      return null;
    }

    if (notification.channel !== "sms") {
      throw new Error("Only SMS notifications are supported.");
    }

    if (!notification.relatedId) {
      throw new Error("Notification is missing a related appointment.");
    }

    const appointment = await ctx.db.get(notification.relatedId as any);
    if (!appointment) {
      throw new Error("Appointment not found for notification.");
    }

    const [service, contact, phoneNumbers] = await Promise.all([
      ctx.db.get(appointment.serviceId),
      ctx.db.get(appointment.contactId),
      ctx.db
        .query("phone_numbers")
        .withIndex("by_business_id", (q) => q.eq("businessId", notification.businessId))
        .collect(),
    ]);

    if (!service) {
      throw new Error("Service not found for notification.");
    }

    if (!contact) {
      throw new Error("Contact not found for notification.");
    }

    const eligiblePhoneNumbers = phoneNumbers.filter(
      (phoneNumber) => phoneNumber.status === "active" && phoneNumber.smsEnabled,
    );

    if (eligiblePhoneNumbers.length !== 1) {
      throw new Error(
        "Exactly one active SMS-enabled phone number must be mapped to the business.",
      );
    }

    const formattedTime = formatAppointmentTime(appointment.startsAt, appointment.timezone);
    const body =
      notification.kind === "appointment_reminder"
        ? `Reminder: your ${service.name} appointment is ${formattedTime}. Reply if you need to reschedule.`
        : `Your ${service.name} appointment is booked for ${formattedTime}. Reply if you need to reschedule.`;

    return {
      notificationId: notification._id,
      to: contact.phone,
      from: eligiblePhoneNumbers[0].e164,
      body,
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
    await ctx.db.patch(args.notificationId, {
      status: "failed",
      ...(args.providerStatus !== undefined ? { providerStatus: args.providerStatus } : {}),
      providerUpdatedAt: args.providerUpdatedAt,
    });
    return null;
  },
});

export const markNotificationPending = internalMutation({
  args: {
    notificationId: v.id("notifications"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.notificationId, { status: "pending" });
    return null;
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

    const immediateNotificationId = await ctx.db.insert("notifications", {
      businessId: appointment.businessId,
      channel: "sms",
      kind: "booking_confirmation",
      relatedId: String(args.appointmentId),
      scheduledFor: new Date().toISOString(),
      status: "pending",
    });

    await retrier.run(ctx, internal.notifications.reminders.deliverNotification, {
      notificationId: immediateNotificationId,
    });

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

export const deliverScheduledNotification = internalAction({
  args: {
    notificationId: v.id("notifications"),
  },
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.notifications.reminders.markNotificationPending, {
      notificationId: args.notificationId,
    });
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
  handler: async (ctx, args) => {
    const deliveryContext = await ctx.runQuery(
      internal.notifications.reminders.getNotificationDeliveryContext,
      { notificationId: args.notificationId },
    );
    if (!deliveryContext) {
      throw new Error("Notification not found.");
    }

    try {
      const result = await ctx.runAction(internal.integrations.twilioSms.sendMessage, {
        to: deliveryContext.to,
        from: deliveryContext.from,
        body: deliveryContext.body,
        statusCallbackUrl: buildTwilioSmsStatusCallbackUrl(),
      });

      await ctx.runMutation(internal.notifications.reminders.markNotificationSent, {
        notificationId: args.notificationId,
        providerMessageId: result.providerMessageSid,
        providerStatus: result.providerStatus,
        providerUpdatedAt: new Date().toISOString(),
      });

      return {
        delivered: true,
        providerMessageId: result.providerMessageSid,
      };
    } catch (error) {
      await ctx.runMutation(internal.notifications.reminders.markNotificationSendFailed, {
        notificationId: args.notificationId,
        providerUpdatedAt: new Date().toISOString(),
        providerStatus: "failed",
      });
      throw error;
    }
  },
});

export const dispatchDueNotifications = internalAction({
  args: {},
  handler: async (ctx) => {
    const due = await ctx.runQuery(
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
