import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

import { cimd } from "@better-auth/cimd";
import { oauthProvider } from "@better-auth/oauth-provider";
import type { BetterAuthPlugin } from "better-auth";

import { createCimdFetch, hashOAuthToken, isCimdUrlAllowed, OAUTH_ACCESS_TOKEN_PREFIX, OAUTH_REFRESH_TOKEN_PREFIX } from "@lobbystack/domain";
import { oauthAccessTokens, oauthClientAssertions, oauthClientResources, oauthClients, oauthConsents, oauthRefreshTokens, oauthResources } from "@lobbystack/db";

import { MCP_OAUTH_SCOPES, mcpResourceUrl } from "./mcp/oauth-config";

// OAuth 2.1 authorization server for MCP clients, built on Better Auth's
// oauth-provider plugin. Clients register with Client ID Metadata Documents
// (the cimd plugin) or dynamic client registration; every flow uses PKCE;
// access tokens are opaque and short-lived, refresh tokens rotate.
//
// A grant is tied to one business. The consent page asks the owner to pick
// it, and the consent handler runs Better Auth's consent endpoint inside
// `withSelectedBusiness`, which is how consentReferenceId learns the choice.
// Outside that call no business is selected, so an authorize request never
// matches an earlier consent and always shows the consent page.

export const OAUTH_LOGIN_PATH = "/oauth/sign-in";
export const OAUTH_CONSENT_PATH = "/oauth/consent";

const ACCESS_TOKEN_SECONDS = 60 * 60;
const REFRESH_TOKEN_SECONDS = 30 * 24 * 60 * 60;

const selectedBusiness = new AsyncLocalStorage<{ businessId: string }>();

/** Runs Better Auth's consent endpoint with the business the owner picked on the consent page. */
export async function withSelectedBusiness<T>(businessId: string, run: () => Promise<T>): Promise<T> {
  return await selectedBusiness.run({ businessId }, run);
}

export function consentReferenceId(): string {
  // A value no stored consent has, so the plugin asks for consent again.
  return selectedBusiness.getStore()?.businessId ?? `unselected:${randomUUID()}`;
}

/** Drizzle tables for the plugin models, keyed by model name for the Better Auth adapter. */
export const oauthProviderSchema = {
  oauthClient: oauthClients,
  oauthResource: oauthResources,
  oauthClientResource: oauthClientResources,
  oauthRefreshToken: oauthRefreshTokens,
  oauthAccessToken: oauthAccessTokens,
  oauthConsent: oauthConsents,
  oauthClientAssertion: oauthClientAssertions,
};

/**
 * Plugin endpoints LobbyStack serves. Everything else the plugin adds under
 * /oauth2 and /admin/oauth2 (client and consent management, introspection,
 * userinfo, logout) is turned off: grants are managed in the dashboard.
 */
const allowedOAuthPaths = new Set([
  "/oauth2/authorize",
  "/oauth2/consent",
  "/oauth2/continue",
  "/oauth2/token",
  "/oauth2/revoke",
  "/oauth2/introspect",
  "/oauth2/register",
  "/oauth2/public-client",
]);

export function isDisabledOAuthEndpoint(path?: string): boolean {
  if (!path) return false;
  if (path.startsWith("/admin/oauth2")) return true;
  return path.startsWith("/oauth2/") && !allowedOAuthPaths.has(path);
}

function isLoopbackRedirect(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  } catch {
    return false;
  }
}

/**
 * Local MCP clients (Claude Code, Cursor, the MCP Inspector) register loopback
 * redirect URIs without saying they are native apps. RFC 8252 treats a
 * loopback redirect as a native app, but the plugin defaults to "web", which
 * forbids them. When every redirect URI is loopback and the client didn't
 * set application_type, register it as native. Returns the rewritten body,
 * or null to leave the request alone.
 */
export function registrationWithApplicationType(path: string | undefined, body: unknown): Record<string, unknown> | null {
  if (path !== "/oauth2/register" || !body || typeof body !== "object") return null;
  const registration = body as Record<string, unknown>;
  const redirects = registration.redirect_uris;
  if (registration.application_type !== undefined || !Array.isArray(redirects) || redirects.length === 0 || !redirects.every(isLoopbackRedirect)) return null;
  return { ...registration, application_type: "native" };
}

export function mcpOAuthPlugins(): BetterAuthPlugin[] {
  const scopes = [...MCP_OAUTH_SCOPES];
  // The plugins' endpoint types don't satisfy BetterAuthPlugin under this
  // repo's exactOptionalPropertyTypes; the runtime shape is what betterAuth expects.
  return [
    oauthProvider({
      loginPage: OAUTH_LOGIN_PATH,
      consentPage: OAUTH_CONSENT_PATH,
      scopes,
      // Opaque tokens: every MCP request checks the token row, so revocation takes effect at once.
      disableJwtPlugin: true,
      storeTokens: { hash: (token, type) => hashOAuthToken(token, type) },
      prefix: { opaqueAccessToken: OAUTH_ACCESS_TOKEN_PREFIX, refreshToken: OAUTH_REFRESH_TOKEN_PREFIX },
      accessTokenExpiresIn: ACCESS_TOKEN_SECONDS,
      refreshTokenExpiresIn: REFRESH_TOKEN_SECONDS,
      // A rotated refresh token used again is treated as theft and ends the token family.
      refreshTokenReuseInterval: 0,
      grantTypes: ["authorization_code", "refresh_token"],
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
      clientRegistrationDefaultScopes: scopes,
      clientRegistrationRequirePKCE: true,
      resources: [{ identifier: mcpResourceUrl(), name: "LobbyStack MCP server", allowedScopes: scopes }],
      // One resource, open to every registered client.
      enforcePerClientResources: false,
      postLogin: {
        // The business is picked on the consent page, not on a separate page.
        page: OAUTH_CONSENT_PATH,
        shouldRedirect: async () => false,
        consentReferenceId: () => consentReferenceId(),
      },
      // Nobody manages OAuth clients through the plugin's endpoints.
      clientPrivileges: async () => false,
      resourcePrivileges: async () => false,
    }),
    cimd({
      fetchClientMetadataResource: createCimdFetch(),
      isMetadataDocumentUrlAllowed: (url) => isCimdUrlAllowed(url),
      metadataProfile: "mcp-2026-07-28",
      metadataRevalidationInterval: "60m",
      maxCacheEntries: 500,
    }),
  ] as unknown as BetterAuthPlugin[];
}
