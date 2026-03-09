import type {
  AppointmentRequest,
  AvailabilitySlot,
  ClosureWindow,
  HoursWindow,
} from "@ai-receptionist/shared";

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

function overlaps(
  candidateStart: Date,
  candidateEnd: Date,
  existingStart: Date,
  existingEnd: Date,
): boolean {
  return candidateStart < existingEnd && existingStart < candidateEnd;
}

export function computeAvailability(input: AvailabilityInput): Array<AvailabilitySlot> {
  const requestedStart = isoToDate(input.request.startsAt);
  const requestedEnd = new Date(
    requestedStart.getTime() + input.serviceDurationMinutes * 60_000,
  );
  const weekday = requestedStart.getUTCDay();
  const minutes =
    requestedStart.getUTCHours() * 60 + requestedStart.getUTCMinutes();

  const openWindow = input.hours.find(
    (window) =>
      window.dayOfWeek === weekday &&
      minutes >= window.openMinutes &&
      minutes + input.serviceDurationMinutes <= window.closeMinutes,
  );

  if (!openWindow) {
    return [];
  }

  const blockedByClosure = input.closures.some((closure) =>
    overlaps(
      requestedStart,
      requestedEnd,
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
          requestedStart,
          requestedEnd,
          isoToDate(appointment.startsAt),
          isoToDate(appointment.endsAt),
        ),
      );
    })
    .map((staffId) => ({
      staffId,
      serviceId: input.request.serviceId,
      startsAt: requestedStart.toISOString(),
      endsAt: requestedEnd.toISOString(),
    }));
}
