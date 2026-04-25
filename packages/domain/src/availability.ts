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
