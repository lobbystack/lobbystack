import { afterEach, beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ resolve: vi.fn(), read: vi.fn(), start: vi.fn(), stripe: { name: "stripe connect" } as unknown }));
vi.mock("@/lib/operator-request", () => import("@/lib/operator-request.fake"));
vi.mock("@lobbystack/domain", () => ({ resolvePartnerActor: fixture.resolve, getPartnerStripeConnection: fixture.read, startPartnerStripeOnboarding: fixture.start }));
vi.mock("@/lib/stripe-connect", async () => ({
  ...await vi.importActual<typeof import("@/lib/stripe-connect")>("@/lib/stripe-connect"),
  getStripeConnect: () => fixture.stripe,
  withStripeConnect: (context: object) => ({ ...context, stripeConnect: fixture.stripe }),
}));

import { resetFakeOperator } from "@/lib/operator-request.fake";
import { POST } from "./onboarding/route";
import { GET } from "./route";

const partnerId = "5b1f6c43-34a5-4a8e-9a43-6c1f8d5f1c11";
const actor = { kind: "member", partnerId, userId: "user", role: "owner" };
const connection = { configured: true, status: "onboarding", accountId: "acct_1", country: "CA", currency: null, detailsSubmitted: false, chargesEnabled: false, payoutsEnabled: false, disconnectedAt: null };
const partnerHost = { "x-lobbystack-brand": `partner:${partnerId}`, "x-lobbystack-brand-origin": "https://bright.portal.example.test" };

beforeEach(() => {
  vi.clearAllMocks();
  resetFakeOperator();
  vi.stubEnv("APP_BASE_URL", "https://desk.example.test");
  vi.stubEnv("AUTH_TRUSTED_ORIGINS", "");
  fixture.resolve.mockResolvedValue(actor);
  fixture.read.mockResolvedValue(connection);
  fixture.start.mockResolvedValue({ url: "https://connect.stripe.com/setup/s/abc", accountId: "acct_1" });
});
afterEach(() => { vi.unstubAllEnvs(); });

it("reads the connection with Stripe Connect, asking Stripe first only when the owner comes back from onboarding", async () => {
  expect(await (await GET(new Request(`http://localhost:3000/api/partner/stripe?partnerId=${partnerId}`))).json()).toEqual(connection);
  expect(fixture.read).toHaveBeenLastCalledWith(expect.objectContaining({ stripeConnect: fixture.stripe }), actor, { refresh: false });
  await GET(new Request(`http://localhost:3000/api/partner/stripe?partnerId=${partnerId}&refresh=1`));
  expect(fixture.read).toHaveBeenLastCalledWith(expect.anything(), actor, { refresh: true });
});

it("sends Stripe back to the Stripe page on the host's domain", async () => {
  const response = await POST(new Request("http://localhost:3000/api/partner/stripe/onboarding", { method: "POST", body: JSON.stringify({ partnerId, country: "CA" }) }));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ url: "https://connect.stripe.com/setup/s/abc" });
  expect(fixture.start).toHaveBeenCalledWith(expect.objectContaining({ stripeConnect: fixture.stripe }), actor, {
    country: "CA",
    returnUrl: `https://desk.example.test/partner/${partnerId}/payments?onboarding=return`,
    refreshUrl: `https://desk.example.test/partner/${partnerId}/payments?onboarding=refresh`,
  });
});

it("sends Stripe back to the partner's own host when the console was opened there", async () => {
  await POST(new Request("http://localhost:3000/api/partner/stripe/onboarding", { method: "POST", headers: partnerHost, body: JSON.stringify({ partnerId: partnerId.toUpperCase() }) }));
  expect(fixture.start).toHaveBeenCalledWith(expect.anything(), actor, {
    country: null,
    returnUrl: `https://bright.portal.example.test/partner/${partnerId}/payments?onboarding=return`,
    refreshUrl: `https://bright.portal.example.test/partner/${partnerId}/payments?onboarding=refresh`,
  });
});

it("refuses a country that isn't text, another partner's console on a partner's host, and passes the domain's refusals on", async () => {
  expect((await POST(new Request("http://localhost:3000/api/partner/stripe/onboarding", { method: "POST", body: JSON.stringify({ partnerId, country: 124 }) }))).status).toBe(400);
  const elsewhere = { ...partnerHost, "x-lobbystack-brand": "partner:0d6f9c1e-2b7a-4c55-8f0e-3a9b1d2c4e5f" };
  expect((await POST(new Request("http://localhost:3000/api/partner/stripe/onboarding", { method: "POST", headers: elsewhere, body: JSON.stringify({ partnerId, country: "CA" }) }))).status).toBe(404);
  expect(fixture.start).not.toHaveBeenCalled();

  fixture.start.mockRejectedValueOnce(Object.assign(new Error("Only owners can manage the Stripe connection."), { status: 403, code: "owner_only" }));
  const refused = await POST(new Request("http://localhost:3000/api/partner/stripe/onboarding", { method: "POST", body: JSON.stringify({ partnerId, country: "CA" }) }));
  expect(refused.status).toBe(403);
  expect(await refused.json()).toMatchObject({ code: "owner_only" });
});
