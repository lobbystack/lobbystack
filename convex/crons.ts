import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

const crons = cronJobs();

export const dispatchDueNotifications = internalAction({
  args: {},
  handler: async (ctx): Promise<{ count: number }> => {
    return await ctx.runAction(internal.notifications.reminders.dispatchDueNotifications, {});
  },
});

crons.interval(
  "dispatch due notifications",
  { minutes: 15 },
  internal.crons.dispatchDueNotifications,
  {},
);
crons.interval(
  "emit telemetry observability heartbeat",
  { minutes: 5 },
  internal.telemetry.posthog.emitObservabilityHeartbeat,
  {},
);

export default crons;
