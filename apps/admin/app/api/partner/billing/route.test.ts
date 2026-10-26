import { beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ resolve: vi.fn(), billing: vi.fn(), create: vi.fn(), read: vi.fn(), customer: vi.fn(), portal: vi.fn(), overage: vi.fn(), providers: [] as unknown[] }));
vi.mock("@/lib/operator-request", () => import("@/lib/operator-request.fake"));
vi.mock("@lobbystack/domain", () => ({ resolvePartnerActor: fixture.resolve, getPartnerBilling: fixture.billing, createPartnerTierCheckout: fixture.create, getPartnerTierCheckout: fixture.read, partnerBillingPortalCustomer: fixture.customer, setPartnerPoolOverage: fixture.overage }));
// Polar's customer portal, as the route calls it: it records the provider's settings and each session it opens.
vi.mock("@lobbystack/providers", () => ({
  PolarBillingProvider: class {
    constructor(config: unknown) { fixture.providers.push(config); }
    createCustomerPortalSession = fixture.portal;
  },
}));

import { resetFakeOperator } from "@/lib/operator-request.fake";
import { GET as getBilling } from "./route";
import { GET as getCheckout, POST as startCheckout } from "./checkout/route";
import { POST as setOverage } from "./overage/route";
import { POST as openPortal } from "./portal/route";

const partnerId = "5b1f6c43-34a5-4a8e-9a43-6c1f8d5f1c11";
const requestId = "0d6f9c1e-2b7a-4c55-8f0e-3a9b1d2c4e5f";
const actor = { kind: "member", partnerId, userId: "user", role: "owner" };
const partnerHost = { "x-lobbystack-brand": `partner:${partnerId}`, "x-lobbystack-brand-origin": "https://acme.portal.example.test" };
const call = (handler: (request: Request) => Promise<Response>, path: string, init: { method?: string; body?: unknown; headers?: Record<string, string>; query?: string } = {}) =>
  handler(new Request(`http://localhost:3000${path}?partnerId=${partnerId}${init.query ?? ""}`, { method: init.method ?? "GET", headers: init.headers ?? {}, ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }) }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  resetFakeOperator();
  fixture.providers = [];
  fixture.resolve.mockResolvedValue(actor);
  vi.stubEnv("APP_BASE_URL", "https://desk.example.test");
  vi.stubEnv("AUTH_TRUSTED_ORIGINS", "");
});

it("reads the partner's tier for the person, whose role the partner operation checks", async () => {
  fixture.billing.mockResolvedValue({ billed: true, tier: "free" });
  const response = await call(getBilling, "/api/partner/billing");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ billed: true, tier: "free" });
  expect(fixture.resolve).toHaveBeenCalledWith(expect.anything(), { userId: "user", partnerId });
  expect(fixture.billing).toHaveBeenCalledWith(expect.anything(), actor);
});

it("answers an admin or member with the operation's refusal", async () => {
  fixture.billing.mockRejectedValue(Object.assign(new Error("Only owners manage the partner's billing."), { status: 403, code: "owner_only" }));
  const response = await call(getBilling, "/api/partner/billing");
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ code: "owner_only" });
});

it("starts a checkout that returns to the host's domain, or to the partner's host the proxy resolved", async () => {
  fixture.create.mockResolvedValue({ requestId });
  const onHost = await call(startCheckout, "/api/partner/billing/checkout", { method: "POST", body: { partnerId, tier: "growth", billingInterval: "annual" } });
  expect(onHost.status).toBe(202);
  expect(await onHost.json()).toEqual({ requestId });
  expect(fixture.create).toHaveBeenLastCalledWith(expect.anything(), actor, { tier: "growth", billingInterval: "annual", returnOrigin: "https://desk.example.test" });
  await call(startCheckout, "/api/partner/billing/checkout", { method: "POST", body: { tier: "starter", billingInterval: "monthly" }, headers: partnerHost });
  expect(fixture.create).toHaveBeenLastCalledWith(expect.anything(), actor, { tier: "starter", billingInterval: "monthly", returnOrigin: "https://acme.portal.example.test" });
});

