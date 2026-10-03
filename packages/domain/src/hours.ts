import type { HoursWindow } from "@lobbystack/shared";

// Weekly opening hours: zero or more windows per weekday, in local minutes
// from midnight. A day with a lunch break has two windows, such as 9:00 to
// 12:00 and 13:00 to 17:00. A day with no window is closed.

/** Enough for a lunch break and an evening shift. */
export const MAX_HOURS_WINDOWS_PER_DAY = 4;

/**
 * Checks weekly hours and returns them sorted by day and opening time. Throws
 * when a day is not 0 (Sunday) to 6, a window doesn't close after it opens
 * within the same day, windows on a day overlap, or a day has too many.
 */
export function normalizeHoursWindows(windows: ReadonlyArray<HoursWindow>): HoursWindow[] {
  for (const window of windows) {
    if (!Number.isInteger(window.dayOfWeek) || window.dayOfWeek < 0 || window.dayOfWeek > 6) throw new Error("Each day must be a weekday.");
    if (!Number.isInteger(window.openMinutes) || !Number.isInteger(window.closeMinutes) || window.openMinutes < 0 || window.closeMinutes > 1440 || window.closeMinutes <= window.openMinutes) throw new Error("Closing time must be after opening time.");
  }
  const sorted = windows
    .map((window) => ({ dayOfWeek: window.dayOfWeek, openMinutes: window.openMinutes, closeMinutes: window.closeMinutes }))
    .sort((left, right) => left.dayOfWeek - right.dayOfWeek || left.openMinutes - right.openMinutes);
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1]!;
    const current = sorted[index]!;
    if (previous.dayOfWeek === current.dayOfWeek && current.openMinutes < previous.closeMinutes) throw new Error("Opening windows on the same day can't overlap.");
  }
  for (let day = 0; day < 7; day += 1) {
    if (sorted.filter((window) => window.dayOfWeek === day).length > MAX_HOURS_WINDOWS_PER_DAY) throw new Error(`Each day can have up to ${MAX_HOURS_WINDOWS_PER_DAY} opening windows.`);
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
