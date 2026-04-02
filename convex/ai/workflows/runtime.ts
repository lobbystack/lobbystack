import { v } from "convex/values";
import { internalMutation } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { CALENDAR_RECONCILIATION_INTERVAL_MS } from "../../integrations/calendar";
import { workflowManager, runtimeCrons } from "../../lib/components";
import { enqueuePostHogOutboxRecord, serializePostHogEvent } from "../../telemetry/posthog";
import {
  getPostHogBusinessGroupKey,
  getPostHogDistinctIdForBusinessSystem,
} from "../../telemetry/shared";

export const refreshBusinessContextSnapshotWorkflow = workflowManager.define({
  args: {
    businessId: v.id("businesses"),
  },
  returns: v.null(),
  handler: async (step, args): Promise<null> => {
    await step.runMutation(internal.ai.context.snapshots.refreshSnapshot, {
      businessId: args.businessId,
    });
    return null;
  },
});

export const afterAppointmentBookedWorkflow = workflowManager.define({
  args: {
    appointmentId: v.id("appointments"),
  },
  returns: v.null(),
  handler: async (step, args): Promise<null> => {
    await step.runMutation(
      internal.notifications.reminders.createAppointmentNotifications,
      { appointmentId: args.appointmentId },
    );
    return null;
  },
});

export const appointmentCalendarSyncWorkflow = workflowManager.define({
  args: {
    appointmentId: v.id("appointments"),
  },
  returns: v.null(),
  handler: async (step, args): Promise<null> => {
    await step.runAction(
      internal.integrations.calendar.syncAppointmentToExternalCalendars,
      { appointmentId: args.appointmentId },
      { retry: true },
    );
    return null;
  },
});

export const kickoffSnapshotRefresh = internalMutation({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    await workflowManager.start(
      ctx,
      internal.ai.workflows.runtime.refreshBusinessContextSnapshotWorkflow,
      { businessId: args.businessId },
    );
    await enqueuePostHogOutboxRecord(
      ctx,
      serializePostHogEvent({
        eventName: "workflow.started",
        businessId: args.businessId,
        distinctId: getPostHogDistinctIdForBusinessSystem(String(args.businessId)),
        groupKey: getPostHogBusinessGroupKey(String(args.businessId)),
        properties: {
          workflowName: "refreshBusinessContextSnapshotWorkflow",
        },
      }),
    );
    return null;
  },
});

export const registerCalendarReconciliationCron = internalMutation({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args): Promise<string> => {
    const name = `calendar-reconcile-${String(args.businessId)}`;
    const existing = await runtimeCrons.get(ctx, { name });
    if (existing !== null) {
      return name;
    }

    await runtimeCrons.register(
      ctx,
      { kind: "interval", ms: CALENDAR_RECONCILIATION_INTERVAL_MS },
      internal.integrations.calendar.runBusinessCalendarReconciliation,
      { businessId: args.businessId },
      name,
    );
    return name;
  },
});
