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

/** The vacation from a request body: its days, null when there's none, or undefined when it isn't a pair of dates. */
export function employeeVacation(value: unknown): { startsOn: string; endsOn: string } | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "object") return undefined;
  const { startsOn, endsOn } = value as { startsOn?: unknown; endsOn?: unknown };
  return typeof startsOn === "string" && typeof endsOn === "string" ? { startsOn, endsOn } : undefined;
}
