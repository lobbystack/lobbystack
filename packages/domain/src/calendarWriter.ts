/**
 * Whether the provider's calendar is an event type LobbyStack books, as with
 * Cal.com and Calendly, rather than a calendar it adds events to. A booking
 * can outlast its appointment, is public until it's cancelled, and comes with
 * a webhook.
 */
export function isBookingCalendarProvider(provider: string): boolean {
  return provider === "calcom" || provider === "calendly";
}

/** A calendar connection that could hold a staff member's appointments. */
export type CalendarWriterCandidate = { id: string; provider: string; staffId: string | null; selectedCalendarId: string | null };

/**
 * The connection an appointment is written to, from the live connections
 * that cover its staff member. Every covering connection still counts as
 * busy time; only one gets the appointment. In order:
 *
 * 1. The staff member's own connection over the business's.
 * 2. One with a calendar picked over one without.
 * 3. A booking provider over Google: Cal.com's and Calendly's public booking
 *    pages take bookings LobbyStack doesn't see until it syncs, so their
 *    bookings are the double-booking risk, and a booking holds the time there
 *    at once.
 * 4. The oldest id, so the choice stays put.
 */
export function compareCalendarWriters(left: CalendarWriterCandidate, right: CalendarWriterCandidate): number {
  return rank(right.staffId !== null) - rank(left.staffId !== null)
    || rank(right.selectedCalendarId !== null) - rank(left.selectedCalendarId !== null)
    || rank(isBookingCalendarProvider(right.provider)) - rank(isBookingCalendarProvider(left.provider))
    || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
}

/** The candidate compareCalendarWriters ranks first. `view` reads a row that keeps the connection's fields under other names. */
export function pickCalendarWriter<T>(candidates: T[], view: (candidate: T) => CalendarWriterCandidate = (candidate) => candidate as CalendarWriterCandidate): T | undefined {
  return [...candidates].sort((left, right) => compareCalendarWriters(view(left), view(right)))[0];
}

function rank(value: boolean): number {
  return value ? 1 : 0;
}
