/** The calendar providers a business can connect. */
export const CALENDAR_PROVIDERS = ["google", "calcom"] as const;
export type CalendarProviderName = (typeof CALENDAR_PROVIDERS)[number];

export function isCalendarProviderName(value: unknown): value is CalendarProviderName {
  return typeof value === "string" && (CALENDAR_PROVIDERS as readonly string[]).includes(value);
}

/** How people see each provider named, in the API, the dashboard and errors. */
export const CALENDAR_PROVIDER_LABELS: Record<CalendarProviderName, string> = { google: "Google Calendar", calcom: "Cal.com" };

/** The provider's display name, or its stored name when it isn't one LobbyStack knows. */
export function calendarProviderLabel(provider: string): string {
  return isCalendarProviderName(provider) ? CALENDAR_PROVIDER_LABELS[provider] : provider;
}

/** A calendar a connection could write to. For Cal.com it's an event type. */
export type CalendarListEntry = { id: string; summary: string; primary: boolean; accessRole?: string };

export type CalendarBusyBlock = { startsAt: string; endsAt: string; externalEventId?: string };

/** The person an appointment is for. Providers that book on someone's behalf use it; Google ignores it. */
export type CalendarAttendee = { name?: string | null; phone?: string | null; email?: string | null };

export type CalendarEventWrite = {
  accessToken: string;
  calendarId: string;
  eventId?: string;
  clientEventId?: string;
  title: string;
  startsAt: string;
  endsAt: string;
  description?: string;
  appointmentId?: string;
  timezone?: string;
  attendee?: CalendarAttendee;
};

/** What the worker and the dashboard need from a calendar provider, once a connection has tokens. */
export interface CalendarProvider {
  refreshAccessToken(input: { refreshToken: string }): Promise<{ accessToken: string; expiresIn: number; refreshToken?: string }>;
  listCalendars(input: { accessToken: string }): Promise<CalendarListEntry[]>;
  getBusyBlocks(input: { accessToken: string; calendarId: string; startsAt: string; endsAt: string }): Promise<CalendarBusyBlock[]>;
  upsertEvent(input: CalendarEventWrite): Promise<{ externalEventId: string }>;
  deleteEvent(input: { accessToken: string; calendarId: string; eventId: string; appointmentId?: string }): Promise<void>;
}
