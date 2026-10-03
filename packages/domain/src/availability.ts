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
 * when hours and closures allow it. Uses the same rules as computeAvailability.
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
  const startMinutes = startLocal.hour * 60 + startLocal.minute;
  const endMinutes = endLocal.hour * 60 + endLocal.minute;
  const endsSameLocalDay = endLocal.hasSame(startLocal, "day");
  if (!windows.some((window) => startMinutes >= window.openMinutes && endsSameLocalDay && endMinutes <= window.closeMinutes)) return "outside_hours";
  if (input.closures.some((closure) => overlaps(startUtc.toJSDate(), endUtc.toJSDate(), isoToDate(closure.startsAt), isoToDate(closure.endsAt)))) return "closure";
  return undefined;
}

export function computeAvailability(input: AvailabilityInput): Array<AvailabilitySlot> {
  const requestedStartUtc = isoToDateTime(input.request.startsAt);
  const requestedEndUtc = requestedStartUtc.plus({
    minutes: input.serviceDurationMinutes,
  });
  const requestedStartLocal = requestedStartUtc.setZone(input.request.timezone);
  const requestedEndLocal = requestedEndUtc.setZone(input.request.timezone);
  const weekday = weekdayToSnapshotDay(requestedStartLocal.weekday);
  const startMinutes = requestedStartLocal.hour * 60 + requestedStartLocal.minute;
  const endMinutes = requestedEndLocal.hour * 60 + requestedEndLocal.minute;
  const endsSameLocalDay = requestedEndLocal.hasSame(requestedStartLocal, "day");

  const openWindow = input.hours.find(
    (window) =>
      window.dayOfWeek === weekday &&
      startMinutes >= window.openMinutes &&
      endsSameLocalDay &&
      endMinutes <= window.closeMinutes,
  );

  if (!openWindow) {
    return [];
  }

  const blockedByClosure = input.closures.some((closure) =>
    overlaps(
      requestedStartUtc.toJSDate(),
      requestedEndUtc.toJSDate(),
      isoToDate(closure.startsAt),
      isoToDate(closure.endsAt),
    ),
  );

  if (blockedByClosure) {
    return [];
  }

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
