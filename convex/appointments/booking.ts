import { v } from "convex/values";
import { DateTime } from "luxon";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { ensureCurrentUser, requireMembership } from "../lib/auth";
import { workflowManager } from "../lib/components";
import { computeAvailability } from "../lib/availability";

const SLOT_INTERVAL_MINUTES = 15;
const DEFAULT_SLOT_LIMIT = 6;

type BookingContext = {
  serviceDurationMinutes: number;
  staffIds: Array<string>;
  hours: Array<{ dayOfWeek: number; openMinutes: number; closeMinutes: number }>;
  closures: Array<{ startsAt: string; endsAt: string; reason: string }>;
  existingAppointments: Array<{ startsAt: string; endsAt: string; staffId: string }>;
};

function formatSlotLabel(startsAt: string, timezone: string): string {
  return (
    DateTime.fromISO(startsAt, { setZone: true })
      .setZone(timezone)
      .toFormat("cccc 'at' h:mm a") || startsAt
  );
}

function rankCandidateMinutes(
  candidateMinutes: number,
  preferredHour24?: number,
  preferredMinute?: number,
): number {
  if (preferredHour24 === undefined) {
    return 0;
  }

  const preferredMinutes = preferredHour24 * 60 + (preferredMinute ?? 0);
  return Math.abs(candidateMinutes - preferredMinutes);
}

function buildCandidateSlotOrder(input: {
  dayStart: DateTime;
  dayWindows: Array<{ dayOfWeek: number; openMinutes: number; closeMinutes: number }>;
  serviceDurationMinutes: number;
  preferredHour24?: number;
  preferredMinute?: number;
}): Array<{
  candidateMinutes: number;
  startsAt: string;
  score: number;
}> {
  const byStartTime = new Map<
    string,
    {
      candidateMinutes: number;
      startsAt: string;
      score: number;
    }
  >();

  for (const window of input.dayWindows) {
    for (
      let candidateMinutes = window.openMinutes;
      candidateMinutes + input.serviceDurationMinutes <= window.closeMinutes;
      candidateMinutes += SLOT_INTERVAL_MINUTES
    ) {
      const candidate = input.dayStart.plus({ minutes: candidateMinutes });
      const startsAt = candidate.toUTC().toISO() ?? candidate.toISO() ?? "";
      if (!startsAt || byStartTime.has(startsAt)) {
        continue;
      }

      byStartTime.set(startsAt, {
        candidateMinutes,
        startsAt,
        score: rankCandidateMinutes(
          candidateMinutes,
          input.preferredHour24,
          input.preferredMinute,
        ),
      });
    }
  }

  return [...byStartTime.values()].sort(
    (left, right) =>
      left.score - right.score ||
      left.startsAt.localeCompare(right.startsAt),
  );
}

