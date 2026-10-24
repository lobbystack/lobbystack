import { randomUUID } from "node:crypto";

import { oauthSigningSecret, oauthStateDigest, oauthPayloadCurrent, signOAuthPayload, verifyOAuthPayload } from "./signed-oauth-state";

type CalendarOAuthState = { userId: string; businessId: string; issuedAt: number; nonce: string };
type CalendarConnectLinkToken = { businessId: string; issuedAt: number; nonce: string };
type TokenKind = "state" | "link";

/** How long a link from POST /v1/calendars/google/connect works. */
export const CALENDAR_CONNECT_LINK_LIFETIME_MS = 7 * 24 * 60 * 60_000;

const UNCONFIGURED = "Calendar OAuth signing is not configured.";

/** Whether OAuth states and connect links can be signed: they use the dashboard's auth secret. */
export function calendarSigningConfigured(): boolean {
  return Boolean(oauthSigningSecret());
}

export function createCalendarOAuthState(input: Omit<CalendarOAuthState, "issuedAt" | "nonce">): string {
  return signed("state", { ...input, issuedAt: Date.now(), nonce: randomUUID() });
}

// Each kind signs under its own domain, so an OAuth state never passes as a link, or a link as a state.
function signed(kind: TokenKind, payload: Record<string, unknown>): string {
  return signOAuthPayload(`google-calendar:${kind}`, payload, UNCONFIGURED);
}

/** The payload of a v1 token of this kind with a valid signature, or null. */
function verified(kind: TokenKind, value: string): Record<string, unknown> | null {
  return verifyOAuthPayload(`google-calendar:${kind}`, value);
}

/** Domain-separated lookup digest; never persist the bearer value. */
export function calendarOAuthStateDigest(state: string): string {
  return oauthStateDigest("google-calendar", state, UNCONFIGURED);
}

export function verifyCalendarOAuthState(value: string): CalendarOAuthState | null {
  // Cutover intentionally rejects old unversioned states (10-minute lifetime).
  // Users restart authorization; do not restore a public scrypt fallback.
  const state = verified("state", value);
  if (!state || typeof state.userId !== "string" || !state.userId || typeof state.businessId !== "string" || !state.businessId || !oauthPayloadCurrent(state, 10 * 60_000)) return null;
  return state as CalendarOAuthState;
}

/**
 * The link POST /v1/calendars/google/connect returns. It names only the
 * business: whoever opens it signs in, and must be an owner or admin of that
 * business, before Google asks them anything. It works until it expires.
 */
export function createCalendarConnectLink(input: { origin: string; businessId: string }): { url: string; expiresAt: Date } {
  const issuedAt = Date.now();
  const url = new URL("/api/calendar/google/connect", input.origin);
  url.searchParams.set("businessId", input.businessId);
  url.searchParams.set("token", signed("link", { businessId: input.businessId, issuedAt, nonce: randomUUID() }));
  return { url: url.toString(), expiresAt: new Date(issuedAt + CALENDAR_CONNECT_LINK_LIFETIME_MS) };
}

export function verifyCalendarConnectLinkToken(value: string): CalendarConnectLinkToken | null {
  const link = verified("link", value);
  if (!link || typeof link.businessId !== "string" || !link.businessId || !oauthPayloadCurrent(link, CALENDAR_CONNECT_LINK_LIFETIME_MS)) return null;
  return link as CalendarConnectLinkToken;
}
