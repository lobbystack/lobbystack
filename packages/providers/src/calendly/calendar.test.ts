import { createHash, createHmac } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { CALENDLY_PLAN_ERROR } from "@lobbystack/shared";

import { CALENDLY_SCOPES, CalendlyApiError, CalendlyCalendarProvider, CalendlyOAuthRefreshError, CalendlyPlanError, CalendlyRateLimitError, calendlyCalendarConfigFromEnv, calendlyCalendarConfigProblem, calendlyCodeChallenge, calendlyPlaceholderEmail, verifyCalendlyWebhookSignature } from "./calendar";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

const config = { clientId: "client", clientSecret: "secret", redirectUri: "https://app.example/api/calendar/calendly/callback", webhookSigningKey: "app-key", placeholderEmailDomain: "noreply.app.example" };
const api = "https://api.calendly.com";
const user = `${api}/users/U1`;
const organization = `${api}/organizations/O1`;
const eventTypeUri = `${api}/event_types/ET1`;
const appointmentId = "6f1c3a52-9b3d-4f6e-8a51-2c0e7d9b1a44";
const email = calendlyPlaceholderEmail(appointmentId, config.placeholderEmailDomain);
const write = { accessToken: "access", calendarId: "ET1", appointmentId, title: "Haircut", startsAt: "2026-11-02T15:00:00.000Z", endsAt: "2026-11-02T15:30:00.000Z", timezone: "America/Toronto", attendee: { name: "Ada Lovelace", phone: "+15145550100", email: "ada@example.com" } };
const resource = (value: unknown, status = 200) => Response.json({ resource: value }, { status });
const page = (collection: unknown[], next: string | null = null) => Response.json({ collection, pagination: { next_page_token: next } });
const event = (id: string, start: string, end: string, extra: Record<string, unknown> = {}) => ({ uri: `${api}/scheduled_events/${id}`, status: "active", start_time: start, end_time: end, event_type: eventTypeUri, ...extra });
const eventType = (extra: Record<string, unknown> = {}) => ({ uri: eventTypeUri, name: "Haircut", duration: 30, active: true, custom_questions: [], locations: [], pooling_type: null, ...extra });

type Route = (url: URL, init: RequestInit) => Response | undefined;
const on = (method: string, path: string | RegExp, respond: (url: URL, init: RequestInit) => Response): Route => (url, init) => (init.method ?? "GET") === method && (typeof path === "string" ? url.pathname === path : path.test(url.pathname)) ? respond(url, init) : undefined;
const base: Route[] = [
  on("GET", "/users/me", () => resource({ uri: user, current_organization: organization, email: "owner@example.com", timezone: "America/Toronto" })),
];
function routes(...handlers: Route[]) {
  const calls: Array<{ url: URL; init: RequestInit }> = [];
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    for (const handler of [...handlers, ...base]) {
      const response = handler(url, init);
      if (response) return response;
    }
    throw new Error(`Unexpected request ${init.method ?? "GET"} ${url.pathname}${url.search}`);
  }));
  return calls;
}
const body = (init: RequestInit) => JSON.parse(String(init.body)) as Record<string, any>;
const posted = (calls: Array<{ url: URL; init: RequestInit }>) => calls.filter((call) => call.init.method === "POST").map((call) => call.url.pathname);
const created = (id: string) => resource({ event: `${api}/scheduled_events/${id}` }, 201);
const cancelled = () => resource({ canceled_by: "LobbyStack" }, 201);
const noEvents = on("GET", "/scheduled_events", () => page([]));
const haircut = on("GET", "/event_types/ET1", () => resource(eventType()));

describe("configuration", () => {
  const complete = { CALENDLY_CLIENT_ID: "a", CALENDLY_CLIENT_SECRET: "b", CALENDLY_REDIRECT_URI: "https://c", CALENDLY_WEBHOOK_SIGNING_KEY: "d", CALENDLY_PLACEHOLDER_EMAIL_DOMAIN: "e.example" };

  it("stays off until every variable is set, and names what a partial setup lacks", () => {
    expect(calendlyCalendarConfigFromEnv(complete)).toMatchObject({ clientId: "a", webhookSigningKey: "d", placeholderEmailDomain: "e.example" });
    expect(calendlyCalendarConfigFromEnv({ ...complete, CALENDLY_WEBHOOK_SIGNING_KEY: " " })).toBeNull();
    expect(calendlyCalendarConfigProblem({})).toBeNull();
    expect(calendlyCalendarConfigProblem(complete)).toBeNull();
    expect(calendlyCalendarConfigProblem({ ...complete, CALENDLY_PLACEHOLDER_EMAIL_DOMAIN: "" })).toBe("Calendly is off until CALENDLY_PLACEHOLDER_EMAIL_DOMAIN is set.");
  });
});

