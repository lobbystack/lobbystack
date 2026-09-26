import { afterEach, describe, expect, it, vi } from "vitest";

import { GoogleCalendarProvider } from "./calendar";

afterEach(() => vi.unstubAllGlobals());

describe("GoogleCalendarProvider", () => {
  it("uses a deterministic client event id for first-time inserts", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: "event-1" }) });
    vi.stubGlobal("fetch", fetchMock);
    const provider = new GoogleCalendarProvider({ clientId: "client", clientSecret: "secret", redirectUri: "https://app.example/oauth" });

    await expect(provider.upsertEvent({ accessToken: "access", calendarId: "primary", clientEventId: "a1234567890abcdef", title: "Appointment", startsAt: "2026-08-12T10:00:00.000Z", endsAt: "2026-08-12T10:30:00.000Z" })).resolves.toEqual({ externalEventId: "event-1" });
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({ id: "a1234567890abcdef", summary: "Appointment" });
  });

  it("treats a deterministic insert conflict as an already-created event", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false, status: 409 }).mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: "a1234567890abcdef" }) });
    vi.stubGlobal("fetch", fetchMock);
    const provider = new GoogleCalendarProvider({ clientId: "client", clientSecret: "secret", redirectUri: "https://app.example/oauth" });

    await expect(provider.upsertEvent({ accessToken: "access", calendarId: "primary", clientEventId: "a1234567890abcdef", title: "Appointment", startsAt: "2026-08-12T10:00:00.000Z", endsAt: "2026-08-12T10:30:00.000Z" })).resolves.toEqual({ externalEventId: "a1234567890abcdef" });
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: "PUT" });
  });

  it("requests only the submitted identity and Calendar scopes", () => {
    const provider = new GoogleCalendarProvider({ clientId: "client", clientSecret: "secret", redirectUri: "https://app.example/oauth" });
    const scopes = new URL(provider.buildAuthorizationUrl({ state: "fixture" })).searchParams.get("scope")!.split(" ");
    expect(scopes).toEqual(["openid", "email", "https://www.googleapis.com/auth/calendar.calendarlist.readonly", "https://www.googleapis.com/auth/calendar.events"]);
  });

  it("refreshes expired credentials and keeps provider error details private", async () => {
    const request = vi.fn().mockResolvedValueOnce(Response.json({ access_token: "new-access", expires_in: 3600 })).mockResolvedValueOnce(Response.json({ error: "invalid_grant", error_description: "private-provider-detail" }, { status: 400 }));
    vi.stubGlobal("fetch", request);
    const provider = new GoogleCalendarProvider({ clientId: "client", clientSecret: "secret", redirectUri: "https://app.example/oauth" });
    await expect(provider.refreshAccessToken({ refreshToken: "refresh" })).resolves.toEqual({ accessToken: "new-access", expiresIn: 3600 });
    expect(String(request.mock.calls[0]?.[1].body)).toContain("grant_type=refresh_token");
    await expect(provider.refreshAccessToken({ refreshToken: "refresh" })).rejects.toMatchObject({ reconnectRequired: true, message: "Google Calendar authorization requires reconnection." });
  });

  it("does not turn per-calendar failures into an empty availability window", async () => {
    const request = vi.fn().mockResolvedValueOnce(new Response(null, { status: 403 })).mockResolvedValueOnce(Response.json({ items: [] }));
    vi.stubGlobal("fetch", request);
    const provider = new GoogleCalendarProvider({ clientId: "client", clientSecret: "secret", redirectUri: "https://app.example/oauth" });
    const input = { accessToken: "access", calendarId: "selected", startsAt: "2026-09-14T10:00:00Z", endsAt: "2026-09-14T11:00:00Z" };
    await expect(provider.getBusyBlocks(input)).rejects.toThrow("status 403");
    await expect(provider.getBusyBlocks(input)).resolves.toEqual([]);
  });

  it("expands recurring events, follows every page, and excludes free or cancelled events", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(Response.json({ timeZone: "America/Toronto", nextPageToken: "page-2", items: [
        { start: { date: "2026-11-01" }, end: { date: "2026-11-02" } },
        { start: { dateTime: "2026-11-01T09:00:00-05:00" }, end: { dateTime: "2026-11-01T10:00:00-05:00" }, transparency: "transparent" },
      ] }))
      .mockResolvedValueOnce(Response.json({ timeZone: "America/Toronto", items: [
        { start: { dateTime: "2026-11-02T09:00:00-05:00" }, end: { dateTime: "2026-11-02T10:00:00-05:00" } },
        { start: { dateTime: "2026-11-02T10:00:00-05:00" }, end: { dateTime: "2026-11-02T11:00:00-05:00" }, status: "cancelled" },
      ] }));
    vi.stubGlobal("fetch", request);
    const provider = new GoogleCalendarProvider({ clientId: "client", clientSecret: "secret", redirectUri: "https://app.example/oauth" });

    await expect(provider.getBusyBlocks({ accessToken: "access", calendarId: "selected", startsAt: "2026-10-31T00:00:00Z", endsAt: "2026-11-04T00:00:00Z" })).resolves.toEqual([
      { startsAt: "2026-11-01T04:00:00.000Z", endsAt: "2026-11-02T05:00:00.000Z" },
      { startsAt: "2026-11-02T14:00:00.000Z", endsAt: "2026-11-02T15:00:00.000Z" },
    ]);
    const first = new URL(String(request.mock.calls[0]?.[0]));
    const second = new URL(String(request.mock.calls[1]?.[0]));
    expect(first.pathname).toBe("/calendar/v3/calendars/selected/events");
    expect(first.searchParams.get("singleEvents")).toBe("true");
    expect(first.searchParams.get("fields")).toContain("nextPageToken");
    expect(second.searchParams.get("pageToken")).toBe("page-2");
  });

  it("fails closed on incomplete event data or repeated pagination tokens", async () => {
    const request = vi.fn().mockResolvedValueOnce(Response.json({ items: [{}] }))
      .mockResolvedValueOnce(Response.json({ items: [], nextPageToken: "same" }))
      .mockResolvedValueOnce(Response.json({ items: [], nextPageToken: "same" }));
    vi.stubGlobal("fetch", request);
    const provider = new GoogleCalendarProvider({ clientId: "client", clientSecret: "secret", redirectUri: "https://app.example/oauth" });
    const input = { accessToken: "access", calendarId: "selected", startsAt: "2026-09-14T10:00:00Z", endsAt: "2026-09-14T11:00:00Z" };
    await expect(provider.getBusyBlocks(input)).rejects.toThrow("invalid busy interval");
    await expect(provider.getBusyBlocks(input)).rejects.toThrow("pagination did not advance");
  });

  it("deletes cancelled events idempotently but does not hide provider failures", async () => {
    const request = vi.fn().mockResolvedValueOnce(new Response(null, { status: 204 })).mockResolvedValueOnce(new Response(null, { status: 404 })).mockResolvedValueOnce(new Response(null, { status: 410 })).mockResolvedValueOnce(new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", request);
    const provider = new GoogleCalendarProvider({ clientId: "client", clientSecret: "secret", redirectUri: "https://app.example/oauth" });
    const input = { accessToken: "access", calendarId: "selected", eventId: "event" };
    for (let attempt = 0; attempt < 3; attempt++) await expect(provider.deleteEvent(input)).resolves.toBeUndefined();
    await expect(provider.deleteEvent(input)).rejects.toThrow("503");
    expect(request.mock.calls[0]?.[1]).toMatchObject({ method: "DELETE" });
  });

  it("discovers calendars without exposing access tokens", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ items: [{ id: "primary", summary: "Personal", primary: true, accessRole: "owner" }, { id: "team", summary: "Team", primary: false, accessRole: "writer" }] }) });
    vi.stubGlobal("fetch", fetchMock);
    const provider = new GoogleCalendarProvider({ clientId: "client", clientSecret: "secret", redirectUri: "https://app.example/oauth" });

    await expect(provider.listCalendars({ accessToken: "access" })).resolves.toEqual([{ id: "primary", summary: "Personal", primary: true, accessRole: "owner" }, { id: "team", summary: "Team", primary: false, accessRole: "writer" }]);
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain("client");
  });
});
