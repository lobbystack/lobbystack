import { DateTime } from "luxon";

export type CalendarView = "day" | "week";

export type CalendarRange = { view: CalendarView; start: DateTime; end: DateTime; days: DateTime[] };

/** The day or week (Monday first) that contains `date`, in the business's timezone. */
export function calendarRange(view: CalendarView, date: string | null | undefined, timezone: string, now: Date = new Date()): CalendarRange {
  const parsed = date ? DateTime.fromISO(date, { zone: timezone }) : DateTime.fromJSDate(now, { zone: timezone });
  const anchor = (parsed.isValid ? parsed : DateTime.fromJSDate(now, { zone: timezone })).startOf("day");
  const start = view === "week" ? anchor.startOf("week") : anchor;
  const length = view === "week" ? 7 : 1;
  const days = Array.from({ length }, (_, index) => start.plus({ days: index }));
  return { view, start, end: start.plus({ days: length }), days };
}

/** The date the previous or next button moves to, as YYYY-MM-DD. */
export function shiftCalendarDate(range: CalendarRange, direction: -1 | 1): string {
  return range.start.plus({ days: direction * range.days.length }).toISODate()!;
}

export type CalendarBlock<T> = { item: T; top: number; height: number };

/**
 * Where each appointment sits in a column that shows `startHour` to
 * `endHour`, as percentages of the column height.
 */
export function layoutBlocks<T extends { startsAt: string; endsAt: string }>(items: T[], day: DateTime, startHour: number, endHour: number): Array<CalendarBlock<T>> {
  const dayStart = day.set({ hour: startHour, minute: 0, second: 0, millisecond: 0 });
  const span = (endHour - startHour) * 60;
  return items.flatMap((item) => {
    const starts = DateTime.fromISO(item.startsAt).setZone(day.zone);
    const ends = DateTime.fromISO(item.endsAt).setZone(day.zone);
    if (!starts.hasSame(day, "day")) return [];
    const from = Math.max(0, starts.diff(dayStart, "minutes").minutes);
    const to = Math.min(span, ends.diff(dayStart, "minutes").minutes);
    if (to <= 0 || from >= span) return [];
    return [{ item, top: (from / span) * 100, height: Math.max(((to - from) / span) * 100, 2.5) }];
  });
}

/** Opening hours shown on the grid: 8 to 18, widened to fit every appointment. */
export function visibleHours<T extends { startsAt: string; endsAt: string }>(items: T[], timezone: string): { startHour: number; endHour: number } {
  let startHour = 8;
  let endHour = 18;
  for (const item of items) {
    const starts = DateTime.fromISO(item.startsAt).setZone(timezone);
    const ends = DateTime.fromISO(item.endsAt).setZone(timezone);
    startHour = Math.min(startHour, starts.hour);
    endHour = Math.max(endHour, Math.min(24, ends.hour + (ends.minute > 0 ? 1 : 0)));
  }
  return { startHour, endHour: Math.max(endHour, startHour + 1) };
}
