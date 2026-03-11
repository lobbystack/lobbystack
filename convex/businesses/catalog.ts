import { v } from "convex/values";
import { internalQuery, mutation, query } from "../_generated/server";
import { requireMembership } from "../lib/auth";
import { scheduleSnapshotRefresh } from "./admin";

export const resolveBusinessByPhoneNumber = internalQuery({
  args: {
    e164: v.string(),
    channel: v.union(v.literal("voice"), v.literal("sms")),
  },
  handler: async (ctx, args) => {
    const matches = await ctx.db
      .query("phone_numbers")
      .withIndex("by_e164", (q) => q.eq("e164", args.e164))
      .collect();
    const eligibleMatches = matches.filter((phoneNumber) => {
      if (phoneNumber.status !== "active") {
        return false;
      }

      return args.channel === "voice"
        ? phoneNumber.voiceEnabled
        : phoneNumber.smsEnabled;
    });

    if (eligibleMatches.length > 1) {
      throw new Error(
        `Multiple active ${args.channel} routes are configured for ${args.e164}.`,
      );
    }

    return eligibleMatches[0] ?? null;
  },
});

export const getBusinessConfiguration = query({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.businessId);
    const [business, profile, services, staff, assignments, hours, closures, phoneNumbers] =
      await Promise.all([
        ctx.db.get(args.businessId),
        ctx.db
          .query("receptionist_profiles")
          .withIndex("by_business_id", (q) => q.eq("businessId", args.businessId))
          .unique(),
        ctx.db
          .query("services")
          .withIndex("by_business_id", (q) => q.eq("businessId", args.businessId))
          .collect(),
        ctx.db
          .query("staff")
          .withIndex("by_business_id", (q) => q.eq("businessId", args.businessId))
          .collect(),
        ctx.db
          .query("staff_service_assignments")
          .withIndex("by_business_id", (q) => q.eq("businessId", args.businessId))
          .collect(),
        ctx.db
          .query("business_hours")
          .withIndex("by_business_id_and_day_of_week", (q) =>
            q.eq("businessId", args.businessId),
          )
          .collect(),
        ctx.db
          .query("closures")
          .withIndex("by_business_id_and_starts_at", (q) =>
            q.eq("businessId", args.businessId),
          )
          .collect(),
        ctx.db
          .query("phone_numbers")
          .withIndex("by_business_id", (q) => q.eq("businessId", args.businessId))
          .collect(),
      ]);

    return {
      business,
      profile,
      services,
      staff,
      assignments,
      hours,
      closures,
      phoneNumbers,
    };
  },
});

export const upsertService = mutation({
  args: {
    businessId: v.id("businesses"),
    serviceId: v.optional(v.id("services")),
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    durationMinutes: v.number(),
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.businessId);

    if (args.serviceId) {
      await ctx.db.patch(args.serviceId, {
        name: args.name,
        slug: args.slug,
        ...(args.description !== undefined ? { description: args.description } : {}),
        durationMinutes: args.durationMinutes,
        active: args.active,
      });
      await scheduleSnapshotRefresh(ctx, args.businessId);
      return { serviceId: args.serviceId };
    }

    const serviceId = await ctx.db.insert("services", {
      businessId: args.businessId,
      name: args.name,
      slug: args.slug,
      ...(args.description !== undefined ? { description: args.description } : {}),
      durationMinutes: args.durationMinutes,
      active: args.active,
    });
    await scheduleSnapshotRefresh(ctx, args.businessId);
    return { serviceId };
  },
});

export const upsertStaff = mutation({
  args: {
    businessId: v.id("businesses"),
    staffId: v.optional(v.id("staff")),
    name: v.string(),
    timezone: v.string(),
    active: v.boolean(),
    transferNumber: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.businessId);

    if (args.staffId) {
      await ctx.db.patch(args.staffId, {
        name: args.name,
        timezone: args.timezone,
        active: args.active,
        ...(args.transferNumber !== undefined
          ? { transferNumber: args.transferNumber }
          : {}),
      });
      await scheduleSnapshotRefresh(ctx, args.businessId);
      return { staffId: args.staffId };
    }

    const staffId = await ctx.db.insert("staff", {
      businessId: args.businessId,
      name: args.name,
      timezone: args.timezone,
      active: args.active,
      ...(args.transferNumber !== undefined
        ? { transferNumber: args.transferNumber }
        : {}),
    });
    await scheduleSnapshotRefresh(ctx, args.businessId);
    return { staffId };
  },
});

