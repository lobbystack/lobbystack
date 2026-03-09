// @ts-nocheck
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

export const getNotification = internalQuery({
  args: {
    notificationId: v.id("notifications"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.notificationId);
  },
});

export const markNotificationSent = internalMutation({
  args: {
    notificationId: v.id("notifications"),
    providerMessageId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.notificationId, {
      status: "sent",
      providerMessageId: args.providerMessageId,
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

    await retrier.run(
      ctx,
      internal.notifications.reminders.deliverNotification,
      { notificationId: immediateNotificationId },
    );

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
    const notification = await ctx.runQuery(
      internal.notifications.reminders.getNotification,
      { notificationId: args.notificationId },
    );
    if (!notification) {
      throw new Error("Notification not found.");
    }

    await ctx.runMutation(internal.notifications.reminders.markNotificationSent, {
      notificationId: args.notificationId,
      providerMessageId: `mock:${String(args.notificationId)}`,
    });

    return { delivered: true };
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
