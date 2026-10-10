import type { HoursWindow } from "@lobbystack/shared";
import { DateTime } from "luxon";

// Weekly opening hours: zero or more windows per weekday, in local minutes
// from midnight. A day with a lunch break has two windows, such as 9:00 to
// 12:00 and 13:00 to 17:00. A day with no window is closed.

// Every check here is about the input, so its error is a 400.
const invalidHours = (message: string) => Object.assign(new Error(message), { status: 400 });

/** Enough for a lunch break and an evening shift. */
export const MAX_HOURS_WINDOWS_PER_DAY = 4;

/**
 * Checks weekly hours and returns them sorted by day and opening time. Throws
 * when a day is not 0 (Sunday) to 6, a window doesn't close after it opens
 * within the same day, windows on a day overlap, or a day has too many.
 */
export function normalizeHoursWindows(windows: ReadonlyArray<HoursWindow>): HoursWindow[] {
  for (const window of windows) {
    if (!Number.isInteger(window.dayOfWeek) || window.dayOfWeek < 0 || window.dayOfWeek > 6) throw invalidHours("Each day must be a weekday.");
    if (!Number.isInteger(window.openMinutes) || !Number.isInteger(window.closeMinutes) || window.openMinutes < 0 || window.closeMinutes > 1440 || window.closeMinutes <= window.openMinutes) throw invalidHours("Closing time must be after opening time.");
  }
  const sorted = windows
    .map((window) => ({ dayOfWeek: window.dayOfWeek, openMinutes: window.openMinutes, closeMinutes: window.closeMinutes }))
    .sort((left, right) => left.dayOfWeek - right.dayOfWeek || left.openMinutes - right.openMinutes);
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1]!;
    const current = sorted[index]!;
    if (previous.dayOfWeek === current.dayOfWeek && current.openMinutes < previous.closeMinutes) throw invalidHours("Opening windows on the same day can't overlap.");
  }
  for (let day = 0; day < 7; day += 1) {
    if (sorted.filter((window) => window.dayOfWeek === day).length > MAX_HOURS_WINDOWS_PER_DAY) throw invalidHours(`Each day can have up to ${MAX_HOURS_WINDOWS_PER_DAY} opening windows.`);
  }
  return sorted;
}

/** True when both lists describe the same week. Both must be normalized. */
export function sameHoursWindows(left: ReadonlyArray<HoursWindow>, right: ReadonlyArray<HoursWindow>): boolean {
  return left.length === right.length && left.every((window, index) => {
    const other = right[index]!;
    return window.dayOfWeek === other.dayOfWeek && window.openMinutes === other.openMinutes && window.closeMinutes === other.closeMinutes;
  });
}

/** Enough for every public holiday over two years. */
export const MAX_CLOSURES = 50;
export const MAX_CLOSURE_REASON_LENGTH = 100;
// A datetime-local input's value, such as 2026-12-25T09:00.
const LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/**
 * Checks dated closures, such as Christmas Day or a half day, entered as
 * local times in the business's timezone, and returns them as instants sorted
 * by start. Throws when a time is malformed, a closure doesn't end after it
 * starts, has already ended or ends more than two years ahead, closures
 * overlap, a reason is too long, or there are too many.
 */
export function normalizeClosures(
  closures: ReadonlyArray<{ startsAt: string; endsAt: string; reason?: string | undefined }>,
  timezone: string,
  now: Date,
): Array<{ startsAt: Date; endsAt: Date; reason: string }> {
  if (closures.length > MAX_CLOSURES) throw invalidHours(`A business can have up to ${MAX_CLOSURES} closures.`);
  const latestEnd = DateTime.fromJSDate(now).plus({ years: 2 }).toJSDate();
  const sorted = closures.map((closure) => {
    const [startsAt, endsAt] = [closure.startsAt, closure.endsAt].map((value) => LOCAL_DATE_TIME.test(value) ? DateTime.fromISO(value, { zone: timezone }) : undefined);
    if (!startsAt?.isValid || !endsAt?.isValid) throw invalidHours("Each closure needs a start and an end like 2026-12-25T09:00.");
    const reason = closure.reason?.trim() ?? "";
    if (reason.length > MAX_CLOSURE_REASON_LENGTH) throw invalidHours(`A closure reason can be up to ${MAX_CLOSURE_REASON_LENGTH} characters.`);
    const checked = { startsAt: startsAt.toJSDate(), endsAt: endsAt.toJSDate(), reason };
    if (checked.endsAt <= checked.startsAt) throw invalidHours("A closure must end after it starts.");
    if (checked.endsAt <= now) throw invalidHours("A closure can't end in the past.");
    if (checked.endsAt > latestEnd) throw invalidHours("A closure must end within two years.");
    return checked;
  }).sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime());
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index]!.startsAt < sorted[index - 1]!.endsAt) throw invalidHours("Closures can't overlap.");
  }
  return sorted;
}
