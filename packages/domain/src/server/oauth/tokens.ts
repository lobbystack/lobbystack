import { createHmac } from "node:crypto";

import { sql } from "drizzle-orm";

import { isApiKeyScope, type ApiKeyScope } from "@lobbystack/shared";

import type { DomainContext } from "../context";

// OAuth tokens for MCP clients. Better Auth issues them and stores only an
// HMAC of each one (see storeTokens in the admin auth setup); the MCP endpoint
// hashes a presented token the same way and resolves it through
// app.resolve_oauth_access_token.

/** Prefixes on issued tokens, so a bearer value can be routed without a database lookup and secret scanners can spot them. */
export const OAUTH_ACCESS_TOKEN_PREFIX = "lsa_";
export const OAUTH_REFRESH_TOKEN_PREFIX = "lsr_";

const PEPPER_LABEL = "lobbystack:oauth-token-hash:v1";

/** Derived from ENCRYPTION_KEY like the API key pepper, with its own label so the two hashes never coincide. */
export function oauthTokenPepper(environment: Readonly<Record<string, string | undefined>> = process.env): Buffer {
  const secret = environment.ENCRYPTION_KEY?.trim();
  if (!secret && environment.NODE_ENV === "production") throw new Error("ENCRYPTION_KEY is required to hash OAuth tokens.");
  return createHmac("sha256", secret || "development-only-oauth-token-pepper").update(PEPPER_LABEL).digest();
}

/** The stored form of an access token, refresh token or authorization code (without its prefix). */
export function hashOAuthToken(token: string, type: string, pepper: Buffer = oauthTokenPepper()): string {
  return createHmac("sha256", pepper).update(`${type}:${token}`).digest("hex");
}

export function isOAuthAccessToken(value: string): boolean {
  return value.startsWith(OAUTH_ACCESS_TOKEN_PREFIX) && value.length > OAUTH_ACCESS_TOKEN_PREFIX.length && value.length <= 512;
}

export type ResolvedOAuthGrant = {
  businessId: string;
  grantId: string;
  userId: string;
  clientId: string;
  clientName: string | null;
  scopes: ApiKeyScope[];
  resources: string[];
  expiresAt: Date;
};

/**
 * Maps an access token to its grant. Returns null for anything that is not a
 * live token of an active grant held by a current owner or admin.
 */
export async function resolveOAuthAccessToken(context: DomainContext, token: string): Promise<ResolvedOAuthGrant | null> {
  if (!isOAuthAccessToken(token)) return null;
  const hash = hashOAuthToken(token.slice(OAUTH_ACCESS_TOKEN_PREFIX.length), "access_token");
  const result = await context.db.execute<{ business_id: string; grant_id: string; user_id: string; client_id: string; client_name: string | null; scopes: string[] | null; resources: string[] | null; expires_at: Date | string }>(
    sql`select business_id, grant_id, user_id, client_id, client_name, scopes, resources, expires_at from app.resolve_oauth_access_token(${hash})`,
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    businessId: row.business_id,
    grantId: row.grant_id,
    userId: row.user_id,
    clientId: row.client_id,
    clientName: row.client_name,
    scopes: (row.scopes ?? []).filter(isApiKeyScope),
    resources: row.resources ?? [],
    expiresAt: new Date(row.expires_at),
  };
}

/** Records use of a grant, at most once a minute, for the connected apps list. */
export async function touchOAuthGrant(context: DomainContext, grantId: string): Promise<void> {
  await context.db.execute(sql`select app.touch_oauth_grant(${grantId})`);
}