describe("verifyCalendlyWebhookSignature", () => {
  const now = Date.parse("2026-11-01T12:00:00Z");
  const seconds = now / 1000;
  const sign = (raw: string, key: string, t = seconds) => `t=${t},v1=${createHmac("sha256", key).update(`${t}.${raw}`).digest("hex")}`;

  it("accepts either key, over the timestamp and the raw body", () => {
    expect(verifyCalendlyWebhookSignature("{}", sign("{}", "own"), ["own", "app"], now)).toBe(true);
    expect(verifyCalendlyWebhookSignature("{}", sign("{}", "app"), ["own", "app"], now)).toBe(true);
  });

  it("refuses a wrong key, a changed body, an old timestamp and a malformed header", () => {
    expect(verifyCalendlyWebhookSignature("{}", sign("{}", "other"), ["own"], now)).toBe(false);
    expect(verifyCalendlyWebhookSignature("{ }", sign("{}", "own"), ["own"], now)).toBe(false);
    expect(verifyCalendlyWebhookSignature("{}", sign("{}", "own", seconds - 181), ["own"], now)).toBe(false);
    expect(verifyCalendlyWebhookSignature("{}", "v1=abc", ["own"], now)).toBe(false);
    expect(verifyCalendlyWebhookSignature("{}", null, ["own"], now)).toBe(false);
  });
});

describe("OAuth", () => {
  it("sends the PKCE challenge Calendly requires, and every scope", () => {
    const url = new URL(new CalendlyCalendarProvider(config).buildAuthorizationUrl({ state: "fixture", codeChallenge: "challenge" }));
    expect(url.origin + url.pathname).toBe("https://auth.calendly.com/oauth/authorize");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ client_id: "client", response_type: "code", redirect_uri: config.redirectUri, state: "fixture", code_challenge_method: "S256", code_challenge: "challenge" });
    expect(url.searchParams.get("scope")!.split(" ")).toEqual([...CALENDLY_SCOPES]);
    expect(calendlyCodeChallenge("verifier")).toBe(createHash("sha256").update("verifier").digest("base64url"));
  });

  it("exchanges the code with its verifier as a confidential client, and asks for reconnection on invalid_grant", async () => {
    const calls = routes(on("POST", "/oauth/token", (_url, init) => {
      const form = init.body as URLSearchParams;
      if (form.get("grant_type") === "authorization_code") return Response.json({ access_token: "access", refresh_token: "refresh", expires_in: 7200 });
      return form.get("refresh_token") === "dead" ? Response.json({ error: "invalid_grant" }, { status: 400 }) : Response.json({ access_token: "next", refresh_token: "rotated", expires_in: 7200 });
    }));
    const provider = new CalendlyCalendarProvider(config);
    await expect(provider.exchangeCode("code", "verifier")).resolves.toEqual({ accessToken: "access", refreshToken: "refresh", expiresIn: 7200 });
    expect(calls[0]!.url.origin).toBe("https://auth.calendly.com");
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe(`Basic ${Buffer.from("client:secret").toString("base64")}`);
    expect(Object.fromEntries(calls[0]!.init.body as URLSearchParams)).toMatchObject({ code: "code", code_verifier: "verifier", redirect_uri: config.redirectUri });
    await expect(provider.refreshAccessToken({ refreshToken: "live" })).resolves.toEqual({ accessToken: "next", refreshToken: "rotated", expiresIn: 7200 });
    await expect(provider.refreshAccessToken({ refreshToken: "dead" })).rejects.toBeInstanceOf(CalendlyOAuthRefreshError);
    await expect(provider.refreshAccessToken({ refreshToken: "dead" })).rejects.toMatchObject({ reconnectRequired: true });
  });
});

