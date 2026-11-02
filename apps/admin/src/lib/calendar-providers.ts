import { CalcomCalendarProvider, CalendlyCalendarProvider, calcomCalendarConfigFromEnv, calcomCalendarConfigProblem, calendlyCalendarConfigFromEnv, calendlyCalendarConfigProblem, type CalendarProvider } from "@lobbystack/providers";

import { googleCalendarProvider } from "./google-calendar-provider";

/** Whether this deployment can connect `provider`: its OAuth client is set, and ENCRYPTION_KEY for the tokens the callback stores. */
export function calendarProviderConfigured(provider: string): boolean {
  if (!process.env.ENCRYPTION_KEY) return false;
  if (provider === "google") return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI);
  if (provider === "calcom") return calcomCalendarConfigFromEnv() !== null;
  if (provider === "calendly") return calendlyCalendarConfigFromEnv() !== null;
  return false;
}

export function calcomCalendarProvider(): CalcomCalendarProvider {
  const config = calcomCalendarConfigFromEnv();
  if (!config) throw new Error(calcomCalendarConfigProblem() ?? "Cal.com OAuth is not configured.");
  return new CalcomCalendarProvider(config);
}

export function calendlyCalendarProvider(): CalendlyCalendarProvider {
  const config = calendlyCalendarConfigFromEnv();
  if (!config) throw new Error(calendlyCalendarConfigProblem() ?? "Calendly OAuth is not configured.");
  return new CalendlyCalendarProvider(config);
}

/** The provider a connection was made with. Throws when this deployment doesn't have it set up. */
export function calendarProvider(provider: string): CalendarProvider {
  if (provider === "google") return googleCalendarProvider();
  if (provider === "calcom") return calcomCalendarProvider();
  if (provider === "calendly") return calendlyCalendarProvider();
  throw new Error(`Calendar provider ${provider} is not configured.`);
}
