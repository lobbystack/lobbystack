// @ts-nocheck
import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query, type MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { ensureCurrentUser, requireMembership } from "../lib/auth";
import { workflowManager } from "../lib/components";
import { computeAvailability } from "../lib/availability";

async function bookAppointmentWithSource(
  ctx: MutationCtx,
  args: {
    businessId: Id<"businesses">;
    serviceId: Id<"services">;
    startsAt: string;
    timezone: string;
    preferredStaffId?: Id<"staff">;
    contactName?: string;
    contactPhone: string;
    sourceChannel: string;
  },
): Promise<{ appointmentId: Id<"appointments">; contactId: Id<"contacts"> }> {
  const availability = await ctx.runQuery(
    internal.appointments.booking.checkAvailabilityForBusiness,
    {
      businessId: args.businessId,
      serviceId: args.serviceId,
      startsAt: args.startsAt,
      timezone: args.timezone,
      preferredStaffId: args.preferredStaffId,
    },
  );

  if (availability.length === 0) {
    throw new Error("No availability for the requested time.");
  }

  let contact = await ctx.db
    .query("contacts")
    .withIndex("by_business_id_and_phone", (q) =>
      q.eq("businessId", args.businessId).eq("phone", args.contactPhone),
    )
    .unique();

  if (!contact) {
    const contactId = await ctx.db.insert("contacts", {
      businessId: args.businessId,
      phone: args.contactPhone,
      ...(args.contactName !== undefined ? { name: args.contactName } : {}),
    });
    contact = await ctx.db.get(contactId);
  }

  if (!contact) {
    throw new Error("Failed to create contact.");
  }

  const selected = availability[0];
  const appointmentId = await ctx.db.insert("appointments", {
    businessId: args.businessId,
    contactId: contact._id,
    staffId: selected.staffId as Id<"staff">,
    serviceId: args.serviceId,
    startsAt: selected.startsAt,
    endsAt: selected.endsAt,
    timezone: args.timezone,
    status: "confirmed",
    sourceChannel: args.sourceChannel,
    calendarSyncState: "pending",
  });

  return { appointmentId, contactId: contact._id };
}

export const checkAvailabilityForBusiness = internalQuery({
  args: {
    businessId: v.id("businesses"),
    serviceId: v.id("services"),
    startsAt: v.string(),
    timezone: v.string(),
    preferredStaffId: v.optional(v.id("staff")),
  },
  handler: async (ctx, args) => {
    const service = await ctx.db.get(args.serviceId);
    if (!service || service.businessId !== args.businessId || !service.active) {
      throw new Error("Service not found.");
    }

    const assignments = await ctx.db
      .query("staff_service_assignments")
      .withIndex("by_service_id_and_staff_id", (q) => q.eq("serviceId", args.serviceId))
      .collect();
    const appointments = await ctx.db
      .query("appointments")
      .withIndex("by_business_id_and_starts_at", (q) => q.eq("businessId", args.businessId))
      .collect();
    const calendarBusyBlocks = await ctx.db
      .query("calendar_busy_blocks")
      .withIndex("by_business_id_and_starts_at", (q) => q.eq("businessId", args.businessId))
      .collect();
    const hours = await ctx.db
      .query("business_hours")
      .withIndex("by_business_id_and_day_of_week", (q) => q.eq("businessId", args.businessId))
      .collect();
    const closures = await ctx.db
      .query("closures")
      .withIndex("by_business_id_and_starts_at", (q) => q.eq("businessId", args.businessId))
      .collect();

    return computeAvailability({
      request: {
        serviceId: String(args.serviceId),
        startsAt: args.startsAt,
        timezone: args.timezone,
        ...(args.preferredStaffId !== undefined
          ? { preferredStaffId: String(args.preferredStaffId) }
          : {}),
      },
      serviceDurationMinutes: service.durationMinutes,
      staffIds: assignments.map((row) => String(row.staffId)),
      hours: hours.map((row) => ({
        dayOfWeek: row.dayOfWeek,
        openMinutes: row.openMinutes,
        closeMinutes: row.closeMinutes,
      })),
      closures: closures.map((row) => ({
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        reason: row.reason,
      })),
      existingAppointments: [
        ...appointments.map((row) => ({
          startsAt: row.startsAt,
          endsAt: row.endsAt,
          staffId: String(row.staffId),
        })),
        ...calendarBusyBlocks
          .filter((row) => row.staffId)
          .map((row) => ({
            startsAt: row.startsAt,
            endsAt: row.endsAt,
            staffId: String(row.staffId),
          })),
      ],
    });
  },
});

export const checkAvailability = query({
  args: {
    businessId: v.id("businesses"),
    serviceId: v.id("services"),
    startsAt: v.string(),
    timezone: v.string(),
    preferredStaffId: v.optional(v.id("staff")),
  },
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.businessId);
    const result: Array<{
      staffId: string;
      serviceId: string;
      startsAt: string;
      endsAt: string;
    }> = await ctx.runQuery(internal.appointments.booking.checkAvailabilityForBusiness, args);
    return result;
  },
});

export const bookAppointmentForBusiness = internalMutation({
  args: {
    businessId: v.id("businesses"),
    serviceId: v.id("services"),
    startsAt: v.string(),
    timezone: v.string(),
    preferredStaffId: v.optional(v.id("staff")),
    contactName: v.optional(v.string()),
    contactPhone: v.string(),
    sourceChannel: v.string(),
  },
  handler: async (ctx, args) => {
    return await bookAppointmentWithSource(ctx, args);
  },
});

export const bookAppointment = mutation({
  args: {
    businessId: v.id("businesses"),
    serviceId: v.id("services"),
    startsAt: v.string(),
    timezone: v.string(),
    preferredStaffId: v.optional(v.id("staff")),
    contactName: v.optional(v.string()),
    contactPhone: v.string(),
  },
  handler: async (ctx, args) => {
    await ensureCurrentUser(ctx);
    await requireMembership(ctx, args.businessId);
    const result = await bookAppointmentWithSource(ctx, {
      ...args,
      sourceChannel: "dashboard",
    });

    await workflowManager.start(
      ctx,
      internal.ai.workflows.runtime.afterAppointmentBookedWorkflow,
      { appointmentId: result.appointmentId },
    );

    return result;
  },
});
