/** A calendar connection that could hold a staff member's appointments. */
export type CalendarWriterCandidate = { id: string; provider: string; staffId: string | null; selectedCalendarId: string | null };

/**
 * The connection an appointment is written to, from the live connections
 * that cover its staff member. Every covering connection still counts as
 * busy time; only one gets the appointment. In order:
 *
 * 1. The staff member's own connection over the business's.
 * 2. One with a calendar picked over one without.
 * 3. Cal.com over Google: Cal.com's public booking page takes bookings
 *    LobbyStack doesn't see until it syncs, so its bookings are the
 *    double-booking risk, and a Cal.com booking holds the time there at once.
 * 4. The oldest id, so the choice stays put.
 */
export function compareCalendarWriters(left: CalendarWriterCandidate, right: CalendarWriterCandidate): number {
  return rank(right.staffId !== null) - rank(left.staffId !== null)
    || rank(right.selectedCalendarId !== null) - rank(left.selectedCalendarId !== null)
    || rank(right.provider === "calcom") - rank(left.provider === "calcom")
    || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
}

/** The candidate compareCalendarWriters ranks first. `view` reads a row that keeps the connection's fields under other names. */
export function pickCalendarWriter<T>(candidates: T[], view: (candidate: T) => CalendarWriterCandidate = (candidate) => candidate as CalendarWriterCandidate): T | undefined {
  return [...candidates].sort((left, right) => compareCalendarWriters(view(left), view(right)))[0];
}

function rank(value: boolean): number {
  return value ? 1 : 0;
}
