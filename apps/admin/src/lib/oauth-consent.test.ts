import { describe, expect, it, vi } from "vitest";

vi.mock("./auth", () => ({ getAuth: () => { throw new Error("tests pass a consent function"); } }));
vi.mock("./domain-context", () => ({ createDomainContext: () => ({ db: {} }) }));
vi.mock("./api-helpers", () => ({ getAppDatabase: () => ({ db: {} }) }));

import { ConsentError, decideConsent } from "./oauth-consent";
import { consentReferenceId } from "./oauth-provider";

const businessA = "5d0bd9a4-7e1c-4a51-9a50-8e1b2c3d4e5f";
const businessB = "6e1ce0b5-8f2d-4b62-8b61-9f2c3d4e5f60";
const userId = "0b7c1d2e-3f40-4a51-8b62-7c83d94ea5b6";
const oauthQuery = new URLSearchParams({ client_id: "client-1", scope: "business:read calls:read appointments:write offline_access", redirect_uri: "https://claude.ai/api/mcp/auth_callback", sig: "signed" }).toString();

const partnerA = "7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d";
const partnerB = "8c9d0e1f-2a3b-4c5d-8e6f-7a8b9c0d1e2f";
const agencyQuery = new URLSearchParams({ client_id: "client-1", scope: "business:read calls:read partner:read partner.demos:write businesses:create partner.billing:read offline_access", redirect_uri: "https://claude.ai/api/mcp/auth_callback", sig: "signed" }).toString();

function setup(role: "owner" | "admin" | "member" = "admin") {
  const consent = vi.fn(async (_input: { body: { accept: boolean; scope?: string; oauth_query: string } }) => ({ redirect: true, url: `https://claude.ai/api/mcp/auth_callback?code=abc&reference=${consentReferenceId()}` }));
  const recordApproval = vi.fn(async () => undefined);
  const recordPartnerApproval = vi.fn(async () => undefined);
  const grantableBusinesses = vi.fn(async () => [{ businessId: businessA }]);
  const grantablePartners = vi.fn(async () => [{ partnerId: partnerA, role }]);
  return { consent, recordApproval, recordPartnerApproval, grantableBusinesses, grantablePartners };
}

describe("consent decisions", () => {
  it("approves for the picked business, inside the business selection", async () => {
    const deps = setup();
    const url = await decideConsent({ userId, headers: new Headers(), decision: { oauthQuery, accept: true, businessId: businessA, scopes: ["business:read", "calls:read"] } }, deps);
    expect(new URL(url).searchParams.get("reference")).toBe(businessA);
    expect(deps.consent).toHaveBeenCalledWith({ body: { accept: true, scope: "business:read calls:read offline_access", oauth_query: oauthQuery }, headers: expect.any(Headers) });
    expect(deps.recordApproval).toHaveBeenCalledWith({ userId, businessId: businessA, clientId: "client-1", scopes: ["business:read", "calls:read", "offline_access"] });
  });

  it("refuses a business the person doesn't own or administer", async () => {
    const deps = setup();
    await expect(decideConsent({ userId, headers: new Headers(), decision: { oauthQuery, accept: true, businessId: businessB, scopes: ["business:read"] } }, deps)).rejects.toMatchObject({ status: 403, code: "forbidden" });
    expect(deps.consent).not.toHaveBeenCalled();
  });

  it("refuses scopes the client didn't request", async () => {
    const deps = setup();
    await expect(decideConsent({ userId, headers: new Headers(), decision: { oauthQuery, accept: true, businessId: businessA, scopes: ["contacts:write"] } }, deps)).rejects.toBeInstanceOf(ConsentError);
    expect(deps.consent).not.toHaveBeenCalled();
  });

  it("requires at least one permission besides offline_access", async () => {
    const deps = setup();
    await expect(decideConsent({ userId, headers: new Headers(), decision: { oauthQuery, accept: true, businessId: businessA, scopes: ["offline_access"] } }, deps)).rejects.toMatchObject({ code: "invalid_scope" });
  });

  it("requires a business", async () => {
    const deps = setup();
    await expect(decideConsent({ userId, headers: new Headers(), decision: { oauthQuery, accept: true, scopes: ["business:read"] } }, deps)).rejects.toMatchObject({ code: "business_required" });
  });

  it("denies without a business and records nothing", async () => {
    const deps = setup();
    deps.consent.mockResolvedValueOnce({ redirect: true, url: "https://claude.ai/api/mcp/auth_callback?error=access_denied" });
    const url = await decideConsent({ userId, headers: new Headers(), decision: { oauthQuery, accept: false } }, deps);
    expect(new URL(url).searchParams.get("error")).toBe("access_denied");
    expect(deps.consent).toHaveBeenCalledWith({ body: { accept: false, oauth_query: oauthQuery }, headers: expect.any(Headers) });
    expect(deps.recordApproval).not.toHaveBeenCalled();
    expect(deps.grantableBusinesses).not.toHaveBeenCalled();
  });

  it("does not add offline_access when the client didn't ask for it", async () => {
    const deps = setup();
    const query = new URLSearchParams({ client_id: "client-1", scope: "business:read", sig: "s" }).toString();
    await decideConsent({ userId, headers: new Headers(), decision: { oauthQuery: query, accept: true, businessId: businessA, scopes: ["business:read"] } }, deps);
    expect(deps.consent.mock.calls[0]![0].body.scope).toBe("business:read");
  });

  it("refuses partner scopes on a business connection", async () => {
    const deps = setup();
    await expect(decideConsent({ userId, headers: new Headers(), decision: { oauthQuery: agencyQuery, accept: true, businessId: businessA, scopes: ["business:read", "partner:read"] } }, deps)).rejects.toMatchObject({ status: 400, code: "invalid_scope" });
    expect(deps.consent).not.toHaveBeenCalled();
  });
});

