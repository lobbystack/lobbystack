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
crons.interval(
  "emit service health checks",
  { minutes: 1 },
  internal.telemetry.posthog.emitServiceHealthChecks,
  {},
);
crons.interval(
  "cleanup expired sensitive content",
  { hours: 24 },
  internal.privacy.retention.runMvpRetentionCleanup,
  {},
);
crons.interval(
  "release due free-plan phone numbers",
  { hours: 24 },
  internal.settings.phoneNumberReclaimActions.runDuePhoneNumberReclaims,
  {},
);
crons.cron(
  "generate monthly affiliate payout run",
  "0 13 1 * *",
  internal.affiliates.generateMonthlyPayoutRun,
  {},
);

export default crons;