describe("account and event types", () => {
  it.each([[{ plan: "basic", stage: "free" }, false], [{ plan: "standard", stage: "paid" }, true], [{ plan: "teams", stage: "trial" }, true]])("reads the plan %j", async (organizationRow, paidPlan) => {
    routes(on("GET", "/organizations/O1", () => resource(organizationRow)));
    await expect(new CalendlyCalendarProvider(config).getAccount({ accessToken: "access" })).resolves.toEqual({ id: "U1", email: "owner@example.com", timeZone: "America/Toronto", paidPlan });
  });

  it("marks an event type with a required choice question as read-only, so it can't be picked", async () => {
    const calls = routes(on("GET", "/event_types", () => page([
      eventType({ custom_questions: [{ name: "Notes", type: "text", position: 0, enabled: true, required: false }] }),
      eventType({ uri: `${api}/event_types/ET2`, name: "Consult", duration: 45, locations: [{ kind: "zoom_conference" }], custom_questions: [{ name: "Which clinic?", type: "single_select", position: 0, enabled: true, required: true }, { name: "Off", type: "multi_select", enabled: false, required: true }] }),
    ])));
    const provider = new CalendlyCalendarProvider(config);
    await expect(provider.listEventTypes({ accessToken: "access" })).resolves.toEqual([
      { id: "ET1", title: "Haircut", lengthInMinutes: 30, blockingQuestions: [], detailsQuestion: true, videoOnly: false },
      { id: "ET2", title: "Consult", lengthInMinutes: 45, blockingQuestions: ["Which clinic?"], detailsQuestion: false, videoOnly: true },
    ]);
    expect(calls.find((call) => call.url.pathname === "/event_types")!.url.searchParams.get("user")).toBe(user);
  });

  it("lists calendars with why one can't be picked, and every one as read-only on a Free plan", async () => {
    const eventTypes = on("GET", "/event_types", () => page([eventType(), eventType({ uri: `${api}/event_types/ET2`, name: "Consult", custom_questions: [{ name: "Which clinic?", type: "single_select", enabled: true, required: true }] })]));
    const paid = routes(eventTypes, on("GET", "/organizations/O1", () => resource({ plan: "standard", stage: "paid" })));
    await expect(new CalendlyCalendarProvider(config).listCalendars({ accessToken: "access" })).resolves.toEqual([
      { id: "ET1", summary: "Haircut", primary: false, accessRole: "owner" },
      { id: "ET2", summary: "Consult", primary: false, accessRole: "reader", unwritableReason: "This event type requires an answer to Which clinic?, which LobbyStack can't give." },
    ]);
    expect(paid.some((call) => call.url.pathname === "/organizations/O1")).toBe(true);
    routes(eventTypes, on("GET", "/organizations/O1", () => resource({ plan: "basic", stage: "free" })));
    const free = await new CalendlyCalendarProvider(config).listCalendars({ accessToken: "access" });
    expect(free.map((calendar) => [calendar.accessRole, calendar.unwritableReason])).toEqual([["reader", CALENDLY_PLAN_ERROR], ["reader", CALENDLY_PLAN_ERROR]]);
    // A failed plan lookup doesn't lock the account out: the sync still reports a Free plan.
    routes(eventTypes, on("GET", "/organizations/O1", () => Response.json({}, { status: 500 })));
    expect((await new CalendlyCalendarProvider(config).listCalendars({ accessToken: "access" }))[0]).toMatchObject({ accessRole: "owner" });
  });

  it("follows pages, and fails closed when one doesn't advance", async () => {
    const provider = new CalendlyCalendarProvider(config);
    routes(on("GET", "/event_types", (url) => url.searchParams.get("page_token") ? page([eventType({ uri: `${api}/event_types/ET2` })]) : page([eventType()], "next")));
    expect(await provider.listEventTypes({ accessToken: "access" })).toHaveLength(2);
    routes(on("GET", "/event_types", () => page([eventType()], "same")));
    await expect(provider.listEventTypes({ accessToken: "access" })).rejects.toThrow("pagination did not advance");
  });
});

