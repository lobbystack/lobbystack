import { hasEnded } from "@/hooks/use-appointments";
import { dayKey } from "@/lib/calendar-days";

/** Appointments still to come today in the business's time zone, and the next one; null until the list loads. */
export function todaysAppointments(rows: Array<{ startsAt: string; endsAt: string; timezone: string; status: string }> | undefined, fallbackTimeZone: string | undefined, now = Date.now()): { count: number; next: { startsAt: string; timezone: string } | undefined } | null {
  if (!rows) return null;
  const timeZone = rows[0]?.timezone ?? fallbackTimeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = dayKey(new Date(now), timeZone);
  const todays = rows.filter((row) => row.status !== "canceled" && !hasEnded(row, now) && dayKey(row.startsAt, timeZone) === today);
  return { count: todays.length, next: todays.find((row) => Date.parse(row.startsAt) > now) };
}
