import { DateTime, IANAZone } from "luxon";

/** The date presets Analytics offers. */
export type AnalyticsPreset = "allTime" | "today" | "yesterday" | "thisWeek" | "thisMonth" | "lastMonth" | "last30" | "last3Months" | "thisYear" | "lastYear";

/**
 * A span of calendar days, both ends included. Each Date only carries a
 * year, month and day (at local midnight, so the date picker and the URL can
 * read it); which instants a day covers depends on the business's time zone.
 */
export type CalendarRange = { from: Date; to: Date };

function zoneOrUtc(timeZone: string | null | undefined): string {
  return timeZone && IANAZone.isValidZone(timeZone) ? timeZone : "UTC";
}

function calendarDay(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day);
}

/** Today's date where the business is, as a calendar day. */
export function businessToday(timeZone: string | null | undefined, now: Date = new Date()): Date {
  const today = DateTime.fromJSDate(now, { zone: zoneOrUtc(timeZone) });
  return calendarDay(today.year, today.month, today.day);
}

/**
 * The calendar days a preset covers, counted in the business's time zone, so
 * "today" is the business's today wherever the viewer is.
 */
export function analyticsPresetRange(preset: AnalyticsPreset, options: { timeZone: string | null | undefined; now?: Date | undefined; businessCreatedAt?: string | undefined }): CalendarRange {
  const today = businessToday(options.timeZone, options.now);
  const year = today.getFullYear(), month = today.getMonth(), date = today.getDate();
  const day = (offset: number) => new Date(year, month, date + offset);
  if (preset === "today") return { from: today, to: today };
  if (preset === "yesterday") return { from: day(-1), to: day(-1) };
  if (preset === "thisWeek") return { from: day(-today.getDay()), to: today };
  if (preset === "thisMonth") return { from: new Date(year, month, 1), to: today };
  if (preset === "lastMonth") return { from: new Date(year, month - 1, 1), to: new Date(year, month, 0) };
  if (preset === "last3Months") return { from: new Date(year, month - 3, date), to: today };
  if (preset === "thisYear") return { from: new Date(year, 0, 1), to: today };
  if (preset === "lastYear") return { from: new Date(year - 1, 0, 1), to: new Date(year - 1, 11, 31) };
  if (preset === "allTime") {
    // The API serves at most ten years, so very old businesses start there.
    const tenYearsAgo = new Date(year - 10, month, date + 1);
    const created = options.businessCreatedAt ? businessToday(options.timeZone, new Date(options.businessCreatedAt)) : new Date(2020, 0, 1);
    return { from: created > tenYearsAgo ? created : tenYearsAgo, to: today };
  }
  return { from: day(-29), to: today };
}

/**
 * The instants a range of calendar days covers in the business's time zone:
 * from the start of its first day to the start of the day after its last, so
 * every moment of the last day, this evening included, is inside.
 */
export function analyticsRangeBounds(range: CalendarRange, timeZone: string | null | undefined): { from: Date; to: Date } {
  const zone = zoneOrUtc(timeZone);
  const start = (value: Date, offset = 0) => DateTime.fromObject({ year: value.getFullYear(), month: value.getMonth() + 1, day: value.getDate() }, { zone }).plus({ days: offset }).startOf("day").toJSDate();
  return { from: start(range.from), to: start(range.to, 1) };
}

/** The last `days` days in the business's time zone, today included, as instants. */
export function lastDaysBounds(days: number, timeZone: string | null | undefined, now: Date = new Date()): { from: Date; to: Date } {
  const today = businessToday(timeZone, now);
  return analyticsRangeBounds({ from: new Date(today.getFullYear(), today.getMonth(), today.getDate() - (days - 1)), to: today }, timeZone);
}
