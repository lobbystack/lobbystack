import type { BusinessContextSnapshot, TransferPolicy } from "./index";
import { transferModes } from "./receptionist";

export function normalizeTransferMode(value: string | null | undefined): TransferPolicy["mode"] {
  if (value == null) return "on_request";
  return (transferModes as readonly string[]).includes(value) ? value as TransferPolicy["mode"] : "never";
}

/** Authoritative transfer gate, including automated provider-failure fallbacks. */
export function isTransferPermitted(
  snapshot: Pick<BusinessContextSnapshot, "transferPolicy" | "timezone" | "hours" | "closures">,
  evidence: { callerRequested?: boolean; urgent?: boolean; now?: Date } = {},
): boolean {
  if (!snapshot.transferPolicy.transferNumber) return false;
  switch (snapshot.transferPolicy.mode) {
    case "always": return true;
    case "on_request": return evidence.callerRequested === true;
    case "on_urgent": return evidence.urgent === true;
    case "during_business_hours": return isBusinessOpen(snapshot, evidence.now);
    default: return false;
  }
}

/** Whether the business is open at `now` in its own timezone: inside a weekly window and outside every closure. */
export function isBusinessOpen(snapshot: Pick<BusinessContextSnapshot, "timezone" | "hours" | "closures">, now: Date = new Date()): boolean {
  if (!Number.isFinite(now.getTime())) return false;
  if (snapshot.closures.some((closure) => now.getTime() >= Date.parse(closure.startsAt) && now.getTime() < Date.parse(closure.endsAt))) return false;
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: snapshot.timezone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
    const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
    const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
    const minute = Number(get("hour")) * 60 + Number(get("minute"));
    return snapshot.hours.some((hours) => hours.openMinutes < hours.closeMinutes
      ? hours.dayOfWeek === day && minute >= hours.openMinutes && minute < hours.closeMinutes
      : hours.openMinutes > hours.closeMinutes && ((hours.dayOfWeek === day && minute >= hours.openMinutes) || ((hours.dayOfWeek + 1) % 7 === day && minute < hours.closeMinutes)));
  } catch { return false; }
}
