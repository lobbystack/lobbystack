import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

type CalendarOAuthState = { userId: string; businessId: string; issuedAt: number; nonce: string };

function secret(): string {
  return process.env.BETTER_AUTH_SECRET ?? process.env.INTERNAL_SERVICE_SECRET ?? "";
}

export function createCalendarOAuthState(input: Omit<CalendarOAuthState, "issuedAt" | "nonce">): string {
  if (!secret()) throw new Error("Calendar OAuth signing is not configured.");
  const encoded = Buffer.from(JSON.stringify({ ...input, issuedAt: Date.now(), nonce: randomUUID() })).toString("base64url");
  const signature = createHmac("sha256", secret()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyCalendarOAuthState(value: string): CalendarOAuthState | null {
  const parts = value.split(".");
  if (parts.length !== 2) return null;
  const [encoded, signature] = parts;
  if (!encoded || !signature || !secret()) return null;
  const expected = createHmac("sha256", secret()).update(encoded).digest("base64url");
  if (expected.length !== signature.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null;
  try {
    const state = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as CalendarOAuthState;
    if (typeof state.userId !== "string" || !state.userId || typeof state.businessId !== "string" || !state.businessId || typeof state.nonce !== "string" || !/^[a-f0-9-]{36}$/i.test(state.nonce) || !Number.isFinite(state.issuedAt) || Date.now() - state.issuedAt > 10 * 60_000 || state.issuedAt > Date.now() + 30_000) return null;
    return state;
  } catch {
    return null;
  }
}
