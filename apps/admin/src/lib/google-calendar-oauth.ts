import { randomUUID } from "node:crypto";

import { oauthSigningSecret, oauthStartOriginValid, oauthStateDigest, oauthPayloadCurrent, signOAuthPayload, verifyOAuthPayload } from "./signed-oauth-state";

/** `origin` names the partner's host the connection started on, and is absent on the host's domain. */
type CalendarOAuthState = { userId: string; businessId: string; origin?: string; issuedAt: number; nonce: string };
type CalendarConnectLinkToken = { businessId: string; issuedAt: number; nonce: string };
type TokenKind = "state" | "link";
/** The providers whose OAuth flow these tokens start. Each signs under its own domain. */
export type CalendarOAuthProvider = "google" | "calcom" | "calendly";

/** How long a link from POST /v1/calendars/google/connect works. */
export const CALENDAR_CONNECT_LINK_LIFETIME_MS = 7 * 24 * 60 * 60_000;

const UNCONFIGURED = "Calendar OAuth signing is not configured.";

/** Whether OAuth states and connect links can be signed: they use the dashboard's auth secret. */
export function calendarSigningConfigured(): boolean {
  return Boolean(oauthSigningSecret());
}

/** A state for a connection started on the host's domain, or on the partner's host `origin` names, where its callback finishes. */
export function createCalendarOAuthState(input: { userId: string; businessId: string; origin?: string | null; provider?: CalendarOAuthProvider }): string {
  const { origin, provider = "google", ...rest } = input;
  return signed(provider, "state", { ...rest, ...(origin ? { origin } : {}), issuedAt: Date.now(), nonce: randomUUID() });
}

/** The signing domain of a provider's tokens: a Google state never passes for Cal.com, or the reverse. */
function signingDomain(provider: CalendarOAuthProvider): string {
  return `${provider}-calendar`;
}

/**
 * The PKCE code verifier for a state. It's derived with the signing secret, so
 * it never leaves the server and needs no storing, and a state works once.
 */
export function calendarPkceVerifier(state: string): string {
  return oauthStateDigest("calendar-pkce", state, UNCONFIGURED);
}

// Each kind signs under its own domain, so an OAuth state never passes as a link, or a link as a state.
function signed(provider: CalendarOAuthProvider, kind: TokenKind, payload: Record<string, unknown>): string {
  return signOAuthPayload(`${signingDomain(provider)}:${kind}`, payload, UNCONFIGURED);
}

/** The payload of a v1 token of this kind with a valid signature, or null. */
function verified(provider: CalendarOAuthProvider, kind: TokenKind, value: string): Record<string, unknown> | null {
  return verifyOAuthPayload(`${signingDomain(provider)}:${kind}`, value);
}

/** Domain-separated lookup digest; never persist the bearer value. */
export function calendarOAuthStateDigest(state: string, provider: CalendarOAuthProvider = "google"): string {
  return oauthStateDigest(signingDomain(provider), state, UNCONFIGURED);
}

export function verifyCalendarOAuthState(value: string, provider: CalendarOAuthProvider = "google"): CalendarOAuthState | null {
  // Cutover intentionally rejects old unversioned states (10-minute lifetime).
  // Users restart authorization; do not restore a public scrypt fallback.
  const state = verified(provider, "state", value);
  if (!state || typeof state.userId !== "string" || !state.userId || typeof state.businessId !== "string" || !state.businessId || !oauthStartOriginValid(state.origin) || !oauthPayloadCurrent(state, 10 * 60_000)) return null;
  return state as CalendarOAuthState;
}

/**
 * The link POST /v1/calendars/google/connect, /calcom/connect or /calendly/connect returns. It
 * names only the business: whoever opens it signs in, and must be an owner or
 * admin of that business, before the provider asks them anything. It works
 * until it expires.
 */
export function createCalendarConnectLink(input: { origin: string; businessId: string; provider?: CalendarOAuthProvider }): { url: string; expiresAt: Date } {
  const provider = input.provider ?? "google";
  const issuedAt = Date.now();
  const url = new URL(`/api/calendar/${provider}/connect`, input.origin);
  url.searchParams.set("businessId", input.businessId);
  url.searchParams.set("token", signed(provider, "link", { businessId: input.businessId, issuedAt, nonce: randomUUID() }));
  return { url: url.toString(), expiresAt: new Date(issuedAt + CALENDAR_CONNECT_LINK_LIFETIME_MS) };
}

export function verifyCalendarConnectLinkToken(value: string, provider: CalendarOAuthProvider = "google"): CalendarConnectLinkToken | null {
  const link = verified(provider, "link", value);
  if (!link || typeof link.businessId !== "string" || !link.businessId || !oauthPayloadCurrent(link, CALENDAR_CONNECT_LINK_LIFETIME_MS)) return null;
  return link as CalendarConnectLinkToken;
}
