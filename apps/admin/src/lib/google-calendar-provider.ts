import { GoogleCalendarProvider } from "@lobbystack/providers";

export function googleCalendarProvider(): GoogleCalendarProvider {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) throw new Error("Google Calendar OAuth is not configured.");
  return new GoogleCalendarProvider({ clientId, clientSecret, redirectUri });
}