describe("busy time", () => {
  it("reads a week per request from just after now, keeps buffers busy, and drops the calendar copy of a Calendly event", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-01T00:00:00Z") });
    const calls = routes(on("GET", "/user_busy_times", (url) => url.searchParams.get("start_time")!.startsWith("2026-11-01") ? Response.json({ collection: [
      { type: "calendly", start_time: "2026-11-02T15:00:00Z", end_time: "2026-11-02T15:30:00Z", buffered_start_time: "2026-11-02T14:50:00Z", buffered_end_time: "2026-11-02T15:40:00Z", event: { uri: `${api}/scheduled_events/E1` } },
      { type: "external", start_time: "2026-11-02T15:00:00Z", end_time: "2026-11-02T15:30:00Z" },
      { type: "external", start_time: "2026-11-03T09:00:00Z", end_time: "2026-11-03T10:00:00Z" },
    ] }) : Response.json({ collection: [{ type: "reserved", start_time: "2026-11-10T09:00:00Z", end_time: "2026-11-10T10:00:00Z" }] })));
    const blocks = await new CalendlyCalendarProvider(config).getBusyBlocks({ accessToken: "access", calendarId: "ET1", startsAt: "2026-11-01T00:00:00.000Z", endsAt: "2026-11-15T00:00:00.000Z" });
    const ranges = calls.filter((call) => call.url.pathname === "/user_busy_times").map((call) => Date.parse(call.url.searchParams.get("end_time")!) - Date.parse(call.url.searchParams.get("start_time")!));
    expect(ranges.length).toBe(3);
    expect(Math.max(...ranges)).toBeLessThanOrEqual(7 * 24 * 60 * 60_000);
    expect(Date.parse(calls.find((call) => call.url.pathname === "/user_busy_times")!.url.searchParams.get("start_time")!)).toBeGreaterThan(Date.now());
    expect(blocks).toEqual([
      { startsAt: "2026-11-02T14:50:00.000Z", endsAt: "2026-11-02T15:40:00.000Z", externalEventId: "E1" },
      { startsAt: "2026-11-10T09:00:00.000Z", endsAt: "2026-11-10T10:00:00.000Z" },
      { startsAt: "2026-11-03T09:00:00.000Z", endsAt: "2026-11-03T10:00:00.000Z" },
    ]);
  });

  it("fails closed when Calendly can't reach an external calendar", async () => {
    routes(on("GET", "/user_busy_times", () => Response.json({ title: "Failed Dependency" }, { status: 424 })));
    await expect(new CalendlyCalendarProvider(config).getBusyBlocks({ accessToken: "access", calendarId: "ET1", startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 86_400_000).toISOString() })).rejects.toMatchObject({ responseStatus: 424 });
  });
});

