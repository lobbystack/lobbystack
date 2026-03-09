// @ts-nocheck
import { v } from "convex/values";
import {
  action,
  internalAction,
  internalMutation,
  mutation,
  query,
} from "../_generated/server";
import { internal } from "../_generated/api";
import { requireMembership } from "../lib/auth";
import { workflowManager } from "../lib/components";

export const listCalendarConnections = query({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.businessId);
    return await ctx.db
      .query("calendar_connections")
      .withIndex("by_business_id_and_provider", (q) =>
        q.eq("businessId", args.businessId),
      )
      .collect();
  },
});

export const upsertCalendarConnection = mutation({
  args: {
    businessId: v.id("businesses"),
    provider: v.string(),
    externalAccountId: v.string(),
    selectedCalendarId: v.optional(v.string()),
    encryptedAccessToken: v.optional(v.string()),
    encryptedRefreshToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const membership = await requireMembership(ctx, args.businessId);
    const existing = await ctx.db
      .query("calendar_connections")
      .withIndex("by_provider_and_external_account_id", (q) =>
        q.eq("provider", args.provider).eq("externalAccountId", args.externalAccountId),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...(args.selectedCalendarId !== undefined
          ? { selectedCalendarId: args.selectedCalendarId }
          : {}),
        ...(args.encryptedAccessToken !== undefined
          ? { encryptedAccessToken: args.encryptedAccessToken }
          : {}),
        ...(args.encryptedRefreshToken !== undefined
          ? { encryptedRefreshToken: args.encryptedRefreshToken }
          : {}),
        status: "connected",
      });
      return { connectionId: existing._id };
    }

    const connectionId = await ctx.db.insert("calendar_connections", {
      businessId: args.businessId,
      provider: args.provider,
      ownerUserId: membership.userId,
      externalAccountId: args.externalAccountId,
      ...(args.selectedCalendarId !== undefined
        ? { selectedCalendarId: args.selectedCalendarId }
        : {}),
      ...(args.encryptedAccessToken !== undefined
        ? { encryptedAccessToken: args.encryptedAccessToken }
        : {}),
      ...(args.encryptedRefreshToken !== undefined
        ? { encryptedRefreshToken: args.encryptedRefreshToken }
        : {}),
      status: "connected",
    });

    await workflowManager.start(
      ctx,
      internal.ai.workflows.runtime.refreshBusinessContextSnapshotWorkflow,
      { businessId: args.businessId },
    );
    return { connectionId };
  },
});

export const markAppointmentSyncState = internalMutation({
  args: {
    appointmentId: v.id("appointments"),
    calendarSyncState: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.appointmentId, {
      calendarSyncState: args.calendarSyncState,
    });
    return null;
  },
});

export const syncAppointmentToExternalCalendars = internalAction({
  args: {
    appointmentId: v.id("appointments"),
  },
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.integrations.calendar.markAppointmentSyncState, {
      appointmentId: args.appointmentId,
      calendarSyncState: "synced_mock",
    });
    return { ok: true };
  },
});

export const runBusinessCalendarReconciliation = internalAction({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (_ctx, args) => {
    return { businessId: args.businessId, status: "queued_mock" };
  },
});

export const connectGoogle = action({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (_ctx, args) => {
    return {
      businessId: args.businessId,
      authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    };
  },
});

export const connectMicrosoft = action({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (_ctx, args) => {
    return {
      businessId: args.businessId,
      authorizationUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    };
  },
});
