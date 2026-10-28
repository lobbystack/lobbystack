import { createMcpHandler, type AuthInfo, type McpHttpHandler } from "@modelcontextprotocol/server";

import {
  bearerToken,
  isOAuthAccessToken,
  isPlatformKeyToken,
  resolveApiKey,
  resolveOAuthAccessToken,
  resolvePartnerOAuthAccessToken,
  resolvePlatformKey,
  touchApiKeyLastUsed,
  touchOAuthGrant,
  touchPlatformKeyLastUsed,
  type ApiCaller,
  type DomainContext,
  type PartnerPlatformKey,
  type PartnerSubject,
  type ResolvedApiKey,
  type ResolvedOAuthGrant,
  type ResolvedPartnerOAuthGrant,
  type ResolvedPlatformKey,
} from "@lobbystack/domain";
import { isApiKeyScope, keyHasScope, type ApiErrorCode, type ApiKeyScope } from "@lobbystack/shared";

import { runAfterResponse } from "../after-response";
import { configuredAppOrigins } from "../app-origins";
import { createWorkerDomainContext } from "../domain-context";
import { enforceApiRateLimit } from "../public-api/rate-limit";
import { mcpBearerChallenge, mcpResourceUrl, tokenAudienceMatches } from "./oauth-config";
import { partnerMcpTools } from "./partner-tools";
import { createLobbyStackMcpServer, type McpPrincipal, type McpServerDependencies } from "./server";
import { mcpTools } from "./tools";

// HTTP entry for /api/mcp: Streamable HTTP, stateless. Callers authenticate
// with a LobbyStack API key (`Bearer lsk_...`), an OAuth access token issued
// to an MCP client (`Bearer lsa_...`), or a partner's platform key (`Bearer
// lsp_...`). A per-business key or a business grant picks one business. A
// partner's platform key or an agency grant acts for the partner, and names
// the business on each per-business tool call. Either way the scopes pick the
// tools. The host's own platform keys, from PLATFORM_API_KEYS, are refused.
// Keys and tokens never reach logs: logs and audit rows carry the key id or
// the grant id.

export type McpHandlerDependencies = Partial<McpServerDependencies> & {
  resolveKey?: (key: string) => Promise<ResolvedApiKey | null>;
  touchKey?: (key: ResolvedApiKey) => Promise<void>;
  resolveGrant?: (token: string) => Promise<ResolvedOAuthGrant | null>;
  resolvePartnerGrant?: (token: string) => Promise<ResolvedPartnerOAuthGrant | null>;
  touchGrant?: (grantId: string) => Promise<void>;
  resolvePlatformKey?: (key: string) => Promise<ResolvedPlatformKey | null>;
  touchPlatformKey?: (key: ResolvedPlatformKey) => Promise<void>;
};

const businessToolScopes = [...new Set(mcpTools.map((entry) => entry.scope))];
const partnerToolScopes = [...new Set([...businessToolScopes, ...partnerMcpTools.map((entry) => entry.scope)])];