describe("booking", () => {
  it("books under the stand-in address, with the caller's details in the text question and the phone as the location", async () => {
    const calls = routes(noEvents,
      on("GET", "/event_types/ET1", () => resource(eventType({ locations: [{ kind: "outbound_call" }], custom_questions: [{ name: "Anything else?", type: "text", position: 1, enabled: true, required: false }, { name: "Mobile", type: "phone_number", position: 2, enabled: true, required: true }] }))),
      on("POST", "/invitees", () => created("E2")));
    await expect(new CalendlyCalendarProvider(config).upsertEvent(write)).resolves.toEqual({ externalEventId: "E2" });
    const sent = body(calls.find((call) => call.url.pathname === "/invitees")!.init);
    expect(sent).toEqual({
      event_type: eventTypeUri, start_time: "2026-11-02T15:00:00Z",
      invitee: { name: "Ada Lovelace", email, timezone: "America/Toronto" },
      location: { kind: "outbound_call", location: "+15145550100" },
      questions_and_answers: [{ question: "Anything else?", answer: "Booked by LobbyStack. Ada Lovelace, +15145550100, ada@example.com", position: 1 }, { question: "Mobile", answer: "+15145550100", position: 2 }],
    });
    expect(JSON.stringify(sent.invitee)).not.toContain("ada@example.com");
  });

  it.each([
    ["no location", { locations: [] }, undefined],
    ["a round robin event type", { locations: [{ kind: "zoom_conference" }], pooling_type: "round_robin" }, undefined],
    ["a physical location", { locations: [{ kind: "physical", location: "12 Main St" }] }, { kind: "physical", location: "12 Main St" }],
    ["a video location", { locations: [{ kind: "zoom_conference" }] }, { kind: "zoom_conference" }],
    ["an ask-the-invitee location", { locations: [{ kind: "ask_invitee" }] }, { kind: "ask_invitee", location: "+15145550100" }],
  ])("sends the right location for %s", async (_name, extra, location) => {
    const calls = routes(noEvents, on("GET", "/event_types/ET1", () => resource(eventType(extra))), on("POST", "/invitees", () => created("E2")));
    await new CalendlyCalendarProvider(config).upsertEvent(write);
    expect(body(calls.find((call) => call.url.pathname === "/invitees")!.init).location).toEqual(location);
  });

  it("refuses before spending a booking when a required choice question appeared after the event type was picked", async () => {
    const calls = routes(on("GET", "/event_types/ET1", () => resource(eventType({ custom_questions: [{ name: "Which clinic?", type: "single_select", enabled: true, required: true }] }))));
    await expect(new CalendlyCalendarProvider(config).upsertEvent(write)).rejects.toThrow("Which clinic?");
    expect(posted(calls)).toEqual([]);
  });

  it("finds a booking a failed attempt already made by its stand-in address", async () => {
    const calls = routes(haircut, on("GET", "/scheduled_events", () => page([event("E1", write.startsAt, write.endsAt)])));
    await expect(new CalendlyCalendarProvider(config).upsertEvent(write)).resolves.toEqual({ externalEventId: "E1" });
    expect(calls.find((call) => call.url.pathname === "/scheduled_events")!.url.searchParams.get("invitee_email")).toBe(email);
    expect(posted(calls)).toEqual([]);
  });

  it("leaves a stored booking at the right time alone, whatever its length", async () => {
    const calls = routes(haircut, on("GET", "/scheduled_events/E1", () => resource(event("E1", write.startsAt, "2026-11-02T16:00:00Z"))));
    await expect(new CalendlyCalendarProvider(config).upsertEvent({ ...write, eventId: "E1" })).resolves.toEqual({ externalEventId: "E1" });
    expect(posted(calls)).toEqual([]);
  });

  it("books the new time first when the times don't overlap, then cancels the old one", async () => {
    const stored = event("E1", "2026-11-02T10:00:00Z", "2026-11-02T10:30:00Z");
    const calls = routes(haircut, noEvents, on("GET", "/scheduled_events/E1", () => resource(stored)), on("POST", "/invitees", () => created("E2")), on("POST", "/scheduled_events/E1/cancellation", cancelled));
    await expect(new CalendlyCalendarProvider(config).upsertEvent({ ...write, eventId: "E1" })).resolves.toEqual({ externalEventId: "E2" });
    expect(posted(calls)).toEqual(["/invitees", "/scheduled_events/E1/cancellation"]);
    expect(body(calls.find((call) => call.url.pathname.endsWith("/cancellation"))!.init)).toEqual({ reason: "Canceled in LobbyStack" });
  });

  it("keeps the old booking when the new time is refused", async () => {
    const stored = event("E1", "2026-11-02T10:00:00Z", "2026-11-02T10:30:00Z");
    const calls = routes(haircut, noEvents, on("GET", "/scheduled_events/E1", () => resource(stored)), on("POST", "/invitees", () => Response.json({ title: "Invalid Argument", message: "The provided start_time is not available." }, { status: 400 })));
    await expect(new CalendlyCalendarProvider(config).upsertEvent({ ...write, eventId: "E1" })).rejects.toThrow("Calendly refused the booking: The provided start_time is not available.");
    expect(posted(calls)).toEqual(["/invitees"]);
  });

  it("cancels first when the times overlap, since Calendly won't book over the old one", async () => {
    const stored = event("E1", "2026-11-02T14:45:00Z", "2026-11-02T15:15:00Z");
    const calls = routes(haircut, noEvents, on("GET", "/scheduled_events/E1", () => resource(stored)), on("POST", "/invitees", () => created("E2")), on("POST", "/scheduled_events/E1/cancellation", cancelled));
    await expect(new CalendlyCalendarProvider(config).upsertEvent({ ...write, eventId: "E1" })).resolves.toEqual({ externalEventId: "E2" });
    expect(posted(calls)).toEqual(["/scheduled_events/E1/cancellation", "/invitees"]);
  });

  it("finishes the cancel on a retry when a move left both bookings", async () => {
    const old = event("E1", "2026-11-02T10:00:00Z", "2026-11-02T10:30:00Z");
    const next = event("E2", write.startsAt, write.endsAt);
    const calls = routes(haircut, on("GET", "/scheduled_events/E1", () => resource(old)), on("GET", "/scheduled_events", () => page([old, next])), on("POST", "/scheduled_events/E1/cancellation", cancelled));
    await expect(new CalendlyCalendarProvider(config).upsertEvent({ ...write, eventId: "E1" })).resolves.toEqual({ externalEventId: "E2" });
    expect(posted(calls)).toEqual(["/scheduled_events/E1/cancellation"]);
  });

  it("books again when the stored booking was canceled or is on another event type", async () => {
    const canceled = event("E1", write.startsAt, write.endsAt, { status: "canceled" });
    const calls = routes(haircut, noEvents, on("GET", "/scheduled_events/E1", () => resource(canceled)), on("POST", "/invitees", () => created("E2")));
    await expect(new CalendlyCalendarProvider(config).upsertEvent({ ...write, eventId: "E1" })).resolves.toEqual({ externalEventId: "E2" });
    expect(posted(calls)).toEqual(["/invitees"]);
    const elsewhere = event("E1", write.startsAt, write.endsAt, { event_type: `${api}/event_types/OTHER` });
    routes(haircut, noEvents, on("GET", "/scheduled_events/E1", () => resource(elsewhere)), on("POST", "/invitees", () => created("E3")));
    await expect(new CalendlyCalendarProvider(config).upsertEvent({ ...write, eventId: "E1" })).resolves.toEqual({ externalEventId: "E3" });
  });

  it("names a refused stand-in address, so the failure reaches the operator", async () => {
    routes(haircut, noEvents, on("POST", "/invitees", () => Response.json({ title: "Invalid Argument", message: "The supplied parameters are invalid.", details: [{ parameter: "invitee.email", message: "is not a valid email" }] }, { status: 400 })));
    await expect(new CalendlyCalendarProvider(config).upsertEvent(write)).rejects.toMatchObject({ message: "Calendly refused the stand-in email address, so this appointment isn't in Calendly.", responseStatus: 400 });
  });

  it("turns a Free plan's 403 into the plan error, which no reconnect fixes", async () => {
    routes(haircut, noEvents, on("POST", "/invitees", () => Response.json({ title: "Permission Denied", message: "The Scheduling API is only available on paid Calendly plans. Upgrade your plan to access this feature." }, { status: 403 })));
    const failure = await new CalendlyCalendarProvider(config).upsertEvent(write).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(CalendlyPlanError);
    expect(failure).toMatchObject({ message: CALENDLY_PLAN_ERROR });
    expect((failure as { responseStatus?: number }).responseStatus).toBeUndefined();
  });

  it("keeps a plain 403 as a status error", async () => {
    routes(on("GET", "/event_types", () => Response.json({ title: "Permission Denied", message: "You do not have permission" }, { status: 403 })));
    await expect(new CalendlyCalendarProvider(config).listEventTypes({ accessToken: "access" })).rejects.toBeInstanceOf(CalendlyApiError);
  });

  it("says how long to wait when the rate limit is reached", async () => {
    routes(haircut, noEvents, on("POST", "/invitees", () => new Response(null, { status: 429, headers: { "x-ratelimit-reset": "3600" } })));
    const failure = await new CalendlyCalendarProvider(config).upsertEvent(write).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(CalendlyRateLimitError);
    expect(failure).toMatchObject({ retryAfterMs: 3_600_000 });
  });
});

