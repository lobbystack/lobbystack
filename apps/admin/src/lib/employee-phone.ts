import type { HoursWindow } from "@lobbystack/shared";

import { normalizePhoneNumber } from "./phone";

/** An employee's phone from a request body: E.164, null when left blank, or undefined when it isn't a valid number. */
export function optionalEmployeePhone(value: unknown): string | null | undefined {
  if (value === undefined || value === null || (typeof value === "string" && !value.trim())) return null;
  return typeof value === "string" ? normalizePhoneNumber(value) : undefined;
}

/** The service IDs from a request body, or null unless it's a non-empty list of strings. */
export function employeeServiceIds(value: unknown): string[] | null {
  return Array.isArray(value) && value.length > 0 && value.length <= 500 && value.every((id) => typeof id === "string") ? value as string[] : null;
}

/** An employee's own hours from a request body: null for the business's hours, or undefined when it isn't a list of windows. The domain checks the times. */
export function employeeHours(value: unknown): HoursWindow[] | null | undefined {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value) || value.length > 28) return undefined;
  const windows = value.map((window) => window as Partial<HoursWindow>);
  return windows.every((window) => typeof window === "object" && window !== null && [window.dayOfWeek, window.openMinutes, window.closeMinutes].every((part) => typeof part === "number"))
    ? windows.map(({ dayOfWeek, openMinutes, closeMinutes }) => ({ dayOfWeek: dayOfWeek!, openMinutes: openMinutes!, closeMinutes: closeMinutes! }))
    : undefined;
}

/** An employee's time off from a request body: a list of first and last days, empty when missing, or undefined when it isn't one. */
export function employeeTimeOff(value: unknown): Array<{ startsOn: string; endsOn: string }> | undefined {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 50) return undefined;
  const entries = value.map((entry) => (typeof entry === "object" && entry !== null ? entry : {}) as { startsOn?: unknown; endsOn?: unknown });
  return entries.every((entry) => typeof entry.startsOn === "string" && typeof entry.endsOn === "string")
    ? entries.map((entry) => ({ startsOn: entry.startsOn as string, endsOn: entry.endsOn as string }))
    : undefined;
}
