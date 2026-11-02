import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { CALENDLY_PLAN_ERROR, assertCertificationCalendar } from "@lobbystack/shared";

import type { CalendarBookingChanges, CalendarBusyBlock, CalendarEventWrite, CalendarListEntry, CalendarProvider } from "../calendar";

/** Every scope the integration uses. They are set on the OAuth app, and the authorization request names them too. */
export const CALENDLY_SCOPES = ["users:read", "organizations:read", "event_types:read", "availability:read", "scheduled_events:read", "scheduled_events:write", "webhooks:read", "webhooks:write"] as const;

/** Calendly sends both when a booking moves, so these two cover every change to busy time. */
export const CALENDLY_WEBHOOK_EVENTS = ["invitee.created", "invitee.canceled"] as const;

/** What LobbyStack writes on a cancellation, which tells its own from one someone made in Calendly. */
const OWN_CANCELLATION_REASON = "Canceled in LobbyStack";

const PAGE_LIMIT = 100;
const MAX_PAGES = 100;
const MAX_MOVES_FOLLOWED = 10;
// Calendly refuses a busy-time range over a week, or one that starts in the past.
const BUSY_RANGE_MS = 7 * 24 * 60 * 60_000 - 60_000;
const BUSY_START_MARGIN_MS = 60_000;
const SIGNATURE_TOLERANCE_MS = 3 * 60_000;
const DEFAULT_RATE_LIMIT_WAIT_MS = 60_000;

export class CalendlyOAuthRefreshError extends Error {
  constructor(readonly reconnectRequired: boolean) {
    super(reconnectRequired ? "Calendly authorization requires reconnection." : "Calendly token refresh is temporarily unavailable.");
    this.name = "CalendlyOAuthRefreshError";
  }
}

/** A failed Calendly request. `responseStatus` matches the field Google's errors carry. */
export class CalendlyApiError extends Error {
  constructor(message: string, readonly responseStatus: number, readonly detail?: string) {
    super(message);
    this.name = "CalendlyApiError";
  }
}

/** Calendly's rate limit. It has no `responseStatus`, so a wait never reads as a rejected grant. */
export class CalendlyRateLimitError extends Error {
  constructor(readonly retryAfterMs: number) {
    super("Calendly's booking limit is reached for now, so this appointment isn't in Calendly yet.");
    this.name = "CalendlyRateLimitError";
  }
}

/** The account's plan can't use the API. It has no `responseStatus`, so reconnecting isn't offered as the fix. */
export class CalendlyPlanError extends Error {
  constructor() {
    super(CALENDLY_PLAN_ERROR);
    this.name = "CalendlyPlanError";
  }
}

export type CalendlyCalendarConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  /** The key Calendly gives an OAuth app, which it may sign deliveries with instead of a webhook's own key. */
  webhookSigningKey: string;
  /** The domain after the @ in the stand-in invitee address. Whether Calendly accepts it is only known from a live booking. */
  placeholderEmailDomain: string;
  apiUrl?: string;
  authUrl?: string;
};

export type CalendlyEventType = {
  id: string;
  title: string;
  lengthInMinutes: number;
  /** Required questions LobbyStack can't answer, which make Calendly refuse every booking. */
  blockingQuestions: string[];
  /** A text question can carry the caller's details, since a booking has no notes. */
  detailsQuestion: boolean;
  /** Every location is a video call, so a caller books a meeting they won't join. */
  videoOnly: boolean;
};

type Question = { name?: string; type?: string; position?: number; enabled?: boolean; required?: boolean };
type LocationConfiguration = { kind?: string; location?: string };
type RawEventType = { uri?: string; name?: string | null; duration?: number; active?: boolean; custom_questions?: Question[]; locations?: LocationConfiguration[] | null; pooling_type?: string | null };
type ScheduledEvent = { uri?: string; status?: string; start_time?: string; end_time?: string; event_type?: string; cancellation?: { reason?: string | null } | null };
type Account = { uri: string; organization: string };

/**
 * What's missing from a Calendly setup the environment started, or null when
 * it's complete or not started at all.
 */
