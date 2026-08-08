import type { CalendarProvider } from "../index";

export type GoogleCalendarConfig = {
  accessToken: string;
  calendarId: string;
  apiBaseUrl?: string;
};

export type GoogleCalendarOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  authorizationBaseUrl?: string;
  tokenUrl?: string;
  userInfoUrl?: string;
};

export type GoogleCalendarOAuthTokens = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  externalAccountId: string;
  externalAccountEmail: string | null;
};

export function googleCalendarOAuthConfigFromEnvironment(
  env: Record<string, string | undefined> = process.env,
): GoogleCalendarOAuthConfig | null {
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  const redirectUri = (env.GOOGLE_CALENDAR_OAUTH_REDIRECT_URI ?? `${env.APP_BASE_URL?.replace(/\/$/, "") ?? "http://localhost:3000"}/api/integrations/google/callback`).trim();
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

export function googleCalendarAuthorizationUrl(input: { config: GoogleCalendarOAuthConfig; state: string }): string {
  const url = new URL(input.config.authorizationBaseUrl ?? "https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: input.config.clientId,
    redirect_uri: input.config.redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/userinfo.email",
    state: input.state,
  }).toString();
  return url.toString();
}

export async function exchangeGoogleCalendarCode(input: { config: GoogleCalendarOAuthConfig; code: string }): Promise<GoogleCalendarOAuthTokens> {
  const response = await fetch(input.config.tokenUrl ?? "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code: input.code, client_id: input.config.clientId, client_secret: input.config.clientSecret, redirect_uri: input.config.redirectUri, grant_type: "authorization_code" }),
  });
  if (!response.ok) throw new Error(`Google OAuth token exchange failed with status ${response.status}`);
  const token = (await response.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
  if (!token.access_token) throw new Error("Google OAuth did not return an access token");
  const userInfoResponse = await fetch(input.config.userInfoUrl ?? "https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${token.access_token}` } });
  if (!userInfoResponse.ok) throw new Error(`Google account lookup failed with status ${userInfoResponse.status}`);
  const userInfo = (await userInfoResponse.json()) as { sub?: string; email?: string };
  if (!userInfo.sub) throw new Error("Google account lookup did not return an account id");
  return { accessToken: token.access_token, refreshToken: token.refresh_token ?? null, expiresAt: typeof token.expires_in === "number" ? new Date(Date.now() + token.expires_in * 1_000) : null, externalAccountId: userInfo.sub, externalAccountEmail: userInfo.email ?? null };
}

type GoogleBusyResponse = {
  calendars?: Record<string, { busy?: Array<{ start?: string; end?: string }> }>;
};

type GoogleEventResponse = { id?: string };

export class GoogleCalendarProvider implements CalendarProvider {
  constructor(private readonly config: GoogleCalendarConfig) {}

  private requestHeaders(): HeadersInit {
    return {
      Authorization: `Bearer ${this.config.accessToken}`,
      "content-type": "application/json",
    };
  }

  private baseUrl(): string {
    return (this.config.apiBaseUrl ?? "https://www.googleapis.com/calendar/v3").replace(/\/$/, "");
  }

  async getBusyBlocks(input: { connectionId: string; startsAt: string; endsAt: string }): Promise<Array<{ startsAt: string; endsAt: string }>> {
    const response = await fetch(`${this.baseUrl()}/freeBusy`, {
      method: "POST",
      headers: this.requestHeaders(),
      body: JSON.stringify({
        timeMin: input.startsAt,
        timeMax: input.endsAt,
        items: [{ id: this.config.calendarId }],
      }),
    });
    if (!response.ok) throw new Error(`Google Calendar free/busy request failed with status ${response.status}`);
    const body = (await response.json()) as GoogleBusyResponse;
    return (body.calendars?.[this.config.calendarId]?.busy ?? [])
      .filter((block): block is { start: string; end: string } => Boolean(block.start && block.end))
      .map((block) => ({ startsAt: block.start, endsAt: block.end }));
  }

  async upsertEvent(input: {
    connectionId: string;
    externalEventId?: string;
    title: string;
    startsAt: string;
    endsAt: string;
    description?: string;
  }): Promise<{ externalEventId: string }> {
    const path = input.externalEventId
      ? `/calendars/${encodeURIComponent(this.config.calendarId)}/events/${encodeURIComponent(input.externalEventId)}`
      : `/calendars/${encodeURIComponent(this.config.calendarId)}/events`;
    const response = await fetch(`${this.baseUrl()}${path}`, {
      method: input.externalEventId ? "PATCH" : "POST",
      headers: this.requestHeaders(),
      body: JSON.stringify({
        summary: input.title,
        ...(input.description ? { description: input.description } : {}),
        start: { dateTime: input.startsAt },
        end: { dateTime: input.endsAt },
      }),
    });
    if (!response.ok) throw new Error(`Google Calendar event write failed with status ${response.status}`);
    const body = (await response.json()) as GoogleEventResponse;
    if (!body.id) throw new Error("Google Calendar event response did not include an id");
    return { externalEventId: body.id };
  }
}
