import { DateTime } from "luxon";

/** What the dashboard warns about once an operator picks a Cal.com event type. */
export type CalcomEventTypeWarning =
  /** Services last a length the event type doesn't offer, so Cal.com books them at its default length. */
  | { code: "missing_lengths"; lengths: number[] }
  /** An SMS workflow is attached, so Cal.com texts callers on top of LobbyStack's messages. */
  | { code: "sms_reminders" }
  /** The event type's schedule leaves out hours the business is open, so Cal.com refuses bookings then. */
  | { code: "narrower_availability"; days: number[] };

type Schedule = { timeZone: string; availability: Array<{ days: string[]; startTime: string; endTime: string }> };

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * The warnings for an event type, given the business's active service
 * lengths and opening hours (`dayOfWeek` 0 is Sunday, as in business_hours).
 * Without a schedule, availability isn't compared. Date overrides aren't either.
 */
export function calcomEventTypeWarnings(input: {
  eventType: { lengths: number[]; smsReminders: boolean };
  serviceDurations: number[];
  hours: Array<{ dayOfWeek: number; openMinutes: number; closeMinutes: number }>;
  timezone: string;
  schedule: Schedule | null;
}): CalcomEventTypeWarning[] {
  const warnings: CalcomEventTypeWarning[] = [];
  const missing = [...new Set(input.serviceDurations)].filter((length) => !input.eventType.lengths.includes(length)).sort((a, b) => a - b);
  if (missing.length) warnings.push({ code: "missing_lengths", lengths: missing });
  if (input.eventType.smsReminders) warnings.push({ code: "sms_reminders" });
  if (input.schedule) {
    const days = [...new Set(input.hours.filter((window) => !coveredBySchedule(window, input.timezone, input.schedule!)).map((window) => window.dayOfWeek))].sort((a, b) => a - b);
    if (days.length) warnings.push({ code: "narrower_availability", days });
  }
  return warnings;
}

// Compares one opening window, placed on a reference week, with the schedule in its own time zone.
function coveredBySchedule(window: { dayOfWeek: number; openMinutes: number; closeMinutes: number }, timezone: string, schedule: Schedule): boolean {
  // 2030-01-06 is a Sunday, far from any daylight-saving change in most zones.
  const day = DateTime.fromObject({ year: 2030, month: 1, day: 6 + window.dayOfWeek }, { zone: timezone });
  if (!day.isValid) return true;
  const opens = day.plus({ minutes: window.openMinutes }).setZone(schedule.timeZone);
  const closes = day.plus({ minutes: window.closeMinutes }).setZone(schedule.timeZone);
  if (!opens.isValid || !closes.isValid) return true;
  // Split at the schedule's midnight, since its windows belong to one day each.
  const parts: Array<[DateTime, DateTime]> = [];
  let start = opens;
  while (start < closes) {
    const midnight = start.startOf("day").plus({ days: 1 });
    const end = closes < midnight ? closes : midnight;
    parts.push([start, end]);
    start = end;
  }
  return parts.every(([from, to]) => {
    const name = WEEKDAYS[from.weekday % 7]!;
    const fromMinutes = from.hour * 60 + from.minute;
    const toMinutes = to.hasSame(from, "day") ? to.hour * 60 + to.minute : 24 * 60;
    return schedule.availability.some((slot) => slot.days.includes(name) && minutes(slot.startTime) <= fromMinutes && toMinutes <= endMinutes(slot.endTime));
  });
}

function minutes(value: string): number {
  const [hours, mins] = value.split(":").map(Number);
  return (hours ?? 0) * 60 + (mins ?? 0);
}

// Cal.com writes the end of a day as 23:59 or 00:00.
function endMinutes(value: string): number {
  const total = minutes(value);
  return total === 0 || total >= 23 * 60 + 59 ? 24 * 60 : total;
}