export function calendlyCalendarConfigProblem(env: Record<string, string | undefined> = process.env): string | null {
  const names = ["CALENDLY_CLIENT_ID", "CALENDLY_CLIENT_SECRET", "CALENDLY_REDIRECT_URI", "CALENDLY_WEBHOOK_SIGNING_KEY", "CALENDLY_PLACEHOLDER_EMAIL_DOMAIN"] as const;
  const missing = names.filter((name) => !env[name]?.trim());
  if (missing.length === 0 || missing.length === names.length) return null;
  return `Calendly is off until ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} set.`;
}

/** The Calendly settings from the environment, or null until all five CALENDLY_ variables are set. */
export function calendlyCalendarConfigFromEnv(env: Record<string, string | undefined> = process.env): CalendlyCalendarConfig | null {
  const clientId = env.CALENDLY_CLIENT_ID?.trim();
  const clientSecret = env.CALENDLY_CLIENT_SECRET?.trim();
  const redirectUri = env.CALENDLY_REDIRECT_URI?.trim();
  const webhookSigningKey = env.CALENDLY_WEBHOOK_SIGNING_KEY?.trim();
  const placeholderEmailDomain = env.CALENDLY_PLACEHOLDER_EMAIL_DOMAIN?.trim();
  if (!clientId || !clientSecret || !redirectUri || !webhookSigningKey || !placeholderEmailDomain) return null;
  return { clientId, clientSecret, redirectUri, webhookSigningKey, placeholderEmailDomain, ...(env.CALENDLY_API_URL ? { apiUrl: env.CALENDLY_API_URL } : {}), ...(env.CALENDLY_AUTH_URL ? { authUrl: env.CALENDLY_AUTH_URL } : {}) };
}

/** The stand-in invitee address for an appointment: unique, so it also finds a booking a retry already made. */
export function calendlyPlaceholderEmail(appointmentId: string, domain: string): string {
  return `booking+${appointmentId.toLowerCase().replace(/[^a-z0-9-]/g, "")}@${domain}`;
}

/** The PKCE challenge Calendly requires for a code verifier. */
export function calendlyCodeChallenge(codeVerifier: string): string {
  return createHash("sha256").update(codeVerifier).digest("base64url");
}

/**
 * Whether `header`, Calendly's `t=<unix>,v1=<hex>`, is an HMAC-SHA256 of
 * `<t>.<raw body>` under one of `keys`, signed within the last three minutes.
 */
export function verifyCalendlyWebhookSignature(rawBody: string, header: string | null, keys: string[], now = Date.now()): boolean {
  if (!header) return false;
  const parts = new Map(header.split(",").map((part) => { const [key, ...value] = part.trim().split("="); return [key, value.join("=")] as const; }));
  const timestamp = parts.get("t");
  const given = parts.get("v1");
  if (!timestamp || !/^\d+$/.test(timestamp) || !given || !/^[a-f0-9]{64}$/i.test(given)) return false;
  if (Math.abs(now - Number(timestamp) * 1000) > SIGNATURE_TOLERANCE_MS) return false;
  return keys.filter(Boolean).some((key) => timingSafeEqual(Buffer.from(given.toLowerCase()), Buffer.from(createHmac("sha256", key).update(`${timestamp}.${rawBody}`).digest("hex"))));
}

export class CalendlyCalendarProvider implements CalendarProvider {
  private readonly apiUrl: string;
  private readonly authUrl: string;

  constructor(private readonly config: CalendlyCalendarConfig) {
    this.apiUrl = (config.apiUrl ?? "https://api.calendly.com").replace(/\/$/, "");
    this.authUrl = (config.authUrl ?? "https://auth.calendly.com").replace(/\/$/, "");
  }

  buildAuthorizationUrl(input: { state: string; codeChallenge: string }): string {
    const url = new URL(`${this.authUrl}/oauth/authorize`);
    url.searchParams.set("client_id", this.config.clientId);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", this.config.redirectUri);
    url.searchParams.set("state", input.state);
    url.searchParams.set("scope", CALENDLY_SCOPES.join(" "));
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("code_challenge", input.codeChallenge);
    return url.toString();
  }

