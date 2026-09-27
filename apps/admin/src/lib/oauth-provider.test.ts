import { describe, expect, it } from "vitest";

import { consentReferenceId, isDisabledOAuthEndpoint, registrationWithApplicationType, withSelectedBusiness } from "./oauth-provider";

describe("OAuth provider endpoint allowlist", () => {
  it.each(["/oauth2/authorize", "/oauth2/consent", "/oauth2/continue", "/oauth2/token", "/oauth2/revoke", "/oauth2/introspect", "/oauth2/register", "/oauth2/public-client"])("serves %s", (path) => {
    expect(isDisabledOAuthEndpoint(path)).toBe(false);
  });

  it.each(["/oauth2/create-client", "/oauth2/get-clients", "/oauth2/update-client", "/oauth2/delete-client", "/oauth2/client/rotate-secret", "/oauth2/get-consents", "/oauth2/delete-consent", "/oauth2/userinfo", "/oauth2/end-session", "/admin/oauth2/create-client", "/admin/oauth2/resources"])("turns off %s", (path) => {
    expect(isDisabledOAuthEndpoint(path)).toBe(true);
  });

  it("leaves other auth endpoints alone", () => {
    expect(isDisabledOAuthEndpoint("/sign-in/email")).toBe(false);
    expect(isDisabledOAuthEndpoint(undefined)).toBe(false);
  });
});

describe("dynamic client registration for local MCP clients", () => {
  it("registers a client whose redirects are all loopback as a native app", () => {
    const body = { client_name: "Claude Code", redirect_uris: ["http://localhost:53682/callback", "http://127.0.0.1:6276/oauth/callback"] };
    expect(registrationWithApplicationType("/oauth2/register", body)).toEqual({ ...body, application_type: "native" });
  });

  it.each([
    ["an https redirect", { redirect_uris: ["https://claude.ai/api/mcp/auth_callback"] }],
    ["a mix of loopback and https", { redirect_uris: ["http://localhost:3000/cb", "https://example.com/cb"] }],
    ["an explicit application_type", { redirect_uris: ["http://localhost:3000/cb"], application_type: "web" }],
    ["a non-loopback http redirect", { redirect_uris: ["http://example.com/cb"] }],
    ["no redirect URIs", { redirect_uris: [] }],
  ])("leaves %s alone", (_label, body) => {
    expect(registrationWithApplicationType("/oauth2/register", body)).toBeNull();
  });

  it("only touches the registration endpoint", () => {
    expect(registrationWithApplicationType("/oauth2/token", { redirect_uris: ["http://localhost:1/cb"] })).toBeNull();
  });
});

describe("business selection for consent", () => {
  it("never matches a stored consent outside the consent screen", () => {
    const first = consentReferenceId();
    expect(first).toMatch(/^unselected:/);
    expect(consentReferenceId()).not.toBe(first);
  });

  it("uses the business picked on the consent screen for the whole consent call", async () => {
    const businessId = "5d0bd9a4-7e1c-4a51-9a50-8e1b2c3d4e5f";
    const seen = await withSelectedBusiness(businessId, async () => {
      await Promise.resolve();
      return [consentReferenceId(), await new Promise<string>((resolve) => setTimeout(() => resolve(consentReferenceId()), 1))];
    });
    expect(seen).toEqual([businessId, businessId]);
    expect(consentReferenceId()).toMatch(/^unselected:/);
  });
});
