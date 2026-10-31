import { createHmac } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { CALCOM_SCOPES, CalcomCalendarProvider, calcomCalendarConfigFromEnv, calcomCalendarConfigProblem, calcomPlaceholderEmail, verifyCalcomWebhookSignature } from "./calendar";

afterEach(() => vi.unstubAllGlobals());

const config = { clientId: "client", clientSecret: "secret", redirectUri: "https://app.example/api/calendar/calcom/callback", placeholderEmailDomain: "noreply.app.example" };
const ok = (data: unknown, extra: Record<string, unknown> = {}) => Response.json({ status: "success", data, ...extra });
const booking = (uid: string, start: string, end: string, status = "accepted") => ({ uid, start, end, status });

type Route = (url: URL, init: RequestInit) => Response | undefined;
// Haircut offers 30, 45 and 60 minutes, so the 45-minute appointment can pick its length.
const eventTypeRoute = (lengths: number[] = [30, 45, 60]): Route => (url, init) => (init.method ?? "GET") === "GET" && url.pathname === "/v2/event-types/42" ? ok({ id: 42, lengthInMinutes: lengths[0], ...(lengths.length > 1 ? { lengthInMinutesOptions: lengths } : {}) }) : undefined;
function routes(...handlers: Route[]) {
  const calls: Array<{ url: URL; init: RequestInit }> = [];
  const fetchMock = vi.fn(async (input: string | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    for (const handler of [...handlers, eventTypeRoute()]) {
      const response = handler(url, init);
      if (response) return response;
    }
    throw new Error(`Unexpected request ${init.method ?? "GET"} ${url.pathname}${url.search}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}
const on = (method: string, path: string | RegExp, respond: (url: URL, init: RequestInit) => Response): Route => (url, init) => (init.method ?? "GET") === method && (typeof path === "string" ? url.pathname === path : path.test(url.pathname)) ? respond(url, init) : undefined;
const body = (init: RequestInit) => JSON.parse(String(init.body)) as Record<string, unknown>;
const write = { accessToken: "access", calendarId: "42", appointmentId: "6f1c3a52-9b3d-4f6e-8a51-2c0e7d9b1a44", title: "Haircut", startsAt: "2026-11-02T15:00:00.000Z", endsAt: "2026-11-02T15:45:00.000Z", timezone: "America/Toronto", attendee: { name: "Jo Tremblay", phone: "+14165550123", email: "jo@example.com" } };

describe("CalcomCalendarProvider", () => {
  it("asks for every scope the integration uses, so adding one later never triggers a new review", () => {
    const url = new URL(new CalcomCalendarProvider(config).buildAuthorizationUrl({ state: "fixture" }));
    expect(url.origin + url.pathname).toBe("https://app.cal.com/auth/oauth2/authorize");
    expect(url.searchParams.get("scope")!.split(" ")).toEqual([...CALCOM_SCOPES]);
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ client_id: "client", redirect_uri: config.redirectUri, state: "fixture" });
  });

  it("exchanges and refreshes tokens as a confidential client, and asks for reconnection on invalid_grant", async () => {
    const calls = routes(on("POST", "/v2/auth/oauth2/token", (_url, init) => body(init).grant_type === "authorization_code"
      ? Response.json({ access_token: "access", refresh_token: "refresh", expires_in: 1800, token_type: "bearer", scope: "BOOKING_READ" })
      : body(init).refresh_token === "dead" ? Response.json({ error: "invalid_grant", error_description: "invalid_refresh_token" }, { status: 400 }) : Response.json({ access_token: "next", refresh_token: "rotated", expires_in: 1800 })));
    const provider = new CalcomCalendarProvider(config);
    await expect(provider.exchangeCode("code")).resolves.toEqual({ accessToken: "access", refreshToken: "refresh", expiresIn: 1800 });
    expect(body(calls[0]!.init)).toEqual({ grant_type: "authorization_code", code: "code", redirect_uri: config.redirectUri, client_id: "client", client_secret: "secret" });
    await expect(provider.refreshAccessToken({ refreshToken: "live" })).resolves.toEqual({ accessToken: "next", refreshToken: "rotated", expiresIn: 1800 });
    await expect(provider.refreshAccessToken({ refreshToken: "dead" })).rejects.toMatchObject({ reconnectRequired: true, message: "Cal.com authorization requires reconnection." });
  });

  it("lists event types as calendars, with the lengths a booking may pick and whether an SMS workflow is attached", async () => {
    const calls = routes(on("GET", "/v2/event-types", () => ok([
      { id: 42, title: "Haircut", lengthInMinutes: 30, lengthInMinutesOptions: [30, 45, 60], scheduleId: 7, bookingFields: [{ slug: "email" }, { slug: "smsReminderNumber" }] },
      { id: 43, title: "Consultation", lengthInMinutes: 15, scheduleId: null, bookingFields: [] },
    ])));
    const provider = new CalcomCalendarProvider(config);
    await expect(provider.listEventTypes({ accessToken: "access" })).resolves.toEqual([
      { id: "42", title: "Haircut", lengthInMinutes: 30, lengths: [30, 45, 60], scheduleId: 7, smsReminders: true },
      { id: "43", title: "Consultation", lengthInMinutes: 15, lengths: [15], scheduleId: null, smsReminders: false },
    ]);
    await expect(provider.listCalendars({ accessToken: "access" })).resolves.toEqual([
      { id: "42", summary: "Haircut", primary: false, accessRole: "owner" },
      { id: "43", summary: "Consultation", primary: false, accessRole: "owner" },
    ]);
    expect(new Headers(calls[0]!.init.headers).get("cal-api-version")).toBe("2026-06-12");
    expect(new Headers(calls[0]!.init.headers).get("authorization")).toBe("Bearer access");
  });

  it("books under a stand-in address and keeps the caller's details in the notes and metadata", async () => {
    const calls = routes(
      on("GET", "/v2/bookings", () => ok([], { pagination: { hasMore: false, nextCursor: null } })),
      on("POST", "/v2/bookings", () => ok({ id: 1, uid: "booking-uid", status: "accepted" }, {})),
    );
    await expect(new CalcomCalendarProvider(config).upsertEvent(write)).resolves.toEqual({ externalEventId: "booking-uid" });
    const create = calls.find((call) => call.init.method === "POST")!;
    expect(new Headers(create.init.headers).get("cal-api-version")).toBe("2026-02-25");
    const sent = body(create.init);
    expect(sent).toMatchObject({
      eventTypeId: 42, start: "2026-11-02T15:00:00Z", lengthInMinutes: 45,
      attendee: { name: "Jo Tremblay", email: "booking+6f1c3a52-9b3d-4f6e-8a51-2c0e7d9b1a44@noreply.app.example", timeZone: "America/Toronto", phoneNumber: "+14165550123" },
      metadata: { lobbystackAppointmentId: write.appointmentId, callerName: "Jo Tremblay", callerPhone: "+14165550123", callerEmail: "jo@example.com" },
    });
    expect(JSON.stringify(sent.attendee)).not.toContain("jo@example.com");
    expect((sent.bookingFieldsResponses as { notes: string }).notes).toContain("jo@example.com");
    // A retry looks for the booking a failed attempt made before booking again.
    const lookup = calls.find((call) => call.init.method === undefined && call.url.pathname === "/v2/bookings")!;
    expect(lookup.url.searchParams.get("attendeeEmail")).toBe(calcomPlaceholderEmail(write.appointmentId, config.placeholderEmailDomain));
  });

  it("reuses the booking a failed attempt already made instead of booking twice", async () => {
    const calls = routes(on("GET", "/v2/bookings", (url) => ok(url.searchParams.get("status") === "upcoming" ? [booking("earlier", write.startsAt, write.endsAt)] : [], { pagination: { hasMore: false, nextCursor: null } })));
    await expect(new CalcomCalendarProvider(config).upsertEvent(write)).resolves.toEqual({ externalEventId: "earlier" });
    expect(calls.some((call) => call.init.method === "POST")).toBe(false);
  });

  it("leaves an unchanged booking alone and reschedules a moved one under its new uid", async () => {
    let start = write.startsAt;
    const calls = routes(
      on("GET", "/v2/bookings/stored", () => ok(booking("stored", start, write.endsAt))),
      on("POST", "/v2/bookings/stored/reschedule", () => ok({ uid: "moved" })),
    );
    const provider = new CalcomCalendarProvider(config);
    await expect(provider.upsertEvent({ ...write, eventId: "stored" })).resolves.toEqual({ externalEventId: "stored" });
    expect(calls.filter((call) => call.init.method === "POST")).toHaveLength(0);
    start = "2026-11-02T14:00:00.000Z";
    await expect(provider.upsertEvent({ ...write, eventId: "stored" })).resolves.toEqual({ externalEventId: "moved" });
    expect(body(calls.at(-1)!.init)).toMatchObject({ start: "2026-11-02T15:00:00Z", lengthInMinutes: 45 });
  });

  it("after a switch to another event type, books it instead of adopting the old event type's booking", async () => {
    const calls = routes(
      on("GET", "/v2/bookings", (url) => ok(url.searchParams.get("status") === "upcoming" ? [{ ...booking("on-41", write.startsAt, write.endsAt), eventTypeId: 41 }] : [], { pagination: { hasMore: false, nextCursor: null } })),
      on("POST", "/v2/bookings", () => ok({ uid: "on-42" })),
    );
    await expect(new CalcomCalendarProvider(config).upsertEvent(write)).resolves.toEqual({ externalEventId: "on-42" });
    const lookups = calls.filter((call) => call.url.pathname === "/v2/bookings" && call.init.method === undefined);
    expect(lookups.every((call) => call.url.searchParams.get("eventTypeId") === "42")).toBe(true);
  });

  it("finds the booking a reschedule made when the new uid was never saved, instead of booking twice", async () => {
    const calls = routes(
      // The reschedule went through in Cal.com, so the stored uid now names a canceled booking.
      on("GET", "/v2/bookings/stored", () => ok({ ...booking("stored", "2026-11-02T14:00:00.000Z", "2026-11-02T14:45:00.000Z", "cancelled"), eventTypeId: 42 })),
      on("GET", "/v2/bookings", (url) => ok(url.searchParams.get("status") === "upcoming" ? [{ ...booking("moved", write.startsAt, write.endsAt), eventTypeId: 42 }] : [], { pagination: { hasMore: false, nextCursor: null } })),
    );
    await expect(new CalcomCalendarProvider(config).upsertEvent({ ...write, eventId: "stored" })).resolves.toEqual({ externalEventId: "moved" });
    expect(calls.some((call) => call.init.method === "POST")).toBe(false);
  });

  it("leaves the length out on an event type with one length, or a length it doesn't offer", async () => {
    for (const lengths of [[30], [30, 60]]) {
      const calls = routes(
        eventTypeRoute(lengths),
        on("GET", "/v2/bookings", () => ok([], { pagination: { hasMore: false, nextCursor: null } })),
        on("POST", "/v2/bookings", () => ok({ uid: "booked" })),
      );
      await new CalcomCalendarProvider(config).upsertEvent(write);
      expect(body(calls.find((call) => call.init.method === "POST")!.init)).not.toHaveProperty("lengthInMinutes");
    }
  });

  it("doesn't reschedule a fixed-length booking whose end differs from the appointment's, sync after sync", async () => {
    // The event type books an hour; the appointment lasts 45 minutes.
    const calls = routes(
      eventTypeRoute([60]),
      on("GET", "/v2/bookings/stored", () => ok({ ...booking("stored", write.startsAt, "2026-11-02T16:00:00.000Z"), eventTypeId: 42 })),
    );
    const provider = new CalcomCalendarProvider(config);
    for (let sync = 0; sync < 3; sync++) await expect(provider.upsertEvent({ ...write, eventId: "stored" })).resolves.toEqual({ externalEventId: "stored" });
    expect(calls.some((call) => call.init.method === "POST")).toBe(false);
  });

  it("moves a fixed-length booking to a new start without sending a length", async () => {
    const calls = routes(
      eventTypeRoute([60]),
      on("GET", "/v2/bookings/stored", () => ok({ ...booking("stored", "2026-11-02T13:00:00.000Z", "2026-11-02T14:00:00.000Z"), eventTypeId: 42 })),
      on("POST", "/v2/bookings/stored/reschedule", () => ok({ uid: "moved" })),
    );
    await expect(new CalcomCalendarProvider(config).upsertEvent({ ...write, eventId: "stored" })).resolves.toEqual({ externalEventId: "moved" });
    const sent = body(calls.find((call) => call.init.method === "POST")!.init);
    expect(sent).toMatchObject({ start: "2026-11-02T15:00:00Z" });
    expect(sent).not.toHaveProperty("lengthInMinutes");
  });

  it("cancels the live booking a host rescheduled in Cal.com, found by address, when the stored uid is canceled", async () => {
    const calls = routes(
      on("GET", "/v2/bookings/stored", () => ok({ ...booking("stored", write.startsAt, write.endsAt, "cancelled"), eventTypeId: 42 })),
      on("GET", "/v2/bookings", (url) => ok(url.searchParams.get("status") === "upcoming" ? [{ ...booking("host-moved", "2026-11-03T15:00:00.000Z", "2026-11-03T15:45:00.000Z"), eventTypeId: 42 }] : [], { pagination: { hasMore: false, nextCursor: null } })),
      on("POST", /\/cancel$/, () => ok({})),
    );
    await new CalcomCalendarProvider(config).deleteEvent({ accessToken: "access", calendarId: "42", eventId: "stored", appointmentId: write.appointmentId });
    expect(calls.filter((call) => call.init.method === "POST").map((call) => call.url.pathname)).toEqual(["/v2/bookings/host-moved/cancel"]);
  });

  it("books again when the stored booking was canceled in Cal.com", async () => {
    routes(
      on("GET", "/v2/bookings/stored", () => ok(booking("stored", write.startsAt, write.endsAt, "cancelled"))),
      on("GET", "/v2/bookings", () => ok([], { pagination: { hasMore: false, nextCursor: null } })),
      on("POST", "/v2/bookings", () => ok({ uid: "fresh" })),
    );
    await expect(new CalcomCalendarProvider(config).upsertEvent({ ...write, eventId: "stored" })).resolves.toEqual({ externalEventId: "fresh" });
  });

  it("cancels the booking, finds it by the stand-in address when no uid was stored, and treats a missing one as done", async () => {
    const calls = routes(
      on("GET", /^\/v2\/bookings\/(missing|placeholder)$/, () => new Response("{}", { status: 404 })),
      on("GET", "/v2/bookings/kept", () => ok(booking("kept", write.startsAt, write.endsAt))),
      on("GET", "/v2/bookings", (url) => ok(url.searchParams.get("status") === "upcoming" ? [booking("found", write.startsAt, write.endsAt)] : [], { pagination: { hasMore: false, nextCursor: null } })),
      on("POST", /\/cancel$/, () => ok({})),
    );
    const provider = new CalcomCalendarProvider(config);
    await provider.deleteEvent({ accessToken: "access", calendarId: "42", eventId: "kept", appointmentId: write.appointmentId });
    await provider.deleteEvent({ accessToken: "access", calendarId: "42", eventId: "placeholder", appointmentId: write.appointmentId });
    await provider.deleteEvent({ accessToken: "access", calendarId: "42", eventId: "missing" });
    expect(calls.filter((call) => call.init.method === "POST").map((call) => call.url.pathname)).toEqual(["/v2/bookings/kept/cancel", "/v2/bookings/found/cancel"]);
  });

  it("reads busy time from bookings and connected calendars, without counting a booking twice", async () => {
    const calls = routes(
      on("GET", "/v2/bookings", (url) => url.searchParams.get("status") === "upcoming"
        ? (url.searchParams.get("cursor") ? ok([booking("b2", "2026-11-03T10:00:00.000Z", "2026-11-03T10:30:00.000Z", "cancelled")], { pagination: { hasMore: false, nextCursor: null } }) : ok([booking("b1", "2026-11-02T15:00:00.000Z", "2026-11-02T15:45:00.000Z")], { pagination: { hasMore: true, nextCursor: "page-2" } }))
        : ok([booking("b3", "2026-11-04T09:00:00.000Z", "2026-11-04T09:30:00.000Z", "pending")], { pagination: { hasMore: false, nextCursor: null } })),
      on("GET", "/v2/calendars", () => ok({ connectedCalendars: [{ credentialId: 5, calendars: [{ externalId: "jo@example.com", isSelected: true, credentialId: 5 }, { externalId: "holidays", isSelected: false, credentialId: 5 }] }], destinationCalendar: null })),
      on("GET", "/v2/calendars/busy-times", () => ok([{ start: "2026-11-02T15:00:00.000Z", end: "2026-11-02T15:45:00.000Z" }, { start: "2026-11-05T12:00:00Z", end: "2026-11-05T13:00:00Z" }])),
    );
    const blocks = await new CalcomCalendarProvider(config).getBusyBlocks({ accessToken: "access", calendarId: "42", startsAt: "2026-11-01T00:00:00.000Z", endsAt: "2027-01-30T00:00:00.000Z" });
    expect(blocks).toEqual([
      { startsAt: "2026-11-02T15:00:00.000Z", endsAt: "2026-11-02T15:45:00.000Z", externalEventId: "b1" },
      { startsAt: "2026-11-04T09:00:00.000Z", endsAt: "2026-11-04T09:30:00.000Z", externalEventId: "b3" },
      { startsAt: "2026-11-05T12:00:00.000Z", endsAt: "2026-11-05T13:00:00.000Z" },
    ]);
    const busy = calls.find((call) => call.url.pathname === "/v2/calendars/busy-times")!;
    expect(busy.url.searchParams.getAll("calendar")).toEqual(["5,jo@example.com"]);
    expect(Object.fromEntries([...busy.url.searchParams].filter(([key]) => key !== "calendar"))).toEqual({ timeZone: "UTC", dateFrom: "2026-11-01", dateTo: "2027-01-30" });
    expect(calls.filter((call) => call.url.pathname === "/v2/bookings").every((call) => new Headers(call.init.headers).get("cal-api-version") === "2026-05-01")).toBe(true);
  });

  it("fails closed when Cal.com says more bookings follow but gives no cursor", async () => {
    routes(on("GET", "/v2/bookings", () => ok([booking("b1", "2026-11-02T15:00:00.000Z", "2026-11-02T15:45:00.000Z")], { pagination: { hasMore: true, nextCursor: null } })));
    await expect(new CalcomCalendarProvider(config).getBusyBlocks({ accessToken: "access", calendarId: "42", startsAt: "2026-11-01T00:00:00.000Z", endsAt: "2027-01-30T00:00:00.000Z" })).rejects.toThrow("next page");
  });

  it("cancels by address when Cal.com refuses the stored uid with a 400", async () => {
    const calls = routes(
      on("GET", "/v2/bookings/a0123placeholder", () => new Response("{}", { status: 400 })),
      on("GET", "/v2/bookings", (url) => ok(url.searchParams.get("status") === "upcoming" ? [{ ...booking("found", write.startsAt, write.endsAt), eventTypeId: 42 }] : [], { pagination: { hasMore: false, nextCursor: null } })),
      on("POST", /\/cancel$/, () => ok({})),
    );
    await new CalcomCalendarProvider(config).deleteEvent({ accessToken: "access", calendarId: "42", eventId: "a0123placeholder", appointmentId: write.appointmentId });
    expect(calls.filter((call) => call.init.method === "POST").map((call) => call.url.pathname)).toEqual(["/v2/bookings/found/cancel"]);
  });

  it("fails closed when a booking page can't be read", async () => {
    routes(on("GET", "/v2/bookings", () => new Response("{}", { status: 500 })));
    await expect(new CalcomCalendarProvider(config).getBusyBlocks({ accessToken: "access", calendarId: "42", startsAt: "2026-11-01T00:00:00.000Z", endsAt: "2027-01-30T00:00:00.000Z" })).rejects.toThrow("status 500");
  });

  it("reports cancelled bookings and leaves out moved ones", async () => {
    const calls = routes(on("GET", "/v2/bookings", () => ok([
      { uid: "cancelled", start: "2026-11-02T10:00:00.000Z", end: "2026-11-02T10:30:00.000Z", status: "cancelled" },
      { uid: "moved", start: "2026-11-02T11:00:00.000Z", end: "2026-11-02T11:30:00.000Z", status: "cancelled", rescheduledToUid: "new-uid" },
      { uid: "rejected", start: "2026-11-02T12:00:00.000Z", end: "2026-11-02T12:30:00.000Z", status: "rejected" },
    ])));
    await expect(new CalcomCalendarProvider(config).getCancelledEventIds({ accessToken: "access", startsAt: "2026-11-01T00:00:00.000Z", endsAt: "2027-01-30T00:00:00.000Z" })).resolves.toEqual(["cancelled"]);
    expect(calls[0]!.url.searchParams.get("status")).toBe("cancelled");
  });

  it("replaces a webhook that already posts to the connection's address", async () => {
    const subscriberUrl = "https://app.example/api/webhooks/calcom/connection";
    const calls = routes(
      on("GET", "/v2/webhooks", () => ok([{ id: "stale-webhook", subscriberUrl }, { id: "other-webhook", subscriberUrl: "https://elsewhere.example/hook" }])),
      on("DELETE", "/v2/webhooks/stale-webhook", () => ok({})),
      on("POST", "/v2/webhooks", () => ok({ id: "new-webhook", subscriberUrl })),
    );
    await expect(new CalcomCalendarProvider(config).registerWebhook({ accessToken: "access", subscriberUrl, secret: "shh" })).resolves.toEqual({ webhookId: "new-webhook" });
    expect(calls.map((call) => `${call.init.method ?? "GET"} ${call.url.pathname}`)).toEqual(["GET /v2/webhooks", "DELETE /v2/webhooks/stale-webhook", "POST /v2/webhooks"]);
    expect(body(calls[2]!.init)).toMatchObject({ active: true, subscriberUrl, secret: "shh", triggers: expect.arrayContaining(["BOOKING_CREATED", "BOOKING_RESCHEDULED", "BOOKING_CANCELLED"]) });
  });
});

describe("calcomCalendarConfigFromEnv", () => {
  it("needs the OAuth client and a stand-in domain, and says what a partial setup lacks", () => {
    const env = { CALCOM_CLIENT_ID: "client", CALCOM_CLIENT_SECRET: "secret", CALCOM_REDIRECT_URI: "https://app.example/api/calendar/calcom/callback", APP_BASE_URL: "https://dashboard.example" };
    expect(calcomCalendarConfigFromEnv({})).toBeNull();
    expect(calcomCalendarConfigProblem({})).toBeNull();
    // A guessed domain has no MX record, so Cal.com would refuse every booking.
    expect(calcomCalendarConfigFromEnv(env)).toBeNull();
    expect(calcomCalendarConfigProblem(env)).toContain("CALCOM_PLACEHOLDER_EMAIL_DOMAIN is set");
    const complete = { ...env, CALCOM_PLACEHOLDER_EMAIL_DOMAIN: "bookings.example", CALCOM_API_URL: "https://cal.internal/api" };
    expect(calcomCalendarConfigFromEnv(complete)).toEqual({ clientId: "client", clientSecret: "secret", redirectUri: env.CALCOM_REDIRECT_URI, placeholderEmailDomain: "bookings.example", apiUrl: "https://cal.internal/api" });
    expect(calcomCalendarConfigProblem(complete)).toBeNull();
  });
});

describe("verifyCalcomWebhookSignature", () => {
  it("accepts Cal.com's hex HMAC of the raw body and refuses anything else", () => {
    const raw = JSON.stringify({ triggerEvent: "BOOKING_CREATED", payload: { uid: "b1" } });
    const signature = createHmac("sha256", "shh").update(raw).digest("hex");
    expect(verifyCalcomWebhookSignature(raw, signature, "shh")).toBe(true);
    expect(verifyCalcomWebhookSignature(raw, `sha256=${signature.toUpperCase()}`, "shh")).toBe(true);
    expect(verifyCalcomWebhookSignature(`${raw} `, signature, "shh")).toBe(false);
    expect(verifyCalcomWebhookSignature(raw, signature, "other")).toBe(false);
    expect(verifyCalcomWebhookSignature(raw, null, "shh")).toBe(false);
    expect(verifyCalcomWebhookSignature(raw, "short", "shh")).toBe(false);
  });
});