function jsonError(status: number, code: ApiErrorCode, message: string, headers: Record<string, string> = {}): Response {
  return Response.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

/**
 * Browser origins that may call /api/mcp: the configured app URLs only. The
 * request's own URL and Host are never trusted, because a DNS-rebinding page
 * controls both.
 */
export function trustedMcpOrigins(environment: Readonly<Record<string, string | undefined>> = process.env): Set<string> {
  return new Set(configuredAppOrigins(environment, ["SITE_URL", "NEXT_PUBLIC_SITE_URL"]));
}

type VerifiedCredential =
  | { kind: "api_key"; key: ResolvedApiKey }
  | { kind: "oauth"; grant: ResolvedOAuthGrant }
  | { kind: "platform_key"; key: PartnerPlatformKey }
  | { kind: "partner_oauth"; grant: ResolvedPartnerOAuthGrant };

function principalFor(credential: VerifiedCredential): McpPrincipal {
  switch (credential.kind) {
    case "api_key": {
      const { key } = credential;
      return { kind: "business", caller: { businessId: key.businessId, apiKeyId: key.apiKeyId, actor: "mcp" }, scopes: key.scopes, logFields: { api_key_id: key.apiKeyId } };
    }
    case "oauth": {
      const { grant } = credential;
      return { kind: "business", caller: { businessId: grant.businessId, grantId: grant.grantId, userId: grant.userId, actor: "mcp" }, scopes: grant.scopes, logFields: { oauth_grant_id: grant.grantId, oauth_client_id: grant.clientId } };
    }
    case "platform_key": {
      const { key } = credential;
      // A key shares its rate limit with its REST requests.
      return { kind: "partner", subject: key, scopes: key.scopes, principalId: `platform:${key.platformKeyId}`, logFields: { platform_key_id: key.platformKeyId, partner_id: key.partnerId } };
    }
    case "partner_oauth": {
      const { grant } = credential;
      const subject: PartnerSubject = { kind: "member", partnerId: grant.partnerId, userId: grant.userId, grantId: grant.grantId, scopes: grant.scopes };
      return { kind: "partner", subject, scopes: grant.scopes, principalId: `grant:${grant.grantId}`, logFields: { oauth_grant_id: grant.grantId, oauth_client_id: grant.clientId, partner_id: grant.partnerId } };
    }
  }
}

function credentialId(credential: VerifiedCredential): string {
  switch (credential.kind) {
    case "api_key": return `api_key:${credential.key.apiKeyId}`;
    case "platform_key": return `platform_key:${credential.key.platformKeyId}`;
    default: return `oauth_grant:${credential.grant.grantId}`;
  }
}

// The SDK hands AuthInfo to the per-request server factory. It carries ids
// only; the secret stays in this module.
function authInfoFor(credential: VerifiedCredential): AuthInfo {
  const principal = principalFor(credential);
  const extra = { principal };
  if (credential.kind === "api_key") return { token: credentialId(credential), clientId: credential.key.apiKeyId, scopes: [...principal.scopes], extra };
  if (credential.kind === "platform_key") return { token: credentialId(credential), clientId: credential.key.platformKeyId, scopes: [...principal.scopes], extra };
  return {
    token: credentialId(credential),
    clientId: credential.grant.clientId,
    scopes: [...principal.scopes],
    expiresAt: Math.floor(credential.grant.expiresAt.getTime() / 1000),
    resource: new URL(mcpResourceUrl()),
    extra,
  };
}

function principalFromAuthInfo(authInfo: AuthInfo | undefined): McpPrincipal {
  const principal = authInfo?.extra?.principal as McpPrincipal | undefined;
  if (!principal || !principal.logFields) throw new Error("The MCP handler ran without a verified credential.");
  const scopes = authInfo!.scopes.filter(isApiKeyScope) as ApiKeyScope[];
  if (principal.kind === "business") {
    const caller = principal.caller as ApiCaller | undefined;
    if (!caller || typeof caller.businessId !== "string") throw new Error("The MCP handler ran without a verified credential.");
    return { ...principal, scopes };
  }
  return { ...principal, scopes };
}

export function createLobbyStackMcpHttpHandler(dependencies: McpHandlerDependencies = {}): (request: Request) => Promise<Response> {
  const serverDependencies: McpServerDependencies = {
    context: dependencies.context ?? (createWorkerDomainContext as () => DomainContext),
    rateLimit: dependencies.rateLimit ?? enforceApiRateLimit,
    ...(dependencies.operations ? { operations: dependencies.operations } : {}),
    ...(dependencies.runIdempotent ? { runIdempotent: dependencies.runIdempotent } : {}),
    ...(dependencies.log ? { log: dependencies.log } : {}),
    ...(dependencies.partnerContext ? { partnerContext: dependencies.partnerContext } : {}),
    ...(dependencies.partnerOperations ? { partnerOperations: dependencies.partnerOperations } : {}),
    ...(dependencies.storage ? { storage: dependencies.storage } : {}),
    ...(dependencies.partnerLimit ? { partnerLimit: dependencies.partnerLimit } : {}),
    ...(dependencies.partnerBusinessCaller ? { partnerBusinessCaller: dependencies.partnerBusinessCaller } : {}),
  };
  const resolveKey = dependencies.resolveKey ?? (async (value: string) => await resolveApiKey(serverDependencies.context(), value));
  const resolveGrant = dependencies.resolveGrant ?? (async (value: string) => await resolveOAuthAccessToken(serverDependencies.context(), value));
  const resolvePartnerGrant = dependencies.resolvePartnerGrant ?? (async (value: string) => await resolvePartnerOAuthAccessToken(serverDependencies.context(), value));
  const touchKey = dependencies.touchKey ?? (async (resolved: ResolvedApiKey) => await touchApiKeyLastUsed(serverDependencies.context(), resolved));
  const touchGrant = dependencies.touchGrant ?? (async (grantId: string) => await touchOAuthGrant(serverDependencies.context(), grantId));
  const findPlatformKey = dependencies.resolvePlatformKey ?? (async (value: string) => await resolvePlatformKey(serverDependencies.context(), value));
  const touchPlatformKey = dependencies.touchPlatformKey ?? (async (resolved: ResolvedPlatformKey) => await touchPlatformKeyLastUsed(serverDependencies.context(), resolved));
  const mcp: McpHttpHandler = createMcpHandler(({ authInfo }) => createLobbyStackMcpServer(principalFromAuthInfo(authInfo), serverDependencies), {
    onerror: (error) => console.warn(JSON.stringify({ event: "mcp.transport_error", message: error.message })),
  });

  return async (request: Request) => {
    // Browsers attach Origin; MCP clients running on servers do not. Any Origin
    // outside the configured app URLs is refused, including one that matches the
    // request's Host, so a DNS-rebinding page cannot drive the endpoint.
    const origin = request.headers.get("origin");
    if (origin !== null && !trustedMcpOrigins().has(origin.trim())) return jsonError(403, "forbidden", "This origin may not call the LobbyStack MCP server.");

    const token = bearerToken(request.headers.get("authorization"));
    if (!token) return jsonError(401, "unauthorized", "Sign in with OAuth, or send a LobbyStack API key as Authorization: Bearer <key>.", { "WWW-Authenticate": mcpBearerChallenge() });

    let credential: VerifiedCredential | null = null;
    if (isOAuthAccessToken(token)) {
      // A token issued for another resource is not accepted here (RFC 8707 audience).
      const grant = await resolveGrant(token);
      if (grant && tokenAudienceMatches(grant.resources)) credential = { kind: "oauth", grant };
      if (!grant) {
        const partnerGrant = await resolvePartnerGrant(token);
        if (partnerGrant && tokenAudienceMatches(partnerGrant.resources)) credential = { kind: "partner_oauth", grant: partnerGrant };
      }
    } else if (isPlatformKeyToken(token)) {
      const key = await findPlatformKey(token);
      // Only a key a partner made in its console acts as the partner. The host's keys act as an account on many businesses and have no MCP access.
      if (key && key.partnerId === undefined) return jsonError(403, "forbidden", "The host's platform keys can't use the MCP server. Use a partner's platform key, a business's API key, or sign in with OAuth.");
      if (key) credential = { kind: "platform_key", key: key as PartnerPlatformKey };
    } else {
      const key = await resolveKey(token);
      if (key) credential = { kind: "api_key", key };
    }
    if (!credential) return jsonError(401, "unauthorized", "The access token or API key is invalid, expired or revoked.", { "WWW-Authenticate": mcpBearerChallenge("invalid_token") });

    const principal = principalFor(credential);
    const usable = principal.kind === "partner" ? partnerToolScopes : businessToolScopes;
    if (!usable.some((scope) => keyHasScope(principal.scopes, scope))) {
      return jsonError(403, "insufficient_scope", "This connection has no scope the MCP server uses. Grant at least one read or write scope other than webhooks:manage.", { "WWW-Authenticate": mcpBearerChallenge("insufficient_scope") });
    }

    const verified = credential;
    runAfterResponse(async () => {
      if (verified.kind === "api_key") await touchKey(verified.key).catch(() => undefined);
      else if (verified.kind === "platform_key") await touchPlatformKey(verified.key).catch(() => undefined);
      else await touchGrant(verified.grant.grantId).catch(() => undefined);
    });
    return await mcp.fetch(request, { authInfo: authInfoFor(credential) });
  };
}
