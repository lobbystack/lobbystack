import { createHmac, timingSafeEqual } from "node:crypto";

import { assertCertificationCalendar } from "@lobbystack/shared";

import type { CalendarBusyBlock, CalendarEventWrite, CalendarListEntry, CalendarProvider } from "../calendar";

/**
 * Every scope the integration uses. Cal.com reviews an OAuth client again when
 * it gains a scope, so the client is registered with all of them up front.
 */
export const CALCOM_SCOPES = ["PROFILE_READ", "EVENT_TYPE_READ", "SCHEDULE_READ", "BOOKING_READ", "BOOKING_WRITE", "APPS_READ", "WEBHOOK_READ", "WEBHOOK_WRITE"] as const;

/** Booking changes made in Cal.com that change when the connected person is busy. */
export const CALCOM_WEBHOOK_TRIGGERS = ["BOOKING_CREATED", "BOOKING_REQUESTED", "BOOKING_RESCHEDULED", "BOOKING_CANCELLED", "BOOKING_REJECTED"] as const;

// Each endpoint pins its own version; an endpoint called without one answers in an older format.
const API_VERSIONS = { bookings: "2026-02-25", bookingList: "2026-05-01", eventTypes: "2026-06-12", schedules: "2024-06-11" } as const;

const PAGE_LIMIT = 100;
const MAX_PAGES = 100;
// Cal.com still holds the time of a pending booking, as Google holds a tentative event.
const BUSY_STATUSES = new Set(["accepted", "pending", "awaiting_host"]);

export class CalcomOAuthRefreshError extends Error {
  constructor(readonly reconnectRequired: boolean) {
    super(reconnectRequired ? "Cal.com authorization requires reconnection." : "Cal.com token refresh is temporarily unavailable.");
    this.name = "CalcomOAuthRefreshError";
  }
}

/** A failed Cal.com request. `responseStatus` matches the field Google's errors carry. */
export class CalcomApiError extends Error {
  constructor(message: string, readonly responseStatus: number) {
    super(message);
    this.name = "CalcomApiError";
  }
}

export type CalcomCalendarConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  /** The domain after the @ in the stand-in attendee address. It must accept mail, since Cal.com checks for an MX record. */
  placeholderEmailDomain: string;
  apiUrl?: string;
  appUrl?: string;
};

export type CalcomEventType = {
  id: string;
  title: string;
  lengthInMinutes: number;
  /** Every length a booking may pick, the default included. */
  lengths: number[];
  scheduleId: number | null;
  /** An SMS workflow is attached, so Cal.com texts the attendee. */
  smsReminders: boolean;
};

export type CalcomSchedule = { timeZone: string; availability: Array<{ days: string[]; startTime: string; endTime: string }> };

type Booking = { uid: string; start: string; end: string; status: string; eventTypeId?: number };

/**
 * What's missing from a Cal.com setup the environment started, or null when
 * it's complete or not started at all. The stand-in address domain has no
 * default: Cal.com refuses an attendee domain without an MX record, so a
 * guessed one would fail every booking.
 */
export function calcomCalendarConfigProblem(env: Record<string, string | undefined> = process.env): string | null {
  const names = ["CALCOM_CLIENT_ID", "CALCOM_CLIENT_SECRET", "CALCOM_REDIRECT_URI", "CALCOM_PLACEHOLDER_EMAIL_DOMAIN"] as const;
  const missing = names.filter((name) => !env[name]?.trim());
  if (missing.length === 0 || missing.length === names.length) return null;
  return `Cal.com is off until ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} set. CALCOM_PLACEHOLDER_EMAIL_DOMAIN must accept mail, since Cal.com checks it for an MX record.`;
}

/** The Cal.com settings from the environment, or null until all four CALCOM_ variables are set. */
export function calcomCalendarConfigFromEnv(env: Record<string, string | undefined> = process.env): CalcomCalendarConfig | null {
  const clientId = env.CALCOM_CLIENT_ID?.trim();
  const clientSecret = env.CALCOM_CLIENT_SECRET?.trim();
  const redirectUri = env.CALCOM_REDIRECT_URI?.trim();
  const placeholderEmailDomain = env.CALCOM_PLACEHOLDER_EMAIL_DOMAIN?.trim();
  if (!clientId || !clientSecret || !redirectUri || !placeholderEmailDomain) return null;
  return { clientId, clientSecret, redirectUri, placeholderEmailDomain, ...(env.CALCOM_API_URL ? { apiUrl: env.CALCOM_API_URL } : {}), ...(env.CALCOM_APP_URL ? { appUrl: env.CALCOM_APP_URL } : {}) };
}

