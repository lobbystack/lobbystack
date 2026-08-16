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
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 409 });
    vi.stubGlobal("fetch", fetchMock);
    const provider = new GoogleCalendarProvider({ clientId: "client", clientSecret: "secret", redirectUri: "https://app.example/oauth" });

    await expect(provider.upsertEvent({ accessToken: "access", calendarId: "primary", clientEventId: "a1234567890abcdef", title: "Appointment", startsAt: "2026-08-12T10:00:00.000Z", endsAt: "2026-08-12T10:30:00.000Z" })).resolves.toEqual({ externalEventId: "a1234567890abcdef" });
  });

  it("discovers calendars without exposing access tokens", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ items: [{ id: "primary", summary: "Personal", primary: true, accessRole: "owner" }, { id: "team", summary: "Team", primary: false, accessRole: "writer" }] }) });
    vi.stubGlobal("fetch", fetchMock);
    const provider = new GoogleCalendarProvider({ clientId: "client", clientSecret: "secret", redirectUri: "https://app.example/oauth" });

    await expect(provider.listCalendars({ accessToken: "access" })).resolves.toEqual([{ id: "primary", summary: "Personal", primary: true, accessRole: "owner" }, { id: "team", summary: "Team", primary: false, accessRole: "writer" }]);
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain("client");
  });
});
