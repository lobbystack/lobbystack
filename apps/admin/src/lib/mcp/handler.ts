import { after } from "next/server";
import { createMcpHandler, type AuthInfo, type McpHttpHandler } from "@modelcontextprotocol/server";

import {
  bearerToken,
  isOAuthAccessToken,
  resolveApiKey,
  resolveOAuthAccessToken,
  touchApiKeyLastUsed,
  touchOAuthGrant,
  type ApiCaller,
  type DomainContext,
  type ResolvedApiKey,
  type ResolvedOAuthGrant,
} from "@lobbystack/domain";
import { isApiKeyScope, type ApiErrorCode, type ApiKeyScope } from "@lobbystack/shared";

import { createWorkerDomainContext } from "../domain-context";
import { enforceApiRateLimit } from "../public-api/rate-limit";
import { mcpBearerChallenge, mcpResourceUrl, tokenAudienceMatches } from "./oauth-config";
import { createLobbyStackMcpServer, type McpPrincipal, type McpServerDependencies } from "./server";
import { mcpTools } from "./tools";

// HTTP entry for /api/mcp: Streamable HTTP, stateless. Callers authenticate
// with a LobbyStack API key (`Bearer lsk_...`) or an OAuth access token issued
// to an MCP client (`Bearer lsa_...`). Either way the credential picks one
// business and its scopes pick the tools. Keys and tokens never reach logs:
// logs and audit rows carry the key id or the grant id.

export type McpHandlerDependencies = Partial<McpServerDependencies> & {
  resolveKey?: (key: string) => Promise<ResolvedApiKey | null>;
  touchKey?: (key: ResolvedApiKey) => Promise<void>;
  resolveGrant?: (token: string) => Promise<ResolvedOAuthGrant | null>;
  touchGrant?: (grantId: string) => Promise<void>;
};

const mcpScopes = new Set(mcpTools.map((entry) => entry.scope));

function jsonError(status: number, code: ApiErrorCode, message: string, headers: Record<string, string> = {}): Response {
  return Response.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

/**
 * Browser origins that may call /api/mcp: the configured app URLs only. The
 * request's own URL and Host are never trusted, because a DNS-rebinding page
 * controls both.
 */
export function trustedMcpOrigins(environment: Readonly<Record<string, string | undefined>> = process.env): Set<string> {
  const origins = new Set<string>();
  const values = [environment.APP_BASE_URL, environment.SITE_URL, environment.NEXT_PUBLIC_SITE_URL, ...(environment.AUTH_TRUSTED_ORIGINS ?? "").split(",")];
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    try {
      origins.add(new URL(trimmed).origin);
    } catch {
      // Ignore malformed configuration rather than trusting it.
    }
  }
  return origins;
}

/** Runs work after the response is sent, or right away outside a Next request (tests, scripts). */
function runAfterResponse(task: () => Promise<unknown>): void {
  try {
    after(task);
  } catch {
    void Promise.resolve().then(task).catch(() => undefined);
  }
}

type VerifiedCredential =
  | { kind: "api_key"; key: ResolvedApiKey }
  | { kind: "oauth"; grant: ResolvedOAuthGrant };

function principalFor(credential: VerifiedCredential): McpPrincipal {
  if (credential.kind === "api_key") {
    const { key } = credential;
    return { caller: { businessId: key.businessId, apiKeyId: key.apiKeyId, actor: "mcp" }, scopes: key.scopes, logFields: { api_key_id: key.apiKeyId } };
  }
  const { grant } = credential;
  return { caller: { businessId: grant.businessId, grantId: grant.grantId, userId: grant.userId, actor: "mcp" }, scopes: grant.scopes, logFields: { oauth_grant_id: grant.grantId, oauth_client_id: grant.clientId } };
}

// The SDK hands AuthInfo to the per-request server factory. It carries ids
// only; the secret stays in this module.
function authInfoFor(credential: VerifiedCredential): AuthInfo {
  const principal = principalFor(credential);
  const extra = { caller: principal.caller, logFields: principal.logFields };
  if (credential.kind === "api_key") return { token: `api_key:${credential.key.apiKeyId}`, clientId: credential.key.apiKeyId, scopes: [...principal.scopes], extra };
  return {
    token: `oauth_grant:${credential.grant.grantId}`,
    clientId: credential.grant.clientId,
    scopes: [...principal.scopes],
    expiresAt: Math.floor(credential.grant.expiresAt.getTime() / 1000),
    resource: new URL(mcpResourceUrl()),
    extra,
  };
}

function principalFromAuthInfo(authInfo: AuthInfo | undefined): McpPrincipal {
  const caller = authInfo?.extra?.caller as ApiCaller | undefined;
  const logFields = authInfo?.extra?.logFields as Record<string, string> | undefined;
  if (!caller || typeof caller.businessId !== "string" || !logFields) throw new Error("The MCP handler ran without a verified credential.");
  return { caller, scopes: authInfo!.scopes.filter(isApiKeyScope) as ApiKeyScope[], logFields };
}

export function createLobbyStackMcpHttpHandler(dependencies: McpHandlerDependencies = {}): (request: Request) => Promise<Response> {
  const serverDependencies: McpServerDependencies = {
    context: dependencies.context ?? (createWorkerDomainContext as () => DomainContext),
    rateLimit: dependencies.rateLimit ?? enforceApiRateLimit,
    ...(dependencies.operations ? { operations: dependencies.operations } : {}),
    ...(dependencies.runIdempotent ? { runIdempotent: dependencies.runIdempotent } : {}),
    ...(dependencies.log ? { log: dependencies.log } : {}),
  };
  const resolveKey = dependencies.resolveKey ?? (async (value: string) => await resolveApiKey(serverDependencies.context(), value));
  const resolveGrant = dependencies.resolveGrant ?? (async (value: string) => await resolveOAuthAccessToken(serverDependencies.context(), value));
  const touchKey = dependencies.touchKey ?? (async (resolved: ResolvedApiKey) => await touchApiKeyLastUsed(serverDependencies.context(), resolved));
  const touchGrant = dependencies.touchGrant ?? (async (grantId: string) => await touchOAuthGrant(serverDependencies.context(), grantId));
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
      const grant = await resolveGrant(token);
      // A token issued for another resource is not accepted here (RFC 8707 audience).
      if (grant && tokenAudienceMatches(grant.resources)) credential = { kind: "oauth", grant };
    } else {
      const key = await resolveKey(token);
      if (key) credential = { kind: "api_key", key };
    }
    if (!credential) return jsonError(401, "unauthorized", "The access token or API key is invalid, expired or revoked.", { "WWW-Authenticate": mcpBearerChallenge("invalid_token") });

    const principal = principalFor(credential);
    if (!principal.scopes.some((scope) => mcpScopes.has(scope))) {
      return jsonError(403, "insufficient_scope", "This connection has no scope the MCP server uses. Grant at least one read or write scope other than webhooks:manage.", { "WWW-Authenticate": mcpBearerChallenge("insufficient_scope") });
    }

    const verified = credential;
    runAfterResponse(async () => {
      if (verified.kind === "api_key") await touchKey(verified.key).catch(() => undefined);
      else await touchGrant(verified.grant.grantId).catch(() => undefined);
    });
    return await mcp.fetch(request, { authInfo: authInfoFor(credential) });
  };
}