/** The stand-in attendee address for an appointment: unique, so it also finds a booking a retry already made. */
export function calcomPlaceholderEmail(appointmentId: string, domain: string): string {
  return `booking+${appointmentId.toLowerCase().replace(/[^a-z0-9-]/g, "")}@${domain}`;
}

/** Whether `signature` is Cal.com's hex HMAC-SHA256 of the raw body under `secret`. */
export function verifyCalcomWebhookSignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature || !secret) return false;
  const given = signature.trim().replace(/^sha256=/i, "");
  if (!/^[a-f0-9]{64}$/i.test(given)) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return timingSafeEqual(Buffer.from(given.toLowerCase()), Buffer.from(expected));
}

export class CalcomCalendarProvider implements CalendarProvider {
  private readonly apiUrl: string;
  private readonly appUrl: string;

  constructor(private readonly config: CalcomCalendarConfig) {
    this.apiUrl = (config.apiUrl ?? "https://api.cal.com").replace(/\/$/, "");
    this.appUrl = (config.appUrl ?? "https://app.cal.com").replace(/\/$/, "");
  }

  buildAuthorizationUrl(input: { state: string }): string {
    const url = new URL(`${this.appUrl}/auth/oauth2/authorize`);
    url.searchParams.set("client_id", this.config.clientId);
    url.searchParams.set("redirect_uri", this.config.redirectUri);
    url.searchParams.set("state", input.state);
    url.searchParams.set("scope", CALCOM_SCOPES.join(" "));
    return url.toString();
  }

