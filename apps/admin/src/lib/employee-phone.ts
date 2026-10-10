import { normalizePhoneNumber } from "./phone";

/** An employee's phone from a request body: E.164, null when left blank, or undefined when it isn't a valid number. */
export function optionalEmployeePhone(value: unknown): string | null | undefined {
  if (value === undefined || value === null || (typeof value === "string" && !value.trim())) return null;
  return typeof value === "string" ? normalizePhoneNumber(value) : undefined;
}
