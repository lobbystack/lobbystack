import { DateTime } from "luxon";

import { addDays, keyToDate, monthGrid, weekDays } from "@/lib/calendar-days";

/**
 * Layout math for the appointments calendar's time grid and month grid. Days
 * are "YYYY-MM-DD" keys and minutes count from that day's midnight, both in
 * the business's time zone, so a booking sits where the business sees it
 * wherever the owner's browser is.
 */

/** Pixels per hour on the time grid: twelve 4px steps, so a quarter hour is 12px. */
export const HOUR_HEIGHT = 48;
/** The shortest block drawn, so a 5-minute booking still takes a click. */
export const MIN_BLOCK_HEIGHT = 18;
/** Hours shown when the business has no opening hours yet. */
export const DEFAULT_HOURS = { start: 8, end: 18 } as const;
/** Empty hours kept above opening and below closing. */
export const HOUR_PADDING = 1;
/** Minutes per clickable slot on the time grid. */
export const SLOT_MINUTES = 30;

export type CalendarView = "day" | "week" | "month";

/** The days a view shows around `anchor`: the day itself, its week, or six weeks covering its month. */
export function calendarDays(view: CalendarView, anchor: string, firstDay: number): string[] {
  return view === "day" ? [anchor] : view === "week" ? weekDays(anchor, firstDay) : monthGrid(anchor, firstDay);
}

export type Interval = { id: string; startsAt: string; endsAt: string };
/** An interval's part on one day, in minutes from that day's midnight. */
export type Segment = { id: string; start: number; end: number; allDay: boolean };
export type HoursWindow = { dayOfWeek: number; openMinutes: number; closeMinutes: number };

/** The instant a day starts in a time zone, as an ISO string. */
export function dayStart(day: string, timeZone: string): string {
  return DateTime.fromISO(day, { zone: timeZone }).startOf("day").toUTC().toISO()!;
}

/** The [from, to) instants covering a run of days, for fetching what they show. */
export function rangeBounds(days: readonly string[], timeZone: string): { from: string; to: string } {
  return { from: dayStart(days[0]!, timeZone), to: dayStart(addDays(days.at(-1)!, 1), timeZone) };
}

/** Minutes from the day's midnight to an instant, in the time zone; negative before the day, past its length after it. */
export function minutesInDay(instant: string, day: string, timeZone: string): number {
  const midnight = DateTime.fromISO(day, { zone: timeZone }).startOf("day");
  return Math.round(DateTime.fromISO(instant).diff(midnight, "minutes").minutes);
}

/** The instant at `minutes` past the day's midnight, on the business's wall clock. */
export function instantAt(day: string, minutes: number, timeZone: string): string {
  return DateTime.fromISO(day, { zone: timeZone }).startOf("day").set({ hour: Math.floor(minutes / 60), minute: minutes % 60 }).toUTC().toISO()!;
}

/** The day's length in minutes: 1380 or 1500 on the days clocks change. */
export function dayLength(day: string, timeZone: string): number {
  return minutesInDay(dayStart(addDays(day, 1), timeZone), day, timeZone);
}

/**
 * Each interval's part on `day`, clipped to the day, earliest first. One that
 * covers the whole day goes in the all-day row instead of the grid.
 */
export function daySegments(intervals: readonly Interval[], day: string, timeZone: string): Segment[] {
  const length = dayLength(day, timeZone);
  const segments: Segment[] = [];
  for (const interval of intervals) {
    const start = minutesInDay(interval.startsAt, day, timeZone);
    const end = minutesInDay(interval.endsAt, day, timeZone);
    if (end <= 0 || start >= length || end <= start) continue;
    const clipped = { start: Math.max(start, 0), end: Math.min(end, length) };
    segments.push({ id: interval.id, ...clipped, allDay: clipped.start === 0 && clipped.end === length });
  }
  return segments.sort(bySegment);
}

function bySegment(left: Segment, right: Segment): number {
  return left.start - right.start || right.end - left.end || left.id.localeCompare(right.id);
}

/**
 * Side-by-side columns for overlapping segments. Segments that overlap,
 * directly or through others, form a group that splits the day column into
 * as many columns as it needs at once; each segment takes the first column
 * free at its start.
 */