describe("cancelling", () => {
  it("cancels the stored booking, or what the stand-in address finds when it's gone", async () => {
    const calls = routes(noEvents, on("GET", "/scheduled_events/E1", () => resource(event("E1", write.startsAt, write.endsAt))), on("POST", "/scheduled_events/E1/cancellation", cancelled));
    await new CalendlyCalendarProvider(config).deleteEvent({ accessToken: "access", calendarId: "ET1", eventId: "E1", appointmentId });
    expect(posted(calls)).toEqual(["/scheduled_events/E1/cancellation"]);
    const fallback = routes(on("GET", "/scheduled_events/placeholder", () => Response.json({}, { status: 404 })), on("GET", "/scheduled_events", () => page([event("E2", write.startsAt, write.endsAt), event("E3", write.startsAt, write.endsAt, { event_type: `${api}/event_types/OTHER` })])), on("POST", "/scheduled_events/E2/cancellation", cancelled));
    await new CalendlyCalendarProvider(config).deleteEvent({ accessToken: "access", calendarId: "ET1", eventId: "placeholder", appointmentId });
    expect(posted(fallback)).toEqual(["/scheduled_events/E2/cancellation"]);
  });

  it("cancels both bookings a half-finished move left, so the new one doesn't hold the slot", async () => {
    const old = event("E1", "2026-11-02T10:00:00Z", "2026-11-02T10:30:00Z");
    const next = event("E2", write.startsAt, write.endsAt);
    const calls = routes(on("GET", "/scheduled_events/E1", () => resource(old)), on("GET", "/scheduled_events", () => page([old, next])), on("POST", /\/cancellation$/, cancelled));
    await new CalendlyCalendarProvider(config).deleteEvent({ accessToken: "access", calendarId: "ET1", eventId: "E1", appointmentId });
    expect(posted(calls).sort()).toEqual(["/scheduled_events/E1/cancellation", "/scheduled_events/E2/cancellation"]);
  });

  it("leaves alone a booking the appointment still holds when an old one is released", async () => {
    const old = event("E1", "2026-11-02T10:00:00Z", "2026-11-02T10:30:00Z");
    const next = event("E2", write.startsAt, write.endsAt);
    const calls = routes(on("GET", "/scheduled_events/E1", () => resource(old)), on("GET", "/scheduled_events", () => page([old, next])), on("POST", /\/cancellation$/, cancelled));
    await new CalendlyCalendarProvider(config).deleteEvent({ accessToken: "access", calendarId: "ET1", eventId: "E1", appointmentId, keepEventId: "E2" });
    expect(posted(calls)).toEqual(["/scheduled_events/E1/cancellation"]);
  });

  it("treats a booking that's already gone as done", async () => {
    routes(on("GET", "/scheduled_events/E1", () => resource(event("E1", write.startsAt, write.endsAt))), on("POST", "/scheduled_events/E1/cancellation", () => Response.json({}, { status: 404 })));
    await expect(new CalendlyCalendarProvider(config).deleteEvent({ accessToken: "access", calendarId: "ET1", eventId: "E1" })).resolves.toBeUndefined();
  });
});