  async exchangeCode(code: string, codeVerifier: string): Promise<{ accessToken: string; refreshToken?: string; expiresIn: number }> {
    const response = await this.token({ grant_type: "authorization_code", code, redirect_uri: this.config.redirectUri, code_verifier: codeVerifier });
    if (!response.ok) throw new Error(`Calendly OAuth token exchange failed with status ${response.status}.`);
    const payload = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number };
    if (!payload.access_token || typeof payload.expires_in !== "number" || !Number.isFinite(payload.expires_in) || payload.expires_in <= 0) throw new Error("Calendly OAuth returned an invalid token response.");
    return { accessToken: payload.access_token, ...(payload.refresh_token ? { refreshToken: payload.refresh_token } : {}), expiresIn: payload.expires_in };
  }

  async refreshAccessToken(input: { refreshToken: string }): Promise<{ accessToken: string; expiresIn: number; refreshToken?: string }> {
    const response = await this.token({ grant_type: "refresh_token", refresh_token: input.refreshToken });
    const payload = await response.json().catch(() => ({})) as { access_token?: string; expires_in?: number; refresh_token?: string; error?: string };
    if (!response.ok) throw new CalendlyOAuthRefreshError(payload.error === "invalid_grant" || payload.error === "invalid_client" || response.status === 401);
    if (!payload.access_token || typeof payload.expires_in !== "number" || !Number.isFinite(payload.expires_in) || payload.expires_in <= 0) throw new CalendlyOAuthRefreshError(false);
    return { accessToken: payload.access_token, expiresIn: payload.expires_in, ...(payload.refresh_token ? { refreshToken: payload.refresh_token } : {}) };
  }

  /** The connected user, and whether their organization's plan can book through the API. */
  async getAccount(input: { accessToken: string }): Promise<{ id: string; email?: string; timeZone?: string; paidPlan: boolean }> {
    const account = await this.account(input.accessToken);
    const me = await this.resource<{ email?: string; timezone?: string }>(input.accessToken, "/users/me", { what: "account lookup" });
    const organization = await this.resource<{ plan?: string; stage?: string }>(input.accessToken, `/organizations/${uuidOf(account.organization)}`, { what: "plan lookup" });
    return { id: uuidOf(account.uri), ...(me.email ? { email: me.email } : {}), ...(me.timezone ? { timeZone: me.timezone } : {}), paidPlan: organization.stage !== "free" && organization.plan !== "basic" };
  }

  async listEventTypes(input: { accessToken: string }): Promise<CalendlyEventType[]> {
    const account = await this.account(input.accessToken);
    const rows = await this.collection<RawEventType>(input.accessToken, "/event_types", { user: account.uri, active: "true" }, "event type discovery");
    return rows.flatMap((row) => row.uri && row.name && typeof row.duration === "number" ? [{
      id: uuidOf(row.uri),
      title: row.name,
      lengthInMinutes: row.duration,
      blockingQuestions: blockingQuestions(row),
      detailsQuestion: enabledQuestions(row).some(isTextQuestion),
      videoOnly: Boolean(row.locations?.length) && row.locations!.every((location) => location.kind?.endsWith("_conference")),
    }] : []);
  }

  /**
   * Event types stand in for calendars. On a Free plan none can be booked, and one with a question LobbyStack can't
   * answer can't either, so those read as read-only. Picking one would stop the business's bookings at the first sync.
   */
  async listCalendars(input: { accessToken: string }): Promise<CalendarListEntry[]> {
    const [eventTypes, paidPlan] = await Promise.all([this.listEventTypes(input), this.getAccount(input).then((account) => account.paidPlan, () => null)]);
    return eventTypes.map((eventType) => {
      const reason = paidPlan === false ? CALENDLY_PLAN_ERROR : eventType.blockingQuestions.length ? `This event type requires an answer to ${eventType.blockingQuestions.join(", ")}, which LobbyStack can't give.` : null;
      return { id: eventType.id, summary: eventType.title, primary: false, accessRole: reason ? "reader" : "owner", ...(reason ? { unwritableReason: reason } : {}) };
    });
  }

  /** Calendly's own events and the calendars it checks for conflicts, a week of them per request. */
  async getBusyBlocks(input: { accessToken: string; calendarId: string; startsAt: string; endsAt: string }): Promise<CalendarBusyBlock[]> {
    assertCertificationCalendar(input.calendarId);
    const account = await this.account(input.accessToken);
    const end = Date.parse(input.endsAt);
    const internal = new Map<string, CalendarBusyBlock>();
    const bookedTimes = new Set<string>();
    const external = new Map<string, CalendarBusyBlock>();
    for (let from = Math.max(Date.parse(input.startsAt), Date.now() + BUSY_START_MARGIN_MS); from < end; from += BUSY_RANGE_MS) {
      const to = Math.min(from + BUSY_RANGE_MS, end);
      const data = await this.request<{ collection?: Array<{ type?: string; start_time?: string; end_time?: string; buffered_start_time?: string; buffered_end_time?: string; event?: { uri?: string } }> }>(input.accessToken, "/user_busy_times", { what: "busy time lookup", query: { user: account.uri, start_time: toUtc(new Date(from)), end_time: toUtc(new Date(to)) } });
      if (!Array.isArray(data.collection)) throw new Error("Calendly busy times could not be verified.");
      for (const item of data.collection) {
        if (!item.start_time || !item.end_time) throw new Error("Calendly returned an invalid busy interval.");
        const own = interval(item.start_time, item.end_time);
        if (item.type === "external") {
          external.set(`${own.startsAt}/${own.endsAt}`, own);
          continue;
        }
        bookedTimes.add(`${own.startsAt}/${own.endsAt}`);
        // A buffer holds the time as firmly as the event: Calendly refuses bookings inside it.
        const block = interval(item.buffered_start_time ?? item.start_time, item.buffered_end_time ?? item.end_time, item.event?.uri ? uuidOf(item.event.uri) : undefined);
        internal.set(`${block.externalEventId ?? ""}/${block.startsAt}/${block.endsAt}`, block);
      }
    }
    // Calendly writes its events to the calendars it checks, so the same time comes back there as external.
    return [...internal.values(), ...[...external].filter(([key]) => !bookedTimes.has(key)).map(([, block]) => block)];
  }

  /**
   * What people changed in Calendly itself. A move cancels the event and makes a
   * new one, possibly more than once: each canceled invitee names its successor.
   * A move whose new event was then canceled counts as a cancellation of the
   * event the appointment still holds. Cancellations LobbyStack made, which move
   * an appointment too, are skipped.
   */
  async getBookingChanges(input: { accessToken: string; calendarId?: string; startsAt: string; endsAt: string }): Promise<CalendarBookingChanges> {
    const account = await this.account(input.accessToken);
    const gone = await this.collection<ScheduledEvent>(input.accessToken, "/scheduled_events", { user: account.uri, status: "canceled", min_start_time: toUtc(new Date(input.startsAt)), max_start_time: toUtc(new Date(input.endsAt)), sort: "start_time:asc" }, "event list");
    const changes: CalendarBookingChanges = { cancelled: [], moved: [] };
    for (const event of gone) {
      if (!event.uri || event.cancellation?.reason === OWN_CANCELLATION_REASON) continue;
      if (input.calendarId && event.event_type && uuidOf(event.event_type) !== input.calendarId) continue;
      const eventId = uuidOf(event.uri);
      const successor = await this.lastSuccessor(input.accessToken, eventId);
      if (successor === null) changes.cancelled.push(eventId);
      else if (successor) {
        const { startsAt, endsAt } = interval(successor.start_time!, successor.end_time!);
        changes.moved.push({ eventId, toEventId: uuidOf(successor.uri!), startsAt, endsAt });
      }
    }
    return changes;
  }

  async upsertEvent(input: CalendarEventWrite): Promise<{ externalEventId: string }> {
    assertCertificationCalendar(input.calendarId);
    const key = input.appointmentId ?? input.clientEventId;
    if (!key) throw new Error("Calendly bookings need an appointment id.");
    const email = calendlyPlaceholderEmail(key, this.config.placeholderEmailDomain);
    const eventType = await this.getEventType(input.accessToken, input.calendarId);
    const blocked = blockingQuestions(eventType);
    if (blocked.length) throw new Error(`Calendly can't take this booking: the event type requires an answer to ${blocked.join(", ")}.`);
    // The stored event can be gone, or on an event type the connection left. Then the stand-in address finds what's live.
    const usable = (item: ScheduledEvent | null): item is ScheduledEvent => Boolean(item && item.status === "active" && item.event_type && uuidOf(item.event_type) === input.calendarId);
    const stored = input.eventId ? await this.getEvent(input.accessToken, input.eventId) : null;
    if (usable(stored) && sameInstant(stored.start_time!, input.startsAt)) return { externalEventId: uuidOf(stored.uri!) };
    const found = await this.findEventsByInvitee(input.accessToken, email, input.calendarId);
    const live = usable(stored) && !found.some((item) => item.uri === stored.uri) ? [stored, ...found] : found;
    const current = live.find((item) => sameInstant(item.start_time!, input.startsAt));
    // A move that booked the new time but failed to cancel the old one left both. The retry finishes the cancel.
    if (current) {
      for (const item of live) if (item !== current) await this.cancel(input.accessToken, uuidOf(item.uri!));
      return { externalEventId: uuidOf(current.uri!) };
    }
    // Calendly has no reschedule call. Booking first keeps the old time until the new one is held. Times that overlap
    // can't both be booked, so the old one goes first, and a refused booking then fails where the operator sees it.
    const overlapping = live.filter((item) => overlaps(item, input.startsAt));
    for (const item of overlapping) await this.cancel(input.accessToken, uuidOf(item.uri!));
    const created = await this.book(input, eventType, email);
    for (const item of live) if (!overlapping.includes(item)) await this.cancel(input.accessToken, uuidOf(item.uri!));
    return { externalEventId: created };
  }

  async deleteEvent(input: { accessToken: string; calendarId: string; eventId: string; appointmentId?: string; keepEventId?: string }): Promise<void> {
    assertCertificationCalendar(input.calendarId);
    // The event id is LobbyStack's own placeholder when no booking was stored. A move that failed before saving its
    // new event leaves that one holding a slot too, so the stand-in address finds whatever else the appointment holds.
    const stored = await this.getEvent(input.accessToken, input.eventId);
    const found = input.appointmentId ? await this.findEventsByInvitee(input.accessToken, calendlyPlaceholderEmail(input.appointmentId, this.config.placeholderEmailDomain), input.calendarId) : [];
    const events = new Map([...(stored?.status === "active" ? [stored] : []), ...found].map((event) => [uuidOf(event.uri!), event]));
    if (input.keepEventId) events.delete(input.keepEventId);
    for (const eventId of events.keys()) await this.cancel(input.accessToken, eventId);
  }

  /** Replaces any subscription of the user that already posts to `subscriberUrl`, so a reconnect leaves one behind. */
  async registerWebhook(input: { accessToken: string; subscriberUrl: string; secret: string }): Promise<{ webhookId: string }> {
    const account = await this.account(input.accessToken);
    const existing = await this.collection<{ uri?: string; callback_url?: string }>(input.accessToken, "/webhook_subscriptions", { organization: account.organization, user: account.uri, scope: "user" }, "webhook lookup");
    for (const webhook of existing) {
      if (webhook.callback_url === input.subscriberUrl && webhook.uri) await this.deleteWebhook({ accessToken: input.accessToken, webhookId: uuidOf(webhook.uri) });
    }
    const created = await this.resource<{ uri?: string }>(input.accessToken, "/webhook_subscriptions", { method: "POST", what: "webhook registration", body: { url: input.subscriberUrl, events: CALENDLY_WEBHOOK_EVENTS, organization: account.organization, user: account.uri, scope: "user", signing_key: input.secret } });
    if (!created.uri) throw new Error("Calendly webhook registration did not return a webhook.");
    return { webhookId: uuidOf(created.uri) };
  }

  async deleteWebhook(input: { accessToken: string; webhookId: string }): Promise<void> {
    try {
      await this.request(input.accessToken, `/webhook_subscriptions/${encodeURIComponent(input.webhookId)}`, { method: "DELETE", what: "webhook removal" });
    } catch (error) {
      if (error instanceof CalendlyApiError && error.responseStatus === 404) return;
      throw error;
    }
  }

  private async book(input: CalendarEventWrite, eventType: RawEventType, email: string): Promise<string> {
    const attendee = input.attendee ?? {};
    const name = attendee.name?.trim() || "LobbyStack caller";
    const contact = [name, attendee.phone, attendee.email].filter((value): value is string => Boolean(value?.trim()));
    const details = truncate(`Booked by LobbyStack. ${contact.join(", ")}${input.description ? `. ${input.description}` : ""}`, 500);
    const location = bookingLocation(eventType, attendee.phone);
    const questions = questionAnswers(eventType, details, attendee.phone);
    try {
      // The caller's own address never reaches Calendly, so Calendly never emails them: LobbyStack confirms the booking.
      const created = await this.resource<{ event?: string }>(input.accessToken, "/invitees", {
        method: "POST", what: "booking write",
        body: { event_type: eventType.uri, start_time: toUtc(new Date(input.startsAt)), invitee: { name, email, timezone: input.timezone || "UTC" }, ...(location ? { location } : {}), ...(questions.length ? { questions_and_answers: questions } : {}) },
      });
      if (!created.event) throw new Error("Calendly booking write did not return an event.");
      return uuidOf(created.event);
    } catch (error) {
      if (error instanceof CalendlyApiError && error.responseStatus === 400 && error.detail) throw new CalendlyApiError(/email/i.test(error.detail) ? "Calendly refused the stand-in email address, so this appointment isn't in Calendly." : `Calendly refused the booking: ${truncate(error.detail, 200)}`, error.responseStatus);
      throw error;
    }
  }

  private async cancel(accessToken: string, eventId: string): Promise<void> {
    try {
      await this.request(accessToken, `/scheduled_events/${encodeURIComponent(eventId)}/cancellation`, { method: "POST", what: "booking cancellation", body: { reason: OWN_CANCELLATION_REASON } });
    } catch (error) {
      if (error instanceof CalendlyApiError && (error.responseStatus === 404 || error.responseStatus === 410)) return;
      throw error;
    }
  }

  // The active event a canceled one moved to; null when it never moved, or its last move was canceled too, so nothing is
  // left of the booking. Undefined when that can't be told: LobbyStack canceled the last event while it moved the
  // appointment, which is the new booking's business, or the moves ran past the limit.
  private async lastSuccessor(accessToken: string, eventId: string): Promise<ScheduledEvent | null | undefined> {
    let last = eventId;
    for (let step = 0; step < MAX_MOVES_FOLLOWED; step++) {
      const invitees = await this.collection<{ new_invitee?: string | null }>(accessToken, `/scheduled_events/${encodeURIComponent(last)}/invitees`, {}, "invitee list");
      const next = invitees.find((invitee) => invitee.new_invitee)?.new_invitee;
      if (!next) return null;
      // An invitee's uri is /scheduled_events/{event}/invitees/{invitee}.
      const nextId = /\/scheduled_events\/([^/]+)\/invitees\//.exec(next)?.[1];
      if (!nextId) throw new Error("Calendly returned an invalid invitee.");
      const event = await this.getEvent(accessToken, nextId);
      if (event?.status === "active" && event.uri && event.start_time && event.end_time) return event;
      if (event?.cancellation?.reason === OWN_CANCELLATION_REASON) return undefined;
      last = nextId;
    }
    return undefined;
  }

  private async getEventType(accessToken: string, id: string): Promise<RawEventType> {
    const eventType = await this.resource<RawEventType>(accessToken, `/event_types/${encodeURIComponent(id)}`, { what: "event type lookup" });
    if (!eventType.uri) throw new Error("Calendly event type lookup returned an invalid response.");
    return eventType;
  }

  private async getEvent(accessToken: string, id: string): Promise<ScheduledEvent | null> {
    try {
      const event = await this.resource<ScheduledEvent>(accessToken, `/scheduled_events/${encodeURIComponent(id)}`, { what: "booking lookup" });
      return event.uri && event.status && event.start_time && event.end_time ? event : null;
    } catch (error) {
      // LobbyStack's own placeholder id isn't a Calendly uuid, and may come back as a 400 rather than a 404.
      if (error instanceof CalendlyApiError && (error.responseStatus === 400 || error.responseStatus === 404 || error.responseStatus === 410)) return null;
      throw error;
    }
  }

  /** The appointment's live events of the event type, found by the stand-in address. */
  private async findEventsByInvitee(accessToken: string, email: string, eventTypeId: string): Promise<ScheduledEvent[]> {
    const account = await this.account(accessToken);
    const events = await this.collection<ScheduledEvent>(accessToken, "/scheduled_events", { user: account.uri, invitee_email: email, status: "active", min_start_time: toUtc(new Date(Date.now() - 24 * 60 * 60_000)), sort: "start_time:asc" }, "event list");
    return events.filter((event) => event.uri && event.start_time && event.end_time && event.event_type && uuidOf(event.event_type) === eventTypeId);
  }

  private async account(accessToken: string): Promise<Account> {
    const me = await this.resource<{ uri?: string; current_organization?: string }>(accessToken, "/users/me", { what: "account lookup" });
    if (!me.uri || !me.current_organization) throw new Error("Calendly account lookup did not return an account.");
    return { uri: me.uri, organization: me.current_organization };
  }

  private async token(body: Record<string, string>): Promise<Response> {
    return await fetch(`${this.authUrl}/oauth/token`, {
      method: "POST", signal: AbortSignal.timeout(15_000),
      headers: { "content-type": "application/x-www-form-urlencoded", authorization: `Basic ${Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString("base64")}` },
      body: new URLSearchParams({ ...body, client_id: this.config.clientId }),
    });
  }

  private async request<T = unknown>(accessToken: string, path: string, options: { method?: "GET" | "POST" | "DELETE"; query?: Record<string, string>; body?: unknown; what: string }): Promise<T> {
    const url = new URL(`${this.apiUrl}${path}`);
    for (const [key, value] of Object.entries(options.query ?? {})) url.searchParams.set(key, value);
    const response = await fetch(url, {
      method: options.method ?? "GET", signal: AbortSignal.timeout(15_000),
      headers: { authorization: `Bearer ${accessToken}`, ...(options.body !== undefined ? { "content-type": "application/json" } : {}) },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
    if (response.status === 429) {
      const seconds = Number(response.headers.get("x-ratelimit-reset"));
      throw new CalendlyRateLimitError(Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : DEFAULT_RATE_LIMIT_WAIT_MS);
    }
    if (!response.ok) {
      const failure = await response.json().catch(() => null) as { message?: string; details?: Array<{ parameter?: string; message?: string }> } | null;
      const detail = [failure?.message, ...(failure?.details ?? []).map((item) => [item.parameter, item.message].filter(Boolean).join(": "))].filter(Boolean).join("; ");
      if (response.status === 403 && /paid|upgrade/i.test(detail)) throw new CalendlyPlanError();
      throw new CalendlyApiError(`Calendly ${options.what} failed with status ${response.status}.`, response.status, detail);
    }
    if (response.status === 204) return undefined as T;
    const payload = await response.json().catch(() => null) as T | null;
    if (payload === null) throw new Error(`Calendly ${options.what} returned an invalid response.`);
    return payload;
  }

  private async resource<T>(accessToken: string, path: string, options: { method?: "GET" | "POST"; body?: unknown; what: string }): Promise<T> {
    const data = await this.request<{ resource?: T }>(accessToken, path, options);
    if (!data.resource) throw new Error(`Calendly ${options.what} returned an invalid response.`);
    return data.resource;
  }

  private async collection<T>(accessToken: string, path: string, query: Record<string, string>, what: string): Promise<T[]> {
    const rows: T[] = [];
    const seenTokens = new Set<string>();
    let token: string | undefined;
    // An incomplete mirror must fail closed rather than advertising open slots.
    for (let page = 0; page < MAX_PAGES; page++) {
      const data = await this.request<{ collection?: T[]; pagination?: { next_page_token?: string | null } }>(accessToken, path, { what, query: { ...query, count: String(PAGE_LIMIT), ...(token ? { page_token: token } : {}) } });
      if (!Array.isArray(data.collection)) throw new Error(`Calendly ${what} returned an invalid response.`);
      rows.push(...data.collection);
      const next = data.pagination?.next_page_token;
      if (!next) return rows;
      if (seenTokens.has(next)) throw new Error(`Calendly ${what} pagination did not advance.`);
      seenTokens.add(next);
      token = next;
    }
    throw new Error(`Calendly ${what} exceeded the page limit.`);
  }
}

function enabledQuestions(eventType: RawEventType): Question[] {
  return (eventType.custom_questions ?? []).filter((question) => question.enabled !== false);
}

function isTextQuestion(question: Question): boolean {
  return question.type === "string" || question.type === "text";
}

// A required text question takes the caller's details and a phone one their number, but a choice has no answer LobbyStack could pick.
function blockingQuestions(eventType: RawEventType): string[] {
  return enabledQuestions(eventType).filter((question) => question.required && !isTextQuestion(question) && question.type !== "phone_number").map((question) => question.name ?? "");
}

// The first text question carries the details whether required or not, since a booking has no notes field.
function questionAnswers(eventType: RawEventType, details: string, phone: string | null | undefined): Array<{ question: string; answer: string; position: number }> {
  const questions = enabledQuestions(eventType);
  const first = questions.find(isTextQuestion);
  return questions.flatMap((question) => {
    const answer = isTextQuestion(question) && (question === first || question.required) ? details : question.type === "phone_number" && phone ? phone : null;
    return answer && question.name ? [{ question: question.name, answer, position: question.position ?? 0 }] : [];
  });
}

// Calendly wants the event type's own location back. A round robin event type refuses one, and one without a location takes none.
function bookingLocation(eventType: RawEventType, phone: string | null | undefined): { kind: string; location?: string } | null {
  const locations = eventType.locations ?? [];
  if (eventType.pooling_type === "round_robin" || !locations.length) return null;
  if (phone && locations.some((location) => location.kind === "outbound_call")) return { kind: "outbound_call", location: phone };
  const chosen = locations.find((location) => location.kind !== "outbound_call" && location.kind !== "ask_invitee") ?? locations[0]!;
  if (!chosen.kind) return null;
  if (chosen.kind === "ask_invitee" || chosen.kind === "outbound_call") return { kind: chosen.kind, location: phone || "By phone" };
  return { kind: chosen.kind, ...(chosen.location ? { location: chosen.location } : {}) };
}

function overlaps(event: ScheduledEvent, startsAt: string): boolean {
  const eventStart = Date.parse(event.start_time!);
  const eventEnd = Date.parse(event.end_time!);
  const start = Date.parse(startsAt);
  // The new booking takes the event type's length, the same as the event it replaces.
  return start < eventEnd && start + (eventEnd - eventStart) > eventStart;
}

/** The uuid at the end of a Calendly uri, which is how connections and appointments store them. */
function uuidOf(uri: string): string {
  return uri.replace(/\/$/, "").split("/").pop() ?? uri;
}

function interval(start: string, end: string, externalEventId?: string): CalendarBusyBlock {
  const startsAt = Date.parse(start);
  const endsAt = Date.parse(end);
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || endsAt <= startsAt) throw new Error("Calendly returned an invalid busy interval.");
  return { startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString(), ...(externalEventId ? { externalEventId } : {}) };
}

function sameInstant(left: string, right: string): boolean {
  return Date.parse(left) === Date.parse(right);
}

function toUtc(value: Date): string {
  return value.toISOString().replace(/\.000Z$/, "Z");
}

function truncate(value: string, length: number): string {
  return value.length > length ? value.slice(0, length) : value;
}
