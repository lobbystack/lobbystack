import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

import { observedInternalAction as internalAction } from "./telemetry/observedFunctions";
const crons = cronJobs();

export const dispatchDueNotifications = internalAction({
  args: {},
  handler: async (ctx): Promise<{ count: number }> => {
    return await ctx.runAction(internal.notifications.reminders.dispatchDueNotifications, {});
  },
});

export const dispatchDueDailyDigests = internalAction({
  args: {},
  handler: async (ctx): Promise<{ attempted: number; sent: number }> => {
    return await ctx.runAction(internal.operatorNotifications.dispatchDueDailyDigests, {});
  },
});

crons.interval(
  "dispatch due notifications",
  { minutes: 15 },
  internal.crons.dispatchDueNotifications,
  {},
);
crons.interval(
  "dispatch due operator daily digests",
  { minutes: 15 },
  internal.crons.dispatchDueDailyDigests,
  {},
);
crons.interval(
  "emit telemetry observability heartbeat",
  { minutes: 5 },
  internal.telemetry.posthog.emitObservabilityHeartbeat,
  {},
);
crons.interval(
  "emit service health checks",
  { minutes: 1 },
  internal.telemetry.posthog.emitServiceHealthChecks,
  {},
);

export default crons;
