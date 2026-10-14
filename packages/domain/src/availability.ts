import type {
  AppointmentRequest,
  AvailabilitySlot,
  ClosureWindow,
  HoursWindow,
} from "@lobbystack/shared";
import { DateTime } from "luxon";

type ExistingAppointment = {
  startsAt: string;
  endsAt: string;
  staffId: string;
};

type AvailabilityInput = {
  request: AppointmentRequest;
  serviceDurationMinutes: number;
  staffIds: Array<string>;
  hours: Array<HoursWindow>;
  closures: Array<ClosureWindow>;
  existingAppointments: Array<ExistingAppointment>;
};

function isoToDate(value: string): Date {
  return new Date(value);
}

function isoToDateTime(value: string) {
  return DateTime.fromISO(value, { setZone: true });
}

function weekdayToSnapshotDay(weekday: number): number {
  return weekday % 7;
}

/**
 * Local minutes from midnight for the start and end of a time. A time that
 * ends exactly at the next midnight ends at 1440, the same day, so it fits a
 * window that closes at midnight.
 */
function localSpan(startLocal: DateTime, endLocal: DateTime): { startMinutes: number; endMinutes: number; endsSameLocalDay: boolean } {
  const endsAtMidnight = endLocal.hour === 0 && endLocal.minute === 0 && endLocal.second === 0 && endLocal.hasSame(startLocal.plus({ days: 1 }), "day");
  return {
    startMinutes: startLocal.hour * 60 + startLocal.minute,
    endMinutes: endsAtMidnight ? 1440 : endLocal.hour * 60 + endLocal.minute,
    endsSameLocalDay: endsAtMidnight || endLocal.hasSame(startLocal, "day"),
  };
}

function overlaps(
  candidateStart: Date,
  candidateEnd: Date,
  existingStart: Date,
  existingEnd: Date,
): boolean {
  return candidateStart < existingEnd && existingStart < candidateEnd;
}

/**
 * Why a time can't be booked, so the receptionist can tell a caller the truth
 * instead of calling every refused time taken.
 *   no_hours: the business has no opening hours at all
 *   closed_day: the business is closed on that weekday
 *   outside_hours: the business is open that day, but not for the whole service
 *   closure: a planned closure covers the time
 *   no_staff: no active staff member offers the service
 *   calendar_not_synced: a connected calendar hasn't synced recently, so its busy time is unknown
 *   taken: the time is already booked, or busy on the calendar
 */
export type UnavailableReason = "no_hours" | "closed_day" | "outside_hours" | "closure" | "no_staff" | "calendar_not_synced" | "taken";

/** Why a search found no openings. "no_times_left" means every start time those days has passed. */
export type NoOpeningsReason = UnavailableReason | "no_times_left";

/**
 * A booking or reschedule refused because the time isn't bookable. The
 * message is the one these refusals always had; `reason` says why.
 */
export class BookingUnavailableError extends Error {
  readonly reason: UnavailableReason;

  constructor(reason: UnavailableReason, message = reason === "taken" ? "That appointment time is no longer available." : "No staff member is available for this service.") {
    super(message);
    this.name = "BookingUnavailableError";
    this.reason = reason;
  }
}

/**
 * The opening-hours or closure reason a time can't be booked, or undefined
 * when hours and closures allow it. computeAvailability checks the same rule.
 */
export function scheduleUnavailableReason(input: {
  startsAt: string;
  timezone: string;
  serviceDurationMinutes: number;
  hours: Array<HoursWindow>;
  closures: Array<ClosureWindow>;
}): "no_hours" | "closed_day" | "outside_hours" | "closure" | undefined {
  if (!input.hours.length) return "no_hours";
  const startUtc = isoToDateTime(input.startsAt);
  const endUtc = startUtc.plus({ minutes: input.serviceDurationMinutes });
  const startLocal = startUtc.setZone(input.timezone);
  const endLocal = endUtc.setZone(input.timezone);
  const windows = input.hours.filter((window) => window.dayOfWeek === weekdayToSnapshotDay(startLocal.weekday));
  if (!windows.length) return "closed_day";
  const { startMinutes, endMinutes, endsSameLocalDay } = localSpan(startLocal, endLocal);
  if (!windows.some((window) => startMinutes >= window.openMinutes && endsSameLocalDay && endMinutes <= window.closeMinutes)) return "outside_hours";
  if (input.closures.some((closure) => overlaps(startUtc.toJSDate(), endUtc.toJSDate(), isoToDate(closure.startsAt), isoToDate(closure.endsAt)))) return "closure";
  return undefined;
}

export function computeAvailability(input: AvailabilityInput): Array<AvailabilitySlot> {
  if (scheduleUnavailableReason({ startsAt: input.request.startsAt, timezone: input.request.timezone, serviceDurationMinutes: input.serviceDurationMinutes, hours: input.hours, closures: input.closures })) {
    return [];
  }
  return freeStaffSlots(input);
}

/** The slots of the staff not busy at the requested time, for a time the opening hours and closures already allow. */
export function freeStaffSlots(input: Omit<AvailabilityInput, "hours" | "closures">): Array<AvailabilitySlot> {
  const requestedStartUtc = isoToDateTime(input.request.startsAt);
  const requestedEndUtc = requestedStartUtc.plus({
    minutes: input.serviceDurationMinutes,
  });

  const staffIds =
    input.request.preferredStaffId === undefined
      ? input.staffIds
      : input.staffIds.filter((staffId) => staffId === input.request.preferredStaffId);

  return staffIds
    .filter((staffId) => {
      return !input.existingAppointments.some((appointment) =>
        appointment.staffId === staffId &&
        overlaps(
          requestedStartUtc.toJSDate(),
          requestedEndUtc.toJSDate(),
          isoToDate(appointment.startsAt),
          isoToDate(appointment.endsAt),
        ),
      );
    })
    .map((staffId) => ({
      staffId,
      serviceId: input.request.serviceId,
      startsAt: requestedStartUtc.toUTC().toISO() ?? input.request.startsAt,
      endsAt:
        requestedEndUtc.toUTC().toISO() ??
        requestedEndUtc.toJSDate().toISOString(),
    }));
}

const OPENING_STEP_MINUTES = 30;

// Start times to try on a local date, inside business hours, nearest to the
// caller's preferred time first.
export function candidateStartTimes(input: { date: string; timezone: string; hours: HoursWindow[]; durationMinutes: number; preferredMinutes?: number; now?: Date }): string[] {
  const day = DateTime.fromISO(`${input.date}T00:00:00`, { zone: input.timezone });
  if (!day.isValid) return [];
  const weekday = day.weekday % 7;
  const now = input.now ?? new Date();
  const minutes: number[] = [];
  for (const window of input.hours.filter((item) => item.dayOfWeek === weekday)) {
    for (let start = window.openMinutes; start + input.durationMinutes <= window.closeMinutes; start += OPENING_STEP_MINUTES) minutes.push(start);
  }
  const preferred = input.preferredMinutes;
  return minutes
    .sort((left, right) => preferred === undefined ? left - right : Math.abs(left - preferred) - Math.abs(right - preferred) || left - right)
    // Set the wall-clock time; adding minutes to midnight drifts an hour on DST days.
    .map((value) => day.set({ hour: Math.floor(value / 60), minute: value % 60 }))
    .filter((start) => start.toJSDate() > now)
    .map((start) => start.toUTC().toISO()!);
}
