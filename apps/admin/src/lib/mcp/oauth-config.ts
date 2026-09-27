import { oauthGrantableScopes } from "@lobbystack/shared";

// Where the MCP resource and its authorization server live. Everything is
// derived from APP_BASE_URL, the public URL of the admin app, so metadata,
// token audiences and challenges agree with each other.

export const MCP_PATH = "/api/mcp";
export const AUTH_BASE_PATH = "/api/auth";

/** Scopes MCP clients can request: every tool scope, plus offline_access for refresh tokens. */
export const MCP_OAUTH_SCOPES = [...oauthGrantableScopes, "offline_access"] as const;

export function publicBaseUrl(environment: Readonly<Record<string, string | undefined>> = process.env): string {
  const configured = environment.APP_BASE_URL?.trim().replace(/\/+$/, "");
  return configured || "http://localhost:3000";
}

/** The RFC 8707 resource identifier of the MCP server; clients send it as `resource`. */
export function mcpResourceUrl(environment?: Readonly<Record<string, string | undefined>>): string {
  return `${publicBaseUrl(environment)}${MCP_PATH}`;
}

/** The OAuth issuer: Better Auth's base URL. */
export function oauthIssuer(environment?: Readonly<Record<string, string | undefined>>): string {
  return `${publicBaseUrl(environment)}${AUTH_BASE_PATH}`;
}

/** RFC 9728 puts the metadata for a resource with a path at the well-known prefix plus that path. */
export function protectedResourceMetadataUrl(environment?: Readonly<Record<string, string | undefined>>): string {
  return `${publicBaseUrl(environment)}/.well-known/oauth-protected-resource${MCP_PATH}`;
}

/** The RFC 9728 Protected Resource Metadata document for /api/mcp. */
export function protectedResourceMetadata(environment?: Readonly<Record<string, string | undefined>>): Record<string, unknown> {
  return {
    resource: mcpResourceUrl(environment),
    authorization_servers: [oauthIssuer(environment)],
    scopes_supported: [...MCP_OAUTH_SCOPES],
    bearer_methods_supported: ["header"],
    resource_name: "LobbyStack",
    resource_documentation: "https://docs.lobbystack.com/ai/mcp",
  };
}

/** True when a token's resources allow this server: none recorded, or ours among them. */
export function tokenAudienceMatches(resources: readonly string[], environment?: Readonly<Record<string, string | undefined>>): boolean {
  if (resources.length === 0) return true;
  const expected = mcpResourceUrl(environment).replace(/\/+$/, "");
  return resources.some((resource) => resource.replace(/\/+$/, "") === expected);
}

/** The WWW-Authenticate value that points OAuth clients at the metadata. */
export function mcpBearerChallenge(error?: "invalid_token" | "insufficient_scope", environment?: Readonly<Record<string, string | undefined>>): string {
  const parts = [`realm="LobbyStack MCP"`, `resource_metadata="${protectedResourceMetadataUrl(environment)}"`, `scope="${MCP_OAUTH_SCOPES.join(" ")}"`];
  if (error) parts.push(`error="${error}"`);
  return `Bearer ${parts.join(", ")}`;
}
