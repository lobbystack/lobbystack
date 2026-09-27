import { describe, expect, it, vi } from "vitest";

vi.mock("./auth", () => ({ getAuth: () => ({ handler: vi.fn() }) }));

import { metadataOptions, protectedResourceMetadataResponse } from "./mcp/oauth-metadata";
import { oauthClientPreflight, withOAuthClientCors } from "./oauth-cors";
import { authorizePathFromSignedQuery, oauthConsentRedirect, oauthSignInRedirect } from "./oauth-pages";

const signed = "response_type=code&client_id=abc&scope=business%3Aread&state=xyz&code_challenge=c&code_challenge_method=S256&resource=https%3A%2F%2Fapp.example.com%2Fapi%2Fmcp&exp=1&ba_iat=2&ba_pl=3&ba_param=ba_iat&ba_param=client_id&sig=zzz";

describe("OAuth page hops", () => {
  it("drops Better Auth's signature before replaying the authorization request", () => {
    const path = authorizePathFromSignedQuery(new URLSearchParams(signed));
    const replay = new URL(path, "https://app.example.com");
    expect(replay.pathname).toBe("/api/auth/oauth2/authorize");
    expect([...replay.searchParams.keys()].sort()).toEqual(["client_id", "code_challenge", "code_challenge_method", "resource", "response_type", "scope", "state"]);
  });

  it("sends signed-out people to the localized login page, then back to authorize", () => {
    const response = oauthSignInRedirect(new Request(`https://app.example.com/oauth/sign-in?${signed}`, { headers: { "x-lobbystack-locale": "fr" } }));
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("location")!, "https://app.example.com");
    expect(location.pathname).toBe("/fr/login");
    expect(location.searchParams.get("returnTo")).toMatch(/^\/api\/auth\/oauth2\/authorize\?/);
    expect(location.searchParams.get("returnTo")).not.toContain("sig=");
  });

  it("keeps the signed query when it moves to the consent page", () => {
    const response = oauthConsentRedirect(new Request(`https://app.example.com/oauth/consent?${signed}`));
    const location = response.headers.get("location")!;
    expect(location).toMatch(/^\/(en|fr)\/oauth\/consent\?/);
    expect(location.slice(location.indexOf("?") + 1)).toBe(signed);
  });
});

describe("OAuth CORS", () => {
  it("lets browser MCP clients read discovery metadata", async () => {
    const response = protectedResourceMetadataResponse();
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(await response.json()).toHaveProperty("authorization_servers");
    expect(metadataOptions().status).toBe(204);
  });

  it("allows cross-origin calls to token, registration and revocation only, without cookies", () => {
    const token = withOAuthClientCors(new Request("https://app.example.com/api/auth/oauth2/token", { method: "POST" }), new Response("{}", { headers: { "set-cookie": "a=b" } }));
    expect(token.headers.get("access-control-allow-origin")).toBe("*");
    expect(token.headers.get("set-cookie")).toBeNull();
    const signIn = withOAuthClientCors(new Request("https://app.example.com/api/auth/sign-in/email", { method: "POST" }), new Response("{}"));
    expect(signIn.headers.get("access-control-allow-origin")).toBeNull();
    expect(oauthClientPreflight(new Request("https://app.example.com/api/auth/oauth2/register", { method: "OPTIONS" })).status).toBe(204);
    expect(oauthClientPreflight(new Request("https://app.example.com/api/auth/sign-in/email", { method: "OPTIONS" })).status).toBe(404);
  });
});