describe("changes made in Calendly", () => {
  const window = { accessToken: "access", calendarId: "ET1", startsAt: "2026-11-01T00:00:00.000Z", endsAt: "2026-12-01T00:00:00.000Z" };

  it("reports cancellations and moves, follows a chain of moves, and skips LobbyStack's own cancellations", async () => {
    const calls = routes(
      on("GET", "/scheduled_events", () => page([
        event("GONE", "2026-11-05T10:00:00Z", "2026-11-05T10:30:00Z", { status: "canceled" }),
        event("MOVED", "2026-11-06T10:00:00Z", "2026-11-06T10:30:00Z", { status: "canceled" }),
        event("OURS", "2026-11-07T10:00:00Z", "2026-11-07T10:30:00Z", { status: "canceled", cancellation: { reason: "Canceled in LobbyStack" } }),
        event("OTHER", "2026-11-08T10:00:00Z", "2026-11-08T10:30:00Z", { status: "canceled", event_type: `${api}/event_types/OTHER` }),
      ])),
      on("GET", "/scheduled_events/GONE/invitees", () => page([{ new_invitee: null }])),
      on("GET", "/scheduled_events/MOVED/invitees", () => page([{ new_invitee: `${api}/scheduled_events/STEP/invitees/I2` }])),
      on("GET", "/scheduled_events/STEP", () => resource(event("STEP", "2026-11-09T10:00:00Z", "2026-11-09T10:30:00Z", { status: "canceled" }))),
      on("GET", "/scheduled_events/STEP/invitees", () => page([{ new_invitee: `${api}/scheduled_events/LAST/invitees/I3` }])),
      on("GET", "/scheduled_events/LAST", () => resource(event("LAST", "2026-11-10T10:00:00Z", "2026-11-10T10:30:00Z"))));
    await expect(new CalendlyCalendarProvider(config).getBookingChanges(window)).resolves.toEqual({ cancelled: ["GONE"], moved: [{ eventId: "MOVED", toEventId: "LAST", startsAt: "2026-11-10T10:00:00.000Z", endsAt: "2026-11-10T10:30:00.000Z" }] });
    expect(calls.find((call) => call.url.pathname === "/scheduled_events")!.url.searchParams.get("status")).toBe("canceled");
    expect(calls.some((call) => call.url.pathname.includes("OURS") || call.url.pathname.includes("OTHER"))).toBe(false);
  });

  it("reports a cancellation for a move whose new booking was canceled before the next sync", async () => {
    routes(
      on("GET", "/scheduled_events", () => page([event("MOVED", "2026-11-06T10:00:00Z", "2026-11-06T10:30:00Z", { status: "canceled" })])),
      on("GET", "/scheduled_events/MOVED/invitees", () => page([{ new_invitee: `${api}/scheduled_events/STEP/invitees/I2` }])),
      on("GET", "/scheduled_events/STEP", () => resource(event("STEP", "2026-11-09T10:00:00Z", "2026-11-09T10:30:00Z", { status: "canceled" }))),
      on("GET", "/scheduled_events/STEP/invitees", () => page([{ new_invitee: null }])));
    await expect(new CalendlyCalendarProvider(config).getBookingChanges(window)).resolves.toEqual({ cancelled: ["MOVED"], moved: [] });
  });

  it("leaves a move alone when LobbyStack canceled its new booking", async () => {
    routes(
      on("GET", "/scheduled_events", () => page([event("MOVED", "2026-11-06T10:00:00Z", "2026-11-06T10:30:00Z", { status: "canceled" })])),
      on("GET", "/scheduled_events/MOVED/invitees", () => page([{ new_invitee: `${api}/scheduled_events/STEP/invitees/I2` }])),
      on("GET", "/scheduled_events/STEP", () => resource(event("STEP", "2026-11-09T10:00:00Z", "2026-11-09T10:30:00Z", { status: "canceled", cancellation: { reason: "Canceled in LobbyStack" } }))));
    await expect(new CalendlyCalendarProvider(config).getBookingChanges(window)).resolves.toEqual({ cancelled: [], moved: [] });
  });

  it("leaves a booking alone when its moves run past the limit", async () => {
    const hop = (index: number) => [
      on("GET", `/scheduled_events/E${index}/invitees`, () => page([{ new_invitee: `${api}/scheduled_events/E${index + 1}/invitees/I${index}` }])),
      on("GET", `/scheduled_events/E${index + 1}`, () => resource(event(`E${index + 1}`, "2026-11-09T10:00:00Z", "2026-11-09T10:30:00Z", { status: "canceled" }))),
    ];
    routes(on("GET", "/scheduled_events", () => page([event("E0", "2026-11-06T10:00:00Z", "2026-11-06T10:30:00Z", { status: "canceled" })])), ...Array.from({ length: 10 }, (_, index) => hop(index)).flat());
    await expect(new CalendlyCalendarProvider(config).getBookingChanges(window)).resolves.toEqual({ cancelled: [], moved: [] });
  });
});

