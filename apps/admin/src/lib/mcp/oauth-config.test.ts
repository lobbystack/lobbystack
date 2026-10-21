import { oauthGrantableScopes } from "@lobbystack/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MCP_OAUTH_SCOPES, mcpBearerChallenge, mcpResourceUrl, oauthIssuer, protectedResourceMetadata, protectedResourceMetadataUrl, tokenAudienceMatches } from "./oauth-config";
import { mcpTools } from "./tools";

const env = { APP_BASE_URL: "https://app.example.com/" };

describe("MCP OAuth configuration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("derives the resource, issuer and metadata URLs from APP_BASE_URL", () => {
    expect(mcpResourceUrl(env)).toBe("https://app.example.com/api/mcp");
    expect(oauthIssuer(env)).toBe("https://app.example.com/api/auth");
    expect(protectedResourceMetadataUrl(env)).toBe("https://app.example.com/.well-known/oauth-protected-resource/api/mcp");
  });

  it("publishes RFC 9728 protected resource metadata", () => {
    expect(protectedResourceMetadata(env)).toMatchObject({
      resource: "https://app.example.com/api/mcp",
      authorization_servers: ["https://app.example.com/api/auth"],
      scopes_supported: [...MCP_OAUTH_SCOPES],
      bearer_methods_supported: ["header"],
      resource_documentation: "https://docs.lobbystack.com/ai/mcp",
    });
    expect(MCP_OAUTH_SCOPES).not.toContain("webhooks:manage");
    expect(MCP_OAUTH_SCOPES).toContain("offline_access");
  });

  it("points at the deployment's own docs", () => {
    vi.stubEnv("NEXT_PUBLIC_DOCS_SITE_URL", "https://help.example.com/");
    expect(protectedResourceMetadata(env)).toMatchObject({ resource_documentation: "https://help.example.com/ai/mcp" });
  });

  it("offers OAuth clients exactly the scopes the MCP tools use", () => {
    expect(new Set(oauthGrantableScopes)).toEqual(new Set(mcpTools.map((tool) => tool.scope)));
  });

  it("points 401 challenges at the metadata", () => {
    expect(mcpBearerChallenge(undefined, env)).toBe(`Bearer realm="LobbyStack MCP", resource_metadata="https://app.example.com/.well-known/oauth-protected-resource/api/mcp", scope="${MCP_OAUTH_SCOPES.join(" ")}"`);
    expect(mcpBearerChallenge("invalid_token", env)).toContain('error="invalid_token"');
  });

  it("accepts tokens issued for this resource or for no resource, and nothing else", () => {
    expect(tokenAudienceMatches([], env)).toBe(true);
    expect(tokenAudienceMatches(["https://app.example.com/api/mcp"], env)).toBe(true);
    expect(tokenAudienceMatches(["https://app.example.com/api/mcp/"], env)).toBe(true);
    expect(tokenAudienceMatches(["https://other.example.com/api/mcp"], env)).toBe(false);
    expect(tokenAudienceMatches(["https://app.example.com/api/v1"], env)).toBe(false);
  });
});