  async exchangeCode(code: string): Promise<{ accessToken: string; refreshToken?: string; expiresIn: number }> {
    const response = await this.token({ grant_type: "authorization_code", code, redirect_uri: this.config.redirectUri });
    if (!response.ok) throw new Error(`Cal.com OAuth token exchange failed with status ${response.status}.`);
    const payload = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number };
    if (!payload.access_token || typeof payload.expires_in !== "number" || !Number.isFinite(payload.expires_in) || payload.expires_in <= 0) throw new Error("Cal.com OAuth returned an invalid token response.");
    return { accessToken: payload.access_token, ...(payload.refresh_token ? { refreshToken: payload.refresh_token } : {}), expiresIn: payload.expires_in };
  }

  async refreshAccessToken(input: { refreshToken: string }): Promise<{ accessToken: string; expiresIn: number; refreshToken?: string }> {
    const response = await this.token({ grant_type: "refresh_token", refresh_token: input.refreshToken });
    const payload = await response.json().catch(() => ({})) as { access_token?: string; expires_in?: number; refresh_token?: string; error?: string };
    if (!response.ok) throw new CalcomOAuthRefreshError(payload.error === "invalid_grant" || payload.error === "invalid_client" || response.status === 401);
    if (!payload.access_token || typeof payload.expires_in !== "number" || !Number.isFinite(payload.expires_in) || payload.expires_in <= 0) throw new CalcomOAuthRefreshError(false);
    return { accessToken: payload.access_token, expiresIn: payload.expires_in, ...(payload.refresh_token ? { refreshToken: payload.refresh_token } : {}) };
  }

  async getAccount(input: { accessToken: string }): Promise<{ id: string; email?: string; timeZone?: string; defaultScheduleId?: number }> {
    const data = await this.request<{ id?: number; email?: string; timeZone?: string; defaultScheduleId?: number | null }>(input.accessToken, "/v2/me", { what: "account lookup" });
    if (typeof data.id !== "number") throw new Error("Cal.com account lookup did not return an account id.");
    return { id: String(data.id), ...(data.email ? { email: data.email } : {}), ...(data.timeZone ? { timeZone: data.timeZone } : {}), ...(typeof data.defaultScheduleId === "number" ? { defaultScheduleId: data.defaultScheduleId } : {}) };
  }

  async listEventTypes(input: { accessToken: string }): Promise<CalcomEventType[]> {
    const data = await this.request<Array<{ id?: number; title?: string; lengthInMinutes?: number; lengthInMinutesOptions?: number[]; scheduleId?: number | null; bookingFields?: Array<{ slug?: string }> }>>(input.accessToken, "/v2/event-types", { version: API_VERSIONS.eventTypes, what: "event type discovery" });
    if (!Array.isArray(data)) throw new Error("Cal.com event type discovery returned an invalid response.");
    return data.flatMap((eventType) => typeof eventType.id === "number" && eventType.title && typeof eventType.lengthInMinutes === "number" ? [{
      id: String(eventType.id),
      title: eventType.title,
      lengthInMinutes: eventType.lengthInMinutes,
      lengths: [...new Set([eventType.lengthInMinutes, ...(eventType.lengthInMinutesOptions ?? [])])].sort((a, b) => a - b),
      scheduleId: typeof eventType.scheduleId === "number" ? eventType.scheduleId : null,
      smsReminders: (eventType.bookingFields ?? []).some((field) => field.slug === "smsReminderNumber"),
    }] : []);
  }

  /** The lengths a booking of the event type may pick, its default included. */
  async getEventType(accessToken: string, eventTypeId: number): Promise<{ lengths: number[] }> {
    const data = await this.request<{ lengthInMinutes?: number; lengthInMinutesOptions?: number[] }>(accessToken, `/v2/event-types/${eventTypeId}`, { version: API_VERSIONS.eventTypes, what: "event type lookup" });
    if (typeof data?.lengthInMinutes !== "number") throw new Error("Cal.com event type lookup returned an invalid response.");
    return { lengths: [...new Set([data.lengthInMinutes, ...(data.lengthInMinutesOptions ?? [])])] };
  }

  /** Event types stand in for calendars: appointments become bookings of the one a connection picks. */
  async listCalendars(input: { accessToken: string }): Promise<CalendarListEntry[]> {
    return (await this.listEventTypes(input)).map((eventType) => ({ id: eventType.id, summary: eventType.title, primary: false, accessRole: "owner" }));
  }

  /** The schedule an event type follows, or the account's default when `scheduleId` is null. */
  async getSchedule(input: { accessToken: string; scheduleId: number | null }): Promise<CalcomSchedule | null> {
    const data = await this.request<{ timeZone?: string; availability?: CalcomSchedule["availability"] } | null>(input.accessToken, input.scheduleId === null ? "/v2/schedules/default" : `/v2/schedules/${input.scheduleId}`, { version: API_VERSIONS.schedules, what: "schedule lookup" });
    if (!data?.timeZone || !Array.isArray(data.availability)) return null;
    return { timeZone: data.timeZone, availability: data.availability };
  }

  async getBusyBlocks(input: { accessToken: string; calendarId: string; startsAt: string; endsAt: string }): Promise<CalendarBusyBlock[]> {
    assertCertificationCalendar(input.calendarId);
    // Every booking of the account blocks it, whichever event type it came from.
    const bookings = (await Promise.all(["upcoming", "unconfirmed"].map((status) => this.listBookings(input.accessToken, { status, afterStart: shiftDays(input.startsAt, -1), beforeEnd: shiftDays(input.endsAt, 1) })))).flat();
    const seen = new Set<string>();
    const blocks: CalendarBusyBlock[] = [];
    for (const booking of bookings) {
      if (seen.has(booking.uid) || !BUSY_STATUSES.has(booking.status)) continue;
      seen.add(booking.uid);
      blocks.push(interval(booking.start, booking.end, booking.uid));
    }
    // Cal.com writes its bookings to the calendars it checks, so the same time comes back there without a uid.
    const bookedTimes = new Set(blocks.map((block) => `${block.startsAt}/${block.endsAt}`));
    for (const busy of await this.externalBusyTimes(input)) {
      if (!bookedTimes.has(`${busy.startsAt}/${busy.endsAt}`)) blocks.push(busy);
    }
    return blocks;
  }

  async upsertEvent(input: CalendarEventWrite): Promise<{ externalEventId: string }> {
    assertCertificationCalendar(input.calendarId);
    const eventTypeId = Number(input.calendarId);
    if (!Number.isInteger(eventTypeId) || eventTypeId <= 0) throw new Error("Cal.com event type is invalid.");
    const key = input.appointmentId ?? input.clientEventId;
    if (!key) throw new Error("Cal.com bookings need an appointment id.");
    const email = calcomPlaceholderEmail(key, this.config.placeholderEmailDomain);
    const lengthInMinutes = Math.round((Date.parse(input.endsAt) - Date.parse(input.startsAt)) / 60_000);
    // Cal.com takes a length only from an event type that offers several, and only one of those. Otherwise the
    // booking gets the event type's own length, which then never matches the appointment's end.
    const { lengths } = await this.getEventType(input.accessToken, eventTypeId);
    const pickable = lengths.length > 1 && lengths.includes(lengthInMinutes);
    const length = pickable ? { lengthInMinutes } : {};
    // The stored uid can point at a booking that's gone: canceled in Cal.com, or replaced by a reschedule whose
    // new uid LobbyStack never saved. A booking of another event type belongs to a calendar the connection left.
    const stored = input.eventId ? await this.getBooking(input.accessToken, input.eventId) : null;
    const usable = (item: Booking | null): item is Booking => Boolean(item && BUSY_STATUSES.has(item.status) && (item.eventTypeId === undefined || item.eventTypeId === eventTypeId));
    // Cal.com has no idempotency key. The stand-in address is unique to the appointment, so a booking a failed attempt made is found again.
    const existing = usable(stored) ? stored : await this.findBookingByAttendee(input.accessToken, email, eventTypeId);
    if (existing) {
      // Without a length to send, a reschedule keeps the booking's length, so only the start can be brought in line.
      if (sameInstant(existing.start, input.startsAt) && (!pickable || sameInstant(existing.end, input.endsAt))) return { externalEventId: existing.uid };
      // A reschedule cancels the old booking and returns a new one under a new uid.
      const moved = await this.request<{ uid?: string }>(input.accessToken, `/v2/bookings/${encodeURIComponent(existing.uid)}/reschedule`, { method: "POST", version: API_VERSIONS.bookings, what: "booking reschedule", body: { start: toUtc(input.startsAt), ...length, reschedulingReason: "Rescheduled in LobbyStack" } });
      if (!moved.uid) throw new Error("Cal.com booking reschedule did not return a booking.");
      return { externalEventId: moved.uid };
    }
    const attendee = input.attendee ?? {};
    const name = attendee.name?.trim() || "LobbyStack caller";
    const contact = [name, attendee.phone, attendee.email].filter((value): value is string => Boolean(value?.trim()));
    // The caller's own address never reaches Cal.com, so Cal.com never emails them: LobbyStack confirms the booking.
    const created = await this.request<{ uid?: string }>(input.accessToken, "/v2/bookings", {
      method: "POST", version: API_VERSIONS.bookings, what: "booking write",
      body: {
        eventTypeId,
        start: toUtc(input.startsAt),
        ...length,
        attendee: { name, email, timeZone: input.timezone || "UTC", ...(attendee.phone ? { phoneNumber: attendee.phone } : {}) },
        bookingFieldsResponses: { notes: truncate(`Booked by LobbyStack. ${contact.join(", ")}${input.description ? `. ${input.description}` : ""}`, 500) },
        metadata: {
          lobbystackAppointmentId: truncate(key, 500),
          ...(attendee.name ? { callerName: truncate(attendee.name, 500) } : {}),
          ...(attendee.phone ? { callerPhone: truncate(attendee.phone, 500) } : {}),
          ...(attendee.email ? { callerEmail: truncate(attendee.email, 500) } : {}),
        },
      },
    });
    if (!created.uid) throw new Error("Cal.com booking write did not return a booking.");
    return { externalEventId: created.uid };
  }

  async deleteEvent(input: { accessToken: string; calendarId: string; eventId: string; appointmentId?: string }): Promise<void> {
    assertCertificationCalendar(input.calendarId);
    // The event id is LobbyStack's own placeholder when no booking was stored, so fall back to the stand-in address.
    // A stored uid that's gone, or was rescheduled in Cal.com, leaves the live booking to find by address,
    // among bookings of this connection's event type, the calendar being released.
    const stored = await this.getBooking(input.accessToken, input.eventId);
    const booking = stored && BUSY_STATUSES.has(stored.status) ? stored
      : input.appointmentId ? await this.findBookingByAttendee(input.accessToken, calcomPlaceholderEmail(input.appointmentId, this.config.placeholderEmailDomain), Number(input.calendarId)) : null;
    if (!booking) return;
    try {
      await this.request(input.accessToken, `/v2/bookings/${encodeURIComponent(booking.uid)}/cancel`, { method: "POST", version: API_VERSIONS.bookings, what: "booking cancellation", body: { cancellationReason: "Canceled in LobbyStack" } });
    } catch (error) {
      if (error instanceof CalcomApiError && (error.responseStatus === 404 || error.responseStatus === 410)) return;
      throw error;
    }
  }

  /** Replaces any webhook of the account that already posts to `subscriberUrl`, so a reconnect leaves one behind. */
  async registerWebhook(input: { accessToken: string; subscriberUrl: string; secret: string }): Promise<{ webhookId: string }> {
    const existing = await this.request<Array<{ id?: number; subscriberUrl?: string }>>(input.accessToken, "/v2/webhooks", { query: { take: "250" }, what: "webhook lookup" });
    for (const webhook of Array.isArray(existing) ? existing : []) {
      if (webhook.subscriberUrl === input.subscriberUrl && typeof webhook.id === "number") await this.deleteWebhook({ accessToken: input.accessToken, webhookId: String(webhook.id) });
    }
    const created = await this.request<{ id?: number }>(input.accessToken, "/v2/webhooks", { method: "POST", what: "webhook registration", body: { active: true, subscriberUrl: input.subscriberUrl, triggers: CALCOM_WEBHOOK_TRIGGERS, secret: input.secret } });
    if (typeof created.id !== "number") throw new Error("Cal.com webhook registration did not return a webhook.");
    return { webhookId: String(created.id) };
  }

  async deleteWebhook(input: { accessToken: string; webhookId: string }): Promise<void> {
    try {
      await this.request(input.accessToken, `/v2/webhooks/${encodeURIComponent(input.webhookId)}`, { method: "DELETE", what: "webhook removal" });
    } catch (error) {
      if (error instanceof CalcomApiError && error.responseStatus === 404) return;
      throw error;
    }
  }

  private async token(body: Record<string, string>): Promise<Response> {
    return await fetch(`${this.apiUrl}/v2/auth/oauth2/token`, {
      method: "POST", signal: AbortSignal.timeout(15_000),
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, client_id: this.config.clientId, client_secret: this.config.clientSecret }),
    });
  }

  private async request<T = unknown>(accessToken: string, path: string, options: { method?: "GET" | "POST" | "DELETE"; version?: string; query?: Record<string, string | string[]>; body?: unknown; what: string }): Promise<T> {
    const url = new URL(`${this.apiUrl}${path}`);
    for (const [key, value] of Object.entries(options.query ?? {})) for (const item of Array.isArray(value) ? value : [value]) url.searchParams.append(key, item);
    const response = await fetch(url, {
      method: options.method ?? "GET", signal: AbortSignal.timeout(15_000),
      headers: { authorization: `Bearer ${accessToken}`, ...(options.version ? { "cal-api-version": options.version } : {}), ...(options.body !== undefined ? { "content-type": "application/json" } : {}) },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
    if (!response.ok) throw new CalcomApiError(`Cal.com ${options.what} failed with status ${response.status}.`, response.status);
    const payload = await response.json().catch(() => null) as { status?: string; data?: T; pagination?: unknown } | null;
    if (!payload || payload.status !== "success") throw new Error(`Cal.com ${options.what} returned an invalid response.`);
    return payload.data as T;
  }

  private async getBooking(accessToken: string, uid: string): Promise<Booking | null> {
    try {
      const data = await this.request<Partial<Booking> | Partial<Booking>[]>(accessToken, `/v2/bookings/${encodeURIComponent(uid)}`, { version: API_VERSIONS.bookings, what: "booking lookup" });
      return Array.isArray(data) ? null : booking(data);
    } catch (error) {
      if (error instanceof CalcomApiError && (error.responseStatus === 404 || error.responseStatus === 410)) return null;
      throw error;
    }
  }

  /** The appointment's live booking of `eventTypeId`, found by its stand-in address. */
  private async findBookingByAttendee(accessToken: string, email: string, eventTypeId: number): Promise<Booking | null> {
    for (const status of ["upcoming", "unconfirmed"]) {
      const found = (await this.listBookings(accessToken, { status, attendeeEmail: email, eventTypeId: String(eventTypeId) })).find((item) => BUSY_STATUSES.has(item.status) && (item.eventTypeId === undefined || item.eventTypeId === eventTypeId));
      if (found) return found;
    }
    return null;
  }

  private async listBookings(accessToken: string, filters: Record<string, string>): Promise<Booking[]> {
    const bookings: Booking[] = [];
    const seenCursors = new Set<string>();
    let cursor: string | undefined;
    // An incomplete mirror must fail closed rather than advertising open slots.
    for (let page = 0; page < MAX_PAGES; page++) {
      const url = new URL(`${this.apiUrl}/v2/bookings`);
      for (const [key, value] of Object.entries({ ...filters, limit: String(PAGE_LIMIT), sortStart: "asc", ...(cursor ? { cursor } : {}) })) url.searchParams.set(key, value);
      const response = await fetch(url, { headers: { authorization: `Bearer ${accessToken}`, "cal-api-version": API_VERSIONS.bookingList }, signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new CalcomApiError(`Cal.com booking list failed with status ${response.status}.`, response.status);
      const payload = await response.json().catch(() => null) as { status?: string; data?: Array<Partial<Booking>>; pagination?: { nextCursor?: string | null; hasMore?: boolean } } | null;
      if (!payload || payload.status !== "success" || !Array.isArray(payload.data)) throw new Error("Cal.com bookings could not be verified.");
      for (const item of payload.data) {
        const parsed = booking(item);
        if (!parsed) throw new Error("Cal.com returned an invalid booking.");
        bookings.push(parsed);
      }
      const next = payload.pagination?.hasMore ? payload.pagination.nextCursor : null;
      if (!next) return bookings;
      if (seenCursors.has(next)) throw new Error("Cal.com booking pagination did not advance.");
      seenCursors.add(next);
      cursor = next;
    }
    throw new Error("Cal.com bookings exceeded the page limit.");
  }

  private async externalBusyTimes(input: { accessToken: string; startsAt: string; endsAt: string }): Promise<CalendarBusyBlock[]> {
    const connected = await this.request<{ connectedCalendars?: Array<{ credentialId?: number; calendars?: Array<{ externalId?: string; isSelected?: boolean; credentialId?: number }> }> }>(input.accessToken, "/v2/calendars", { what: "calendar discovery" });
    const calendars = (connected.connectedCalendars ?? []).flatMap((account) => (account.calendars ?? []).flatMap((calendar) => calendar.isSelected && calendar.externalId ? [`${calendar.credentialId ?? account.credentialId},${calendar.externalId}`] : []));
    if (!calendars.length) return [];
    const busy = await this.request<Array<{ start?: string; end?: string }>>(input.accessToken, "/v2/calendars/busy-times", { what: "busy time lookup", query: { timeZone: "UTC", dateFrom: input.startsAt.slice(0, 10), dateTo: input.endsAt.slice(0, 10), calendar: calendars } });
    if (!Array.isArray(busy)) throw new Error("Cal.com busy times could not be verified.");
    return busy.map((item) => {
      if (!item.start || !item.end) throw new Error("Cal.com returned an invalid busy interval.");
      return interval(item.start, item.end);
    });
  }
}

function booking(value: Partial<Booking> | null | undefined): Booking | null {
  return value && typeof value.uid === "string" && typeof value.start === "string" && typeof value.end === "string" && typeof value.status === "string"
    ? { uid: value.uid, start: value.start, end: value.end, status: value.status, ...(typeof value.eventTypeId === "number" ? { eventTypeId: value.eventTypeId } : {}) }
    : null;
}

function interval(start: string, end: string, externalEventId?: string): CalendarBusyBlock {
  const startsAt = Date.parse(start);
  const endsAt = Date.parse(end);
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || endsAt <= startsAt) throw new Error("Cal.com returned an invalid busy interval.");
  return { startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString(), ...(externalEventId ? { externalEventId } : {}) };
}

function sameInstant(left: string, right: string): boolean {
  return Date.parse(left) === Date.parse(right);
}

function toUtc(value: string): string {
  return new Date(value).toISOString().replace(/\.000Z$/, "Z");
}

function shiftDays(value: string, days: number): string {
  return new Date(Date.parse(value) + days * 24 * 60 * 60_000).toISOString();
}

function truncate(value: string, length: number): string {
  return value.length > length ? value.slice(0, length) : value;
}
