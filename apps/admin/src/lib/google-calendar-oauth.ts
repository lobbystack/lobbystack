import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

type CalendarOAuthState = { userId: string; businessId: string; issuedAt: number; nonce: string };
type CalendarConnectLinkToken = { businessId: string; issuedAt: number; nonce: string };
type TokenKind = "state" | "link";

/** How long a link from POST /v1/calendars/google/connect works. */
export const CALENDAR_CONNECT_LINK_LIFETIME_MS = 7 * 24 * 60 * 60_000;

function secret(): string {
  return process.env.BETTER_AUTH_SECRET ?? process.env.INTERNAL_SERVICE_SECRET ?? "";
}

/** Whether OAuth states and connect links can be signed: they use the dashboard's auth secret. */
export function calendarSigningConfigured(): boolean {
  return Boolean(secret());
}

export function createCalendarOAuthState(input: Omit<CalendarOAuthState, "issuedAt" | "nonce">): string {
  return signed("state", { ...input, issuedAt: Date.now(), nonce: randomUUID() });
}

// Each kind signs under its own domain, so an OAuth state never passes as a link, or a link as a state.
function sign(kind: TokenKind, value: string): string {
  return createHmac("sha256", secret()).update(`google-calendar:${kind}:${value}`).digest("base64url");
}

function signed(kind: TokenKind, payload: Record<string, unknown>): string {
  if (!secret()) throw new Error("Calendar OAuth signing is not configured.");
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `v1.${encoded}.${sign(kind, `v1.${encoded}`)}`;
}

/** The payload of a v1 token of this kind with a valid signature, or null. */
function verified(kind: TokenKind, value: string): Record<string, unknown> | null {
  if (value.length > 2048) return null;
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [version, encoded, signature] = parts;
  if (version !== "v1" || !encoded || !/^[A-Za-z0-9_-]+$/.test(encoded) || !signature || !/^[A-Za-z0-9_-]{43}$/.test(signature) || !secret()) return null;
  const expected = sign(kind, `${version}.${encoded}`);
  if (expected.length !== signature.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as unknown;
    return payload && typeof payload === "object" ? payload as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

/** A fresh nonce, and an issue time within the lifetime and not ahead of the clock by more than 30 seconds. */
function current(payload: Record<string, unknown>, lifetimeMs: number): boolean {
  const { nonce, issuedAt } = payload;
  return typeof nonce === "string" && /^[a-f0-9-]{36}$/i.test(nonce) && typeof issuedAt === "number" && Number.isFinite(issuedAt) && Date.now() - issuedAt <= lifetimeMs && issuedAt <= Date.now() + 30_000;
}

/** Domain-separated lookup digest; never persist the bearer value. */
export function calendarOAuthStateDigest(state: string): string {
  if (!secret()) throw new Error("Calendar OAuth signing is not configured.");
  return createHmac("sha256", secret()).update(`google-calendar:lookup:${state}`).digest("hex");
}

export function verifyCalendarOAuthState(value: string): CalendarOAuthState | null {
  // Cutover intentionally rejects old unversioned states (10-minute lifetime).
  // Users restart authorization; do not restore a public scrypt fallback.
  const state = verified("state", value);
  if (!state || typeof state.userId !== "string" || !state.userId || typeof state.businessId !== "string" || !state.businessId || !current(state, 10 * 60_000)) return null;
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
  if (!link || typeof link.businessId !== "string" || !link.businessId || !current(link, CALENDAR_CONNECT_LINK_LIFETIME_MS)) return null;
  return link as CalendarConnectLinkToken;
}