describe("webhooks", () => {
  it("replaces a subscription posting to the same URL, signed with the connection's key", async () => {
    const url = "https://app.example/api/webhooks/calendly/connection";
    const calls = routes(
      on("GET", "/webhook_subscriptions", () => page([{ uri: `${api}/webhook_subscriptions/OLD`, callback_url: url }, { uri: `${api}/webhook_subscriptions/KEEP`, callback_url: "https://elsewhere.example" }])),
      on("DELETE", "/webhook_subscriptions/OLD", () => new Response(null, { status: 204 })),
      on("POST", "/webhook_subscriptions", () => resource({ uri: `${api}/webhook_subscriptions/NEW` }, 201)));
    await expect(new CalendlyCalendarProvider(config).registerWebhook({ accessToken: "access", subscriberUrl: url, secret: "own-key" })).resolves.toEqual({ webhookId: "NEW" });
    expect(body(calls.find((call) => call.init.method === "POST")!.init)).toEqual({ url, events: ["invitee.created", "invitee.canceled"], organization, user, scope: "user", signing_key: "own-key" });
    expect(calls.filter((call) => call.init.method === "DELETE")).toHaveLength(1);
  });

  it("reports a plan without webhooks as the plan error, and treats a missing webhook as removed", async () => {
    const provider = new CalendlyCalendarProvider(config);
    routes(on("GET", "/webhook_subscriptions", () => page([])), on("POST", "/webhook_subscriptions", () => Response.json({ title: "Permission Denied", message: "Please upgrade your Calendly account to Standard" }, { status: 403 })));
    await expect(provider.registerWebhook({ accessToken: "access", subscriberUrl: "https://a.example", secret: "key" })).rejects.toBeInstanceOf(CalendlyPlanError);
    routes(on("DELETE", "/webhook_subscriptions/GONE", () => Response.json({}, { status: 404 })));
    await expect(provider.deleteWebhook({ accessToken: "access", webhookId: "GONE" })).resolves.toBeUndefined();
  });
});
