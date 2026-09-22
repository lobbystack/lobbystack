import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

type CalendarOAuthState = { userId: string; businessId: string; issuedAt: number; nonce: string };

function secret(): string {
  return process.env.BETTER_AUTH_SECRET ?? process.env.INTERNAL_SERVICE_SECRET ?? "";
}

export function createCalendarOAuthState(input: Omit<CalendarOAuthState, "issuedAt" | "nonce">): string {
  if (!secret()) throw new Error("Calendar OAuth signing is not configured.");
  const encoded = Buffer.from(JSON.stringify({ ...input, issuedAt: Date.now(), nonce: randomUUID() })).toString("base64url");
  const signature = sign(`v1.${encoded}`);
  return `v1.${encoded}.${signature}`;
}

function sign(value: string): string {
  return createHmac("sha256", secret()).update(`google-calendar:state:${value}`).digest("base64url");
}

/** Domain-separated lookup digest; never persist the bearer value. */
export function calendarOAuthStateDigest(state: string): string {
  if (!secret()) throw new Error("Calendar OAuth signing is not configured.");
  return createHmac("sha256", secret()).update(`google-calendar:lookup:${state}`).digest("hex");
}

export function verifyCalendarOAuthState(value: string): CalendarOAuthState | null {
  // Cutover intentionally rejects old unversioned states (10-minute lifetime).
  // Users restart authorization; do not restore a public scrypt fallback.
  if (value.length > 2048) return null;
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [version, encoded, signature] = parts;
  if (version !== "v1" || !encoded || !/^[A-Za-z0-9_-]+$/.test(encoded) || !signature || !/^[A-Za-z0-9_-]{43}$/.test(signature) || !secret()) return null;
  const expected = sign(`${version}.${encoded}`);
  if (expected.length !== signature.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null;
  try {
    const state = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as CalendarOAuthState;
    if (typeof state.userId !== "string" || !state.userId || typeof state.businessId !== "string" || !state.businessId || typeof state.nonce !== "string" || !/^[a-f0-9-]{36}$/i.test(state.nonce) || !Number.isFinite(state.issuedAt) || Date.now() - state.issuedAt > 10 * 60_000 || state.issuedAt > Date.now() + 30_000) return null;
    return state;
  } catch {
    return null;
  }
}