async function loadBookingContext(
  ctx: Pick<MutationCtx, "db"> | Pick<QueryCtx, "db">,
  args: {
    businessId: Id<"businesses">;
    serviceId: Id<"services">;
  },
): Promise<BookingContext> {
  const service = await ctx.db.get(args.serviceId);
  if (!service || service.businessId !== args.businessId || !service.active) {
    throw new Error("Service not found.");
  }

  const [assignments, activeStaff, appointments, calendarBusyBlocks, hours, closures] =
    await Promise.all([
      ctx.db
        .query("staff_service_assignments")
        .withIndex("by_service_id_and_staff_id", (q) => q.eq("serviceId", args.serviceId))
        .collect(),
      ctx.db
        .query("staff")
        .withIndex("by_business_id_and_active", (q) =>
          q.eq("businessId", args.businessId).eq("active", true),
        )
        .collect(),
      ctx.db
        .query("appointments")
        .withIndex("by_business_id_and_starts_at", (q) => q.eq("businessId", args.businessId))
        .collect(),
      ctx.db
        .query("calendar_busy_blocks")
        .withIndex("by_business_id_and_starts_at", (q) => q.eq("businessId", args.businessId))
        .collect(),
      ctx.db
        .query("business_hours")
        .withIndex("by_business_id_and_day_of_week", (q) => q.eq("businessId", args.businessId))
        .collect(),
      ctx.db
        .query("closures")
        .withIndex("by_business_id_and_starts_at", (q) => q.eq("businessId", args.businessId))
        .collect(),
    ]);
  const activeStaffIds = new Set(activeStaff.map((row) => String(row._id)));
  const eligibleAssignments = assignments.filter(
    (row) =>
      row.businessId === args.businessId &&
      activeStaffIds.has(String(row.staffId)),
  );

  return {
    serviceDurationMinutes: service.durationMinutes,
    staffIds: eligibleAssignments.map((row) => String(row.staffId)),
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
  };
}

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
  const calendarState: {
    hasConnectedCalendar: boolean;
    selectedConnectionId?: Id<"calendar_connections">;
    selectedCalendarId?: string;
  } = await ctx.runQuery(
    internal.integrations.calendar.getStaffCalendarConnectionState,
    {
      businessId: args.businessId,
      staffId: selected.staffId as Id<"staff">,
    },
  );
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
    calendarSyncState: calendarState.hasConnectedCalendar ? "pending" : "not_required",
  });

  await workflowManager.start(
    ctx,
    internal.ai.workflows.runtime.afterAppointmentBookedWorkflow,
    { appointmentId },
  );

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
    const context = await loadBookingContext(ctx, args);

    return computeAvailability({
      request: {
        serviceId: String(args.serviceId),
        startsAt: args.startsAt,
        timezone: args.timezone,
        ...(args.preferredStaffId !== undefined
          ? { preferredStaffId: String(args.preferredStaffId) }
          : {}),
      },
      serviceDurationMinutes: context.serviceDurationMinutes,
      staffIds: context.staffIds,
      hours: context.hours,
      closures: context.closures,
      existingAppointments: context.existingAppointments,
    });
  },
});

export const findAvailabilityForBusiness = internalQuery({
  args: {
    businessId: v.id("businesses"),
    serviceId: v.id("services"),
    date: v.string(),
    timezone: v.string(),
    preferredStaffId: v.optional(v.id("staff")),
    preferredHour24: v.optional(v.number()),
    preferredMinute: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const context = await loadBookingContext(ctx, args);
    const dayStart = DateTime.fromISO(args.date, { zone: args.timezone }).startOf("day");
    if (!dayStart.isValid) {
      throw new Error("Invalid availability date.");
    }

    const dayOfWeek = dayStart.weekday % 7;
    const dayWindows = context.hours
      .filter((window) => window.dayOfWeek === dayOfWeek)
      .sort((left, right) => left.openMinutes - right.openMinutes);

    if (dayWindows.length === 0) {
      return [];
    }

    const slotLimit = Math.max(1, Math.min(args.limit ?? DEFAULT_SLOT_LIMIT, 12));
    const orderedCandidates = buildCandidateSlotOrder({
      dayStart,
      dayWindows,
      serviceDurationMinutes: context.serviceDurationMinutes,
      ...(args.preferredHour24 !== undefined ? { preferredHour24: args.preferredHour24 } : {}),
      ...(args.preferredMinute !== undefined ? { preferredMinute: args.preferredMinute } : {}),
    });
    const ranked: Array<{
      startsAt: string;
      endsAt: string;
      displayTime: string;
      score: number;
    }> = [];

    for (const candidate of orderedCandidates) {
      if (ranked.length >= slotLimit) {
        break;
      }

      const result = computeAvailability({
        request: {
          serviceId: String(args.serviceId),
          startsAt: candidate.startsAt,
          timezone: args.timezone,
          ...(args.preferredStaffId !== undefined
            ? { preferredStaffId: String(args.preferredStaffId) }
            : {}),
        },
        serviceDurationMinutes: context.serviceDurationMinutes,
        staffIds: context.staffIds,
        hours: context.hours,
        closures: context.closures,
        existingAppointments: context.existingAppointments,
      });

      if (result.length === 0) {
        continue;
      }

      const slot = result[0];
      if (!slot) {
        continue;
      }
      ranked.push({
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        displayTime: formatSlotLabel(slot.startsAt, args.timezone),
        score: candidate.score,
      });
    }

    return ranked
      .sort(
        (left, right) =>
          left.score - right.score ||
          left.startsAt.localeCompare(right.startsAt),
      )
      .slice(0, slotLimit)
      .map(({ score: _score, ...slot }) => slot);
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
    return await bookAppointmentWithSource(ctx, {
      ...args,
      sourceChannel: "dashboard",
    });
  },
});
