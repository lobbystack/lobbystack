import { createHmac, timingSafeEqual } from "node:crypto";

type CalendarOAuthState = { userId: string; businessId: string; issuedAt: number };

function secret(): string {
  return process.env.BETTER_AUTH_SECRET ?? process.env.INTERNAL_SERVICE_SECRET ?? "";
}

export function createCalendarOAuthState(input: Omit<CalendarOAuthState, "issuedAt">): string {
  if (!secret()) throw new Error("Calendar OAuth signing is not configured.");
  const encoded = Buffer.from(JSON.stringify({ ...input, issuedAt: Date.now() })).toString("base64url");
  const signature = createHmac("sha256", secret()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyCalendarOAuthState(value: string): CalendarOAuthState | null {
  const [encoded, signature] = value.split(".");
  if (!encoded || !signature || !secret()) return null;
  const expected = createHmac("sha256", secret()).update(encoded).digest("base64url");
  if (expected.length !== signature.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null;
  try {
    const state = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as CalendarOAuthState;
    if (!state.userId || !state.businessId || !Number.isFinite(state.issuedAt) || Date.now() - state.issuedAt > 10 * 60_000) return null;
    return state;
  } catch {
    return null;
  }
}
