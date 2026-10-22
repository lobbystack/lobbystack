import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import { normalizeIP } from "@better-auth/core/utils/ip";
import { and, eq, gt } from "drizzle-orm";

import { verifications } from "@lobbystack/db";
import { InstagramProvider } from "@lobbystack/providers";

import { getAuthDatabase } from "./auth";
import { enforceFixedWindow, fixedWindowLimit, type FixedWindowLimit } from "./fixed-window-limit";

type InstagramOAuthState = { userId: string; businessId: string; issuedAt: number; nonce: string };

const STATE_LIFETIME_MS = 10 * 60_000;
const hour = 60 * 60;

/** Instagram business login, from INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET and INSTAGRAM_REDIRECT_URI. */
export function instagramProvider(): InstagramProvider {
  const appId = process.env.INSTAGRAM_APP_ID;
  const appSecret = process.env.INSTAGRAM_APP_SECRET;
  const redirectUri = process.env.INSTAGRAM_REDIRECT_URI;
  if (!appId || !appSecret || !redirectUri) throw Object.assign(new Error("Instagram isn't set up on this server."), { status: 503, code: "instagram_not_configured" });
  return new InstagramProvider({ appId, appSecret, redirectUri });
}

export function instagramConfigured(): boolean {
  return Boolean(process.env.INSTAGRAM_APP_ID && process.env.INSTAGRAM_APP_SECRET && process.env.INSTAGRAM_REDIRECT_URI && process.env.ENCRYPTION_KEY);
}

function secret(): string {
  return process.env.BETTER_AUTH_SECRET ?? process.env.INTERNAL_SERVICE_SECRET ?? "";
}

// Signed under its own domain, so a Google Calendar state never passes as an Instagram one.
function sign(value: string): string {
  return createHmac("sha256", secret()).update(`instagram:state:${value}`).digest("base64url");
}

export function createInstagramOAuthState(input: { userId: string; businessId: string }): string {
  if (!secret()) throw new Error("Instagram OAuth signing is not configured.");
  const encoded = Buffer.from(JSON.stringify({ ...input, issuedAt: Date.now(), nonce: randomUUID() })).toString("base64url");
  return `v1.${encoded}.${sign(`v1.${encoded}`)}`;
}

export function verifyInstagramOAuthState(value: string): InstagramOAuthState | null {
  if (value.length > 2048 || !secret()) return null;
  const [version, encoded, signature, ...rest] = value.split(".");
  if (rest.length || version !== "v1" || !encoded || !/^[A-Za-z0-9_-]+$/.test(encoded) || !signature || !/^[A-Za-z0-9_-]{43}$/.test(signature)) return null;
  const expected = sign(`${version}.${encoded}`);
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Partial<InstagramOAuthState>;
    const { userId, businessId, issuedAt, nonce } = payload;
    if (typeof userId !== "string" || !userId || typeof businessId !== "string" || !businessId || typeof nonce !== "string" || typeof issuedAt !== "number") return null;
    if (Date.now() - issuedAt > STATE_LIFETIME_MS || issuedAt > Date.now() + 30_000) return null;
    return { userId, businessId, issuedAt, nonce };
  } catch {
    return null;
  }
}

// Only a digest of the state is stored, never the bearer value.
const identifier = (state: string) => `instagram:${createHmac("sha256", secret()).update(`instagram:lookup:${state}`).digest("hex")}`;

export async function storeInstagramOAuthState(state: string): Promise<void> {
  const parsed = verifyInstagramOAuthState(state);
  if (!parsed) throw new Error("Invalid Instagram authorization state.");
  await getAuthDatabase().db.insert(verifications).values({ identifier: identifier(state), value: `${parsed.userId}:${parsed.businessId}`, expiresAt: new Date(parsed.issuedAt + STATE_LIFETIME_MS) });
}

/** Uses up the state, so a callback can't be replayed. */
export async function consumeInstagramOAuthState(state: string, userId: string, businessId: string): Promise<boolean> {
  const rows = await getAuthDatabase().db.delete(verifications).where(and(eq(verifications.identifier, identifier(state)), eq(verifications.value, `${userId}:${businessId}`), gt(verifications.expiresAt, new Date()))).returning({ id: verifications.id });
  return rows.length === 1;
}

/** Bounds the login flow per operator, business and trusted client IP. */
export async function enforceInstagramOAuthRateLimits(input: { operation: "start" | "callback"; userId?: string | undefined; businessId?: string | undefined; ip?: string | undefined }) {
  const limits: FixedWindowLimit[] = [];
  const limit = (name: string, key: string, maximum: number, reason: string) => fixedWindowLimit("instagram-oauth", name, key, maximum, hour, reason);
  if (input.ip) limits.push(limit("ip-hour", `${input.operation}:${normalizeIP(input.ip, { ipv6Subnet: 64 })}`, input.userId ? 30 : 120, "rate_limit_ip_hour"));
  else if (!input.userId) limits.push(limit("ip-unattributed-hour", input.operation, 600, "rate_limit_ip_unattributed"));
  if (input.userId) limits.push(limit("user-hour", `${input.operation}:${input.userId}`, 20, "rate_limit_user_hour"));
  if (input.businessId) limits.push(limit("business-hour", `${input.operation}:${input.businessId}`, 60, "rate_limit_business_hour"));
  return await enforceFixedWindow(limits);
}
