import { randomUUID } from "node:crypto";

import { normalizeIP } from "@better-auth/core/utils/ip";
import { and, eq, gt } from "drizzle-orm";

import { verifications } from "@lobbystack/db";
import { InstagramProvider } from "@lobbystack/providers";

import { getAuthDatabase } from "./auth";
import { enforceFixedWindow, fixedWindowLimit, type FixedWindowLimit } from "./fixed-window-limit";
import { oauthStateDigest, oauthPayloadCurrent, signOAuthPayload, verifyOAuthPayload } from "./signed-oauth-state";

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

const UNCONFIGURED = "Instagram OAuth signing is not configured.";

export function createInstagramOAuthState(input: { userId: string; businessId: string }): string {
  return signOAuthPayload("instagram:state", { ...input, issuedAt: Date.now(), nonce: randomUUID() }, UNCONFIGURED);
}

export function verifyInstagramOAuthState(value: string): InstagramOAuthState | null {
  const state = verifyOAuthPayload("instagram:state", value);
  if (!state || typeof state.userId !== "string" || !state.userId || typeof state.businessId !== "string" || !state.businessId || !oauthPayloadCurrent(state, STATE_LIFETIME_MS)) return null;
  return state as InstagramOAuthState;
}

const identifier = (state: string) => `instagram:${oauthStateDigest("instagram", state, UNCONFIGURED)}`;

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
