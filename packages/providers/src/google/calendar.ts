import { assertCertificationCalendar } from "@lobbystack/shared";

export class GoogleOAuthRefreshError extends Error {
  constructor(readonly reconnectRequired: boolean) {
    super(reconnectRequired ? "Google Calendar authorization requires reconnection." : "Google Calendar token refresh is temporarily unavailable.");
    this.name = "GoogleOAuthRefreshError";
  }
}

export type GoogleCalendarConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export class GoogleCalendarProvider {
  constructor(private readonly config: GoogleCalendarConfig) {}

  buildAuthorizationUrl(input: { state: string; scopes?: string[] }): string {
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", this.config.clientId);
    url.searchParams.set("redirect_uri", this.config.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("scope", [...new Set(["openid", "email", ...(input.scopes ?? ["https://www.googleapis.com/auth/calendar"])])].join(" "));
    url.searchParams.set("state", input.state);
    return url.toString();
  }

  async exchangeCode(code: string): Promise<{ accessToken: string; refreshToken?: string; expiresIn: number }> {
    const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: this.config.clientId, client_secret: this.config.clientSecret, redirect_uri: this.config.redirectUri, grant_type: "authorization_code" }) });
    if (!response.ok) {
      throw new Error(`Google OAuth token exchange failed with status ${response.status}.`);
    }
    const payload = (await response.json()) as { access_token: string; refresh_token?: string; expires_in: number };
    if (!payload.access_token || !Number.isFinite(payload.expires_in) || payload.expires_in <= 0) throw new Error("Google OAuth returned an invalid token response.");
    return { accessToken: payload.access_token, ...(payload.refresh_token ? { refreshToken: payload.refresh_token } : {}), expiresIn: payload.expires_in };
  }

  async refreshAccessToken(input: { refreshToken: string }): Promise<{ accessToken: string; expiresIn: number; refreshToken?: string }> {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", signal: AbortSignal.timeout(15_000),
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: input.refreshToken, client_id: this.config.clientId, client_secret: this.config.clientSecret }),
    });
    const payload = await response.json().catch(() => ({})) as { access_token?: string; expires_in?: number; refresh_token?: string; error?: string };
    if (!response.ok) throw new GoogleOAuthRefreshError(payload.error === "invalid_grant" || payload.error === "invalid_client");
    if (!payload.access_token || typeof payload.expires_in !== "number" || !Number.isFinite(payload.expires_in) || payload.expires_in <= 0) throw new GoogleOAuthRefreshError(false);
    return { accessToken: payload.access_token, expiresIn: payload.expires_in, ...(payload.refresh_token ? { refreshToken: payload.refresh_token } : {}) };
  }

  async getAccount(input: { accessToken: string }): Promise<{ id: string; email?: string }> {
    const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { authorization: `Bearer ${input.accessToken}` } });
    if (!response.ok) {
      throw new Error(`Google account lookup failed with status ${response.status}.`);
    }
    const payload = (await response.json()) as { sub?: string; email?: string };
    if (!payload.sub) throw new Error("Google account lookup did not return an account id.");
    return { id: payload.sub, ...(payload.email ? { email: payload.email } : {}) };
  }

  async listCalendars(input: { accessToken: string }): Promise<Array<{ id: string; summary: string; primary: boolean; accessRole?: string }>> {
    const response = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", { headers: { authorization: `Bearer ${input.accessToken}` } });
    if (!response.ok) throw new Error(`Google Calendar discovery failed with status ${response.status}.`);
    const payload = (await response.json()) as { items?: Array<{ id?: string; summary?: string; primary?: boolean; accessRole?: string }> };
    return (payload.items ?? []).flatMap((calendar) => calendar.id && calendar.summary ? [{ id: calendar.id, summary: calendar.summary, primary: calendar.primary === true, ...(calendar.accessRole ? { accessRole: calendar.accessRole } : {}) }] : []);
  }

  async getBusyBlocks(input: { accessToken: string; calendarId: string; startsAt: string; endsAt: string }): Promise<Array<{ startsAt: string; endsAt: string }>> {
    assertCertificationCalendar(input.calendarId);
    const response = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
      method: "POST",
      headers: { authorization: `Bearer ${input.accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ timeMin: input.startsAt, timeMax: input.endsAt, items: [{ id: input.calendarId }] }),
    });
    if (!response.ok) {
      throw new Error(`Google Calendar availability request failed with status ${response.status}.`);
    }
    const payload = (await response.json()) as { calendars?: Record<string, { errors?: unknown[]; busy?: Array<{ start?: string; end?: string }> }> };
    const calendar = payload.calendars?.[input.calendarId];
    if (!calendar || calendar.errors?.length || !Array.isArray(calendar.busy)) throw new Error("Google Calendar availability could not be verified.");
    return calendar.busy.map((block) => {
      if (!block.start || !block.end || !Number.isFinite(Date.parse(block.start)) || !Number.isFinite(Date.parse(block.end)) || Date.parse(block.end) <= Date.parse(block.start)) throw new Error("Google Calendar returned an invalid busy interval.");
      return { startsAt: block.start, endsAt: block.end };
    });
  }

  async upsertEvent(input: { accessToken: string; calendarId: string; eventId?: string; clientEventId?: string; title: string; startsAt: string; endsAt: string; description?: string }): Promise<{ externalEventId: string }> {
    assertCertificationCalendar(input.calendarId);
    const method = input.eventId ? "PUT" : "POST";
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(input.calendarId)}/events${input.eventId ? `/${encodeURIComponent(input.eventId)}` : ""}`;
    const response = await fetch(url, { method, headers: { authorization: `Bearer ${input.accessToken}`, "content-type": "application/json" }, body: JSON.stringify({ ...(input.clientEventId && !input.eventId ? { id: input.clientEventId } : {}), summary: input.title, description: input.description, start: { dateTime: input.startsAt }, end: { dateTime: input.endsAt } }) });
    if (!response.ok) {
      if (!input.eventId && input.clientEventId && response.status === 409) return await this.upsertEvent({ ...input, eventId: input.clientEventId });
      throw new Error(`Google Calendar event write failed with status ${response.status}.`);
    }
    const payload = (await response.json()) as { id: string };
    return { externalEventId: payload.id };
  }

  async deleteEvent(input: { accessToken: string; calendarId: string; eventId: string }): Promise<void> {
    assertCertificationCalendar(input.calendarId);
    const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(input.calendarId)}/events/${encodeURIComponent(input.eventId)}`, { method: "DELETE", headers: { authorization: `Bearer ${input.accessToken}` }, signal: AbortSignal.timeout(15_000) });
    if (!response.ok && response.status !== 404 && response.status !== 410) throw new Error(`Google Calendar event deletion failed with status ${response.status}.`);
  }
}
