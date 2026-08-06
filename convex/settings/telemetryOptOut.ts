import { v } from "convex/values";

import { query } from "../_generated/server";
import { requireMembership, requireTenantAdminAccess } from "../lib/auth";
import { observedMutation as mutation } from "../telemetry/observedFunctions";

export const getTelemetryEnabled = query({
  args: {
    businessId: v.id("businesses"),
  },
  returns: v.object({
    telemetryEnabled: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.businessId);
    const business = await ctx.db.get(args.businessId);
    return {
      telemetryEnabled: business?.telemetryEnabled ?? true,
    };
  },
});

export const setTelemetryEnabled = mutation({
  args: {
    businessId: v.id("businesses"),
    telemetryEnabled: v.boolean(),
  },
  returns: v.object({
    telemetryEnabled: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const membership = await requireMembership(ctx, args.businessId);
    requireTenantAdminAccess(membership.role);
    await ctx.db.patch(args.businessId, {
      telemetryEnabled: args.telemetryEnabled,
    });
    return {
      telemetryEnabled: args.telemetryEnabled,
    };
  },
});