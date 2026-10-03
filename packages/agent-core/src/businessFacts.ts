import type { BusinessContextSnapshot } from "@lobbystack/shared";
import { DateTime } from "luxon";

// Snapshot facts in the words the receptionist speaks them. The hours and
// services tools, their direct answers on calls, and GPT-Live's own
// instructions all read from here, so a caller hears the same thing from each.

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function formatMinutes(minutes: number): string {
  return DateTime.fromObject({ hour: Math.floor(minutes / 60), minute: minutes % 60 }).toFormat("h:mm a");
}

/** One line per weekday, Sunday first: "Monday: 9:00 AM to 5:00 PM" or "Saturday: closed". */
export function weeklyHours(snapshot: Pick<BusinessContextSnapshot, "hours">): string[] {
  return DAY_NAMES.map((day, index) => {
    const windows = snapshot.hours.filter((window) => window.dayOfWeek === index);
    return `${day}: ${windows.length ? windows.map((window) => `${formatMinutes(window.openMinutes)} to ${formatMinutes(window.closeMinutes)}`).join(", ") : "closed"}`;
  });
}

export type UpcomingClosure = { from: string; to: string; reason?: string | undefined };

export function upcomingClosures(snapshot: Pick<BusinessContextSnapshot, "closures">, now: DateTime): UpcomingClosure[] {
  return snapshot.closures
    .filter((closure) => DateTime.fromISO(closure.endsAt) > now)
    .map((closure) => ({ from: closure.startsAt, to: closure.endsAt, reason: closure.reason }));
}

/** "Dec 24, 9:00 AM to Dec 26, 9:00 AM (Holidays)" in the business's timezone. */
export function describeClosure(closure: UpcomingClosure, timezone: string): string {
  const format = (iso: string) => DateTime.fromISO(iso).setZone(timezone).toFormat("LLL d, h:mm a");
  return `${format(closure.from)} to ${format(closure.to)}${closure.reason ? ` (${closure.reason})` : ""}`;
}

// New businesses start with a summary like "Acme uses LobbyStack to answer
// calls." (older ones: "...to handle calls and SMS."). It says nothing about
// the business, and GPT-Live would repeat it, so callers never hear it.
const PLACEHOLDER_SUMMARY = /\buses LobbyStack to (?:answer calls|handle calls and SMS)\.?$/i;

/** The business's own summary, or undefined while it's still the placeholder. */
export function businessSummary(snapshot: Pick<BusinessContextSnapshot, "summary">): string | undefined {
  const summary = snapshot.summary?.trim();
  return summary && !PLACEHOLDER_SUMMARY.test(summary) ? summary : undefined;
}

export type ServiceFact = { name: string; durationMinutes: number; description?: string };

export function serviceFacts(snapshot: Pick<BusinessContextSnapshot, "services">): ServiceFact[] {
  return snapshot.services.map((service) => ({ name: service.name, durationMinutes: service.durationMinutes, ...(service.description ? { description: service.description } : {}) }));
}

/** One line per service. Descriptions are dropped when the list would run past maxChars. */
export function describeServices(services: ServiceFact[], maxChars = Number.POSITIVE_INFINITY): string {
  const line = (service: ServiceFact, withDescription: boolean) => `- ${service.name} (${service.durationMinutes} min)${withDescription && service.description ? `: ${service.description.trim()}` : ""}`;
  const full = services.map((service) => line(service, true)).join("\n");
  return full.length <= maxChars ? full : services.map((service) => line(service, false)).join("\n");
}
