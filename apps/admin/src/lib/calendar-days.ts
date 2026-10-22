/**
 * Calendar days as "YYYY-MM-DD" keys. A day is read in the business's time
 * zone, so an appointment lands on the day the business sees, wherever the
 * owner's browser is. Arithmetic runs on UTC midnights, which have no DST jumps.
 */

const keyFormatters = new Map<string, Intl.DateTimeFormat>();

/** The calendar day an instant falls on in a time zone. */
export function dayKey(value: Date | string, timeZone: string): string {
  let formatter = keyFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
    keyFormatters.set(timeZone, formatter);
  }
  return formatter.format(typeof value === "string" ? new Date(value) : value);
}

/** The day as a UTC-midnight Date; format it with `timeZone: "UTC"`. */
export function keyToDate(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!));
}

function dateToKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(key: string, days: number): string {
  const date = keyToDate(key);
  date.setUTCDate(date.getUTCDate() + days);
  return dateToKey(date);
}

export function addMonths(key: string, months: number): string {
  const date = keyToDate(key);
  return dateToKey(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1)));
}

/** 0 for Sunday, 1 for Monday: the first day of the week where the locale is used. */
export function firstDayOfWeek(locale: string): number {
  try {
    const info = (new Intl.Locale(locale) as Intl.Locale & { getWeekInfo?: () => { firstDay: number }; weekInfo?: { firstDay: number } });
    const firstDay = info.getWeekInfo?.().firstDay ?? info.weekInfo?.firstDay;
    if (firstDay) return firstDay % 7;
  } catch {
    // An unknown locale falls through to the language default.
  }
  return locale.toLowerCase().startsWith("en") ? 0 : 1;
}

export function startOfWeek(key: string, firstDay: number): string {
  return addDays(key, -((keyToDate(key).getUTCDay() - firstDay + 7) % 7));
}

/** The seven days of the week containing `key`. */
export function weekDays(key: string, firstDay: number): string[] {
  const start = startOfWeek(key, firstDay);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

/** Six full weeks covering the month containing `key`, so every month fits the same grid. */
export function monthGrid(key: string, firstDay: number): string[] {
  const start = startOfWeek(`${key.slice(0, 7)}-01`, firstDay);
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}