export const replaceBusinessHours = mutation({
  args: {
    businessId: v.id("businesses"),
    hours: v.array(
      v.object({
        dayOfWeek: v.number(),
        openMinutes: v.number(),
        closeMinutes: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.businessId);
    const existing = await ctx.db
      .query("business_hours")
      .withIndex("by_business_id_and_day_of_week", (q) =>
        q.eq("businessId", args.businessId),
      )
      .collect();

    for (const row of existing) {
      await ctx.db.delete(row._id);
    }

    for (const row of args.hours) {
      await ctx.db.insert("business_hours", {
        businessId: args.businessId,
        dayOfWeek: row.dayOfWeek,
        openMinutes: row.openMinutes,
        closeMinutes: row.closeMinutes,
      });
    }

    await scheduleSnapshotRefresh(ctx, args.businessId);
    return null;
  },
});

export const replaceClosures = mutation({
  args: {
    businessId: v.id("businesses"),
    closures: v.array(
      v.object({
        startsAt: v.string(),
        endsAt: v.string(),
        reason: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.businessId);
    const existing = await ctx.db
      .query("closures")
      .withIndex("by_business_id_and_starts_at", (q) => q.eq("businessId", args.businessId))
      .collect();

    for (const row of existing) {
      await ctx.db.delete(row._id);
    }

    for (const closure of args.closures) {
      await ctx.db.insert("closures", {
        businessId: args.businessId,
        startsAt: closure.startsAt,
        endsAt: closure.endsAt,
        reason: closure.reason,
      });
    }

    await scheduleSnapshotRefresh(ctx, args.businessId);
    return null;
  },
});

export const replaceStaffServiceAssignments = mutation({
  args: {
    businessId: v.id("businesses"),
    assignments: v.array(
      v.object({
        staffId: v.id("staff"),
        serviceId: v.id("services"),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.businessId);
    const existing = await ctx.db
      .query("staff_service_assignments")
      .withIndex("by_business_id", (q) => q.eq("businessId", args.businessId))
      .collect();

    for (const row of existing) {
      await ctx.db.delete(row._id);
    }

    for (const assignment of args.assignments) {
      await ctx.db.insert("staff_service_assignments", {
        businessId: args.businessId,
        staffId: assignment.staffId,
        serviceId: assignment.serviceId,
      });
    }

    await scheduleSnapshotRefresh(ctx, args.businessId);
    return null;
  },
});

export const upsertPhoneNumber = mutation({
  args: {
    businessId: v.id("businesses"),
    phoneNumberId: v.optional(v.id("phone_numbers")),
    e164: v.string(),
    twilioPhoneSid: v.optional(v.string()),
    voiceEnabled: v.boolean(),
    smsEnabled: v.boolean(),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.businessId);
    const conflictingPhoneNumber = await ctx.db
      .query("phone_numbers")
      .withIndex("by_e164", (q) => q.eq("e164", args.e164))
      .collect();
    const duplicate = conflictingPhoneNumber.find(
      (phoneNumber) => phoneNumber._id !== args.phoneNumberId,
    );

    if (duplicate) {
      throw new Error(`The phone number ${args.e164} is already mapped to a business.`);
    }

    if (args.phoneNumberId) {
      const existingPhoneNumber = await ctx.db.get(args.phoneNumberId);
      if (!existingPhoneNumber || existingPhoneNumber.businessId !== args.businessId) {
        throw new Error("Phone number not found for this business.");
      }

      await ctx.db.patch(args.phoneNumberId, {
        e164: args.e164,
        ...(args.twilioPhoneSid !== undefined
          ? { twilioPhoneSid: args.twilioPhoneSid }
          : {}),
        voiceEnabled: args.voiceEnabled,
        smsEnabled: args.smsEnabled,
        status: args.status,
      });
      await scheduleSnapshotRefresh(ctx, args.businessId);
      return { phoneNumberId: args.phoneNumberId };
    }

    const phoneNumberId = await ctx.db.insert("phone_numbers", {
      businessId: args.businessId,
      e164: args.e164,
      ...(args.twilioPhoneSid !== undefined
        ? { twilioPhoneSid: args.twilioPhoneSid }
        : {}),
      voiceEnabled: args.voiceEnabled,
      smsEnabled: args.smsEnabled,
      status: args.status,
    });
    await scheduleSnapshotRefresh(ctx, args.businessId);
    return { phoneNumberId };
  },
});
