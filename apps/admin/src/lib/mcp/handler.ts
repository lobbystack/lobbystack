import { after } from "next/server";
import { createMcpHandler, type AuthInfo, type McpHttpHandler } from "@modelcontextprotocol/server";

import { bearerToken, resolveApiKey, touchApiKeyLastUsed, type DomainContext, type ResolvedApiKey } from "@lobbystack/domain";
import { isApiKeyScope, type ApiErrorCode } from "@lobbystack/shared";

import { createWorkerDomainContext } from "../domain-context";
import { enforceApiRateLimit } from "../public-api/rate-limit";
import { createLobbyStackMcpServer, type McpServerDependencies } from "./server";
import { mcpTools } from "./tools";

// HTTP entry for /api/mcp: Streamable HTTP, stateless. The caller sends a
// LobbyStack API key as `Authorization: Bearer lsk_...`; the key picks the
// business and its scopes pick the tools. The key never reaches logs: logs
// and audit rows carry the key id.

export type McpHandlerDependencies = Partial<McpServerDependencies> & {
  resolveKey?: (key: string) => Promise<ResolvedApiKey | null>;
  touchKey?: (key: ResolvedApiKey) => Promise<void>;
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

function authInfoFor(key: ResolvedApiKey): AuthInfo {
  // The key itself stays out of the auth info; tool handlers only need its id, business and scopes.
  return { token: `api_key:${key.apiKeyId}`, clientId: key.apiKeyId, scopes: [...key.scopes], extra: { businessId: key.businessId, apiKeyId: key.apiKeyId } };
}

function keyFromAuthInfo(authInfo: AuthInfo | undefined): ResolvedApiKey {
  const businessId = authInfo?.extra?.businessId;
  const apiKeyId = authInfo?.extra?.apiKeyId;
  if (typeof businessId !== "string" || typeof apiKeyId !== "string") throw new Error("The MCP handler ran without a verified API key.");
  return { businessId, apiKeyId, scopes: authInfo!.scopes.filter(isApiKeyScope) };
}

export function createLobbyStackMcpHttpHandler(dependencies: McpHandlerDependencies = {}): (request: Request) => Promise<Response> {
  const serverDependencies: McpServerDependencies = {
    context: dependencies.context ?? (createWorkerDomainContext as () => DomainContext),
    rateLimit: dependencies.rateLimit ?? enforceApiRateLimit,
    ...(dependencies.operations ? { operations: dependencies.operations } : {}),
    ...(dependencies.log ? { log: dependencies.log } : {}),
  };
  const mcp: McpHttpHandler = createMcpHandler(({ authInfo }) => createLobbyStackMcpServer(keyFromAuthInfo(authInfo), serverDependencies), {
    onerror: (error) => console.warn(JSON.stringify({ event: "mcp.transport_error", message: error.message })),
  });

  return async (request: Request) => {
    // Browsers attach Origin; MCP clients running on servers do not. Any Origin
    // outside the configured app URLs is refused, including one that matches the
    // request's Host, so a DNS-rebinding page cannot drive the endpoint.
    const origin = request.headers.get("origin");
    if (origin !== null && !trustedMcpOrigins().has(origin.trim())) return jsonError(403, "forbidden", "This origin may not call the LobbyStack MCP server.");

    const token = bearerToken(request.headers.get("authorization"));
    if (!token) return jsonError(401, "unauthorized", "Send a LobbyStack API key as Authorization: Bearer <key>.", { "WWW-Authenticate": 'Bearer realm="LobbyStack MCP"' });
    const key = await (dependencies.resolveKey ?? ((value) => resolveApiKey(serverDependencies.context(), value)))(token);
    if (!key) return jsonError(401, "unauthorized", "The API key is invalid or has been revoked.", { "WWW-Authenticate": 'Bearer realm="LobbyStack MCP", error="invalid_token"' });
    if (!key.scopes.some((scope) => mcpScopes.has(scope))) return jsonError(403, "insufficient_scope", "This API key has no scope the MCP server uses. Add at least one read or write scope other than webhooks:manage.");

    const touch = dependencies.touchKey ?? (async (resolved: ResolvedApiKey) => await touchApiKeyLastUsed(serverDependencies.context(), resolved));
    runAfterResponse(async () => { await touch(key).catch(() => undefined); });
    return await mcp.fetch(request, { authInfo: authInfoFor(key) });
  };
}