export function layoutColumns(segments: readonly Segment[]): Map<string, { column: number; columns: number }> {
  const placed = new Map<string, { column: number; columns: number }>();
  let group: Array<{ id: string; column: number }> = [];
  let columnEnds: number[] = [];
  let groupEnd = -Infinity;
  const close = () => {
    for (const member of group) placed.set(member.id, { column: member.column, columns: columnEnds.length });
    group = [];
    columnEnds = [];
  };
  for (const segment of [...segments].sort(bySegment)) {
    if (segment.start >= groupEnd) close();
    let column = columnEnds.findIndex((end) => end <= segment.start);
    if (column === -1) column = columnEnds.push(segment.end) - 1;
    else columnEnds[column] = segment.end;
    group.push({ id: segment.id, column });
    groupEnd = group.length === 1 ? segment.end : Math.max(groupEnd, segment.end);
  }
  close();
  return placed;
}

/**
 * The hours the time grid shows: from an hour before the earliest opening to
 * an hour after the latest closing on the shown weekdays, widened to fit
 * every segment, so nothing booked outside the hours is hidden.
 */
export function visibleHours(input: { hours: readonly HoursWindow[]; days: readonly string[]; segments: readonly Segment[] }): { start: number; end: number } {
  const weekdays = new Set(input.days.map((day) => keyToDate(day).getUTCDay()));
  const windows = input.hours.filter((window) => weekdays.has(window.dayOfWeek));
  const open = windows.length ? Math.min(...windows.map((window) => window.openMinutes)) : DEFAULT_HOURS.start * 60 + HOUR_PADDING * 60;
  const close = windows.length ? Math.max(...windows.map((window) => window.closeMinutes)) : DEFAULT_HOURS.end * 60 - HOUR_PADDING * 60;
  const timed = input.segments.filter((segment) => !segment.allDay);
  const start = Math.max(0, Math.min(Math.floor(open / 60) - HOUR_PADDING, ...timed.map((segment) => Math.floor(segment.start / 60))));
  const end = Math.min(24, Math.max(Math.ceil(close / 60) + HOUR_PADDING, ...timed.map((segment) => Math.ceil(segment.end / 60))));
  return { start, end: Math.max(end, start + 1) };
}

/** A segment's top and height in pixels on a grid that starts at `startHour`, where an hour is `hourHeight` pixels tall. */
export function blockPosition(segment: Pick<Segment, "start" | "end">, startHour: number, hourHeight: number = HOUR_HEIGHT): { top: number; height: number } {
  const top = ((segment.start - startHour * 60) * hourHeight) / 60;
  return { top, height: Math.max(((segment.end - segment.start) * hourHeight) / 60, MIN_BLOCK_HEIGHT) };
}

/** The slots a day column offers, in minutes from midnight, from `startHour` to `endHour`. */
export function slotStarts(startHour: number, endHour: number): number[] {
  return Array.from({ length: ((endHour - startHour) * 60) / SLOT_MINUTES }, (_, index) => startHour * 60 + index * SLOT_MINUTES);
}

/**
 * The parts of a day outside its opening hours, in minutes, between
 * `startHour` and `endHour`. A day with no hours is closed all day, unless the
 * business has no hours at all, which reads as not set up rather than closed.
 */
export function closedSpans(day: string, hours: readonly HoursWindow[], startHour: number, endHour: number): Array<{ start: number; end: number }> {
  if (!hours.length) return [];
  const weekday = keyToDate(day).getUTCDay();
  const open = hours.filter((window) => window.dayOfWeek === weekday).sort((left, right) => left.openMinutes - right.openMinutes);
  const spans: Array<{ start: number; end: number }> = [];
  let cursor = startHour * 60;
  for (const window of open) {
    if (window.openMinutes > cursor) spans.push({ start: cursor, end: Math.min(window.openMinutes, endHour * 60) });
    cursor = Math.max(cursor, window.closeMinutes);
  }
  if (cursor < endHour * 60) spans.push({ start: cursor, end: endHour * 60 });
  return spans.filter((span) => span.end > span.start);
}

/**
 * How many chips a month cell shows and how many it folds into "+N more". A
 * cell fits `capacity` lines; when there are more, the last line says how
 * many are left instead.
 */
export function monthOverflow(count: number, capacity: number): { shown: number; more: number } {
  if (count <= capacity) return { shown: count, more: 0 };
  const shown = Math.max(capacity - 1, 0);
  return { shown, more: count - shown };
}

/** The first interval that overlaps [startsAt, endsAt), if any. */
export function overlapping<T extends { startsAt: string; endsAt: string }>(startsAt: string, endsAt: string, intervals: readonly T[]): T | undefined {
  const [start, end] = [Date.parse(startsAt), Date.parse(endsAt)];
  return intervals.find((interval) => Date.parse(interval.startsAt) < end && Date.parse(interval.endsAt) > start);
}