describe("consent decisions for an agency", () => {
  it("approves for a partner the person is on, under the partner's reference", async () => {
    const deps = setup("admin");
    const url = await decideConsent({ userId, headers: new Headers(), decision: { oauthQuery: agencyQuery, accept: true, partnerId: partnerA, scopes: ["partner:read", "partner.demos:write", "businesses:create", "calls:read"] } }, deps);
    expect(new URL(url).searchParams.get("reference")).toBe(`partner:${partnerA}`);
    expect(deps.consent).toHaveBeenCalledWith({ body: { accept: true, scope: "partner:read partner.demos:write businesses:create calls:read offline_access", oauth_query: agencyQuery }, headers: expect.any(Headers) });
    expect(deps.recordPartnerApproval).toHaveBeenCalledWith({ userId, partnerId: partnerA, clientId: "client-1", scopes: ["partner:read", "partner.demos:write", "businesses:create", "calls:read", "offline_access"] });
    expect(deps.recordApproval).not.toHaveBeenCalled();
    expect(deps.grantableBusinesses).not.toHaveBeenCalled();
  });

  it("refuses a partner the person isn't on, as one that doesn't exist", async () => {
    const deps = setup("owner");
    await expect(decideConsent({ userId, headers: new Headers(), decision: { oauthQuery: agencyQuery, accept: true, partnerId: partnerB, scopes: ["partner:read"] } }, deps)).rejects.toMatchObject({ status: 403, code: "forbidden" });
    expect(deps.consent).not.toHaveBeenCalled();
    expect(deps.recordPartnerApproval).not.toHaveBeenCalled();
  });

  it("lets only owners grant the billing scopes", async () => {
    const admin = setup("admin");
    await expect(decideConsent({ userId, headers: new Headers(), decision: { oauthQuery: agencyQuery, accept: true, partnerId: partnerA, scopes: ["partner:read", "partner.billing:read"] } }, admin)).rejects.toMatchObject({ status: 403, code: "owner_only" });
    expect(admin.consent).not.toHaveBeenCalled();
    const owner = setup("owner");
    await decideConsent({ userId, headers: new Headers(), decision: { oauthQuery: agencyQuery, accept: true, partnerId: partnerA, scopes: ["partner:read", "partner.billing:read"] } }, owner);
    expect(owner.consent.mock.calls[0]![0].body.scope).toBe("partner:read partner.billing:read offline_access");
  });

  it("refuses a request that names both a business and a partner", async () => {
    const deps = setup();
    await expect(decideConsent({ userId, headers: new Headers(), decision: { oauthQuery: agencyQuery, accept: true, businessId: businessA, partnerId: partnerA, scopes: ["partner:read"] } }, deps)).rejects.toMatchObject({ status: 400, code: "invalid_request" });
    expect(deps.consent).not.toHaveBeenCalled();
  });
});