it("refuses a checkout with no tier or interval before asking the partner operation", async () => {
  for (const [body, code] of [[{ billingInterval: "monthly" }, "invalid_tier"], [{ tier: "growth", billingInterval: 12 }, "invalid_interval"]] as const) {
    const response = await call(startCheckout, "/api/partner/billing/checkout", { method: "POST", body });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code });
  }
  expect(fixture.create).not.toHaveBeenCalled();
});

it("follows a checkout by its id", async () => {
  fixture.read.mockResolvedValue({ requestId, status: "ready", checkoutUrl: "https://polar.example.test/co_1", synced: false });
  const response = await call(getCheckout, "/api/partner/billing/checkout", { query: `&requestId=${requestId}` });
  expect(await response.json()).toMatchObject({ status: "ready" });
  expect(fixture.read).toHaveBeenCalledWith(expect.anything(), actor, { requestId });
  expect((await call(getCheckout, "/api/partner/billing/checkout", { query: "&requestId=nope" })).status).toBe(400);
});

it("opens Polar's portal for the partner's customer and comes back to the Billing page it left", async () => {
  vi.stubEnv("POLAR_ACCESS_TOKEN", "polar_test_token");
  vi.stubEnv("POLAR_ORGANIZATION_ID", "org_1");
  fixture.customer.mockResolvedValue({ customerId: "cus_1" });
  fixture.portal.mockResolvedValue({ url: "https://polar.example.test/portal" });
  const response = await call(openPortal, "/api/partner/billing/portal", { method: "POST", body: {}, headers: partnerHost });
  expect(await response.json()).toEqual({ url: "https://polar.example.test/portal" });
  expect(fixture.customer).toHaveBeenCalledWith(expect.anything(), actor);
  expect(fixture.portal).toHaveBeenCalledWith({ customerId: "cus_1", returnUrl: `https://acme.portal.example.test/partner/${partnerId}/billing` });
  expect(fixture.providers).toEqual([{ accessToken: "polar_test_token", organizationId: "org_1" }]);
});

it("opens no portal when Polar isn't configured or the owner has nothing to manage", async () => {
  expect((await call(openPortal, "/api/partner/billing/portal", { method: "POST", body: {} })).status).toBe(500);
  vi.stubEnv("POLAR_ACCESS_TOKEN", "polar_test_token");
  vi.stubEnv("POLAR_ORGANIZATION_ID", "org_1");
  fixture.customer.mockRejectedValue(Object.assign(new Error("Your partner has no tier in Polar to manage yet."), { status: 409, code: "no_billing_customer" }));
  const response = await call(openPortal, "/api/partner/billing/portal", { method: "POST", body: {} });
  expect(response.status).toBe(409);
  expect(fixture.portal).not.toHaveBeenCalled();
});

it("sets the pool's overage and cap for the person, whose role and values the partner operation checks", async () => {
  fixture.overage.mockResolvedValue({ enabled: true, capCents: 5_000, billed: true });
  const response = await call(setOverage, "/api/partner/billing/overage", { method: "POST", body: { enabled: true, capCents: 5_000 } });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ enabled: true, capCents: 5_000, billed: true });
  expect(fixture.overage).toHaveBeenLastCalledWith(expect.anything(), actor, { enabled: true, capCents: 5_000 });
  // No cap in the body clears it.
  await call(setOverage, "/api/partner/billing/overage", { method: "POST", body: { enabled: false } });
  expect(fixture.overage).toHaveBeenLastCalledWith(expect.anything(), actor, { enabled: false, capCents: null });

  fixture.overage.mockRejectedValue(Object.assign(new Error("Only owners manage the partner's billing."), { status: 403, code: "owner_only" }));
  const refused = await call(setOverage, "/api/partner/billing/overage", { method: "POST", body: { enabled: false, capCents: null } });
  expect(refused.status).toBe(403);
  expect(await refused.json()).toMatchObject({ code: "owner_only" });
});
