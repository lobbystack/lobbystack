import { beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ get: vi.fn(), checkout: vi.fn(), portal: vi.fn() }));
vi.mock("@/lib/operator-request", () => import("@/lib/operator-request.fake"));
vi.mock("@/lib/stripe-connect", () => ({ withStripeConnect: (context: object) => ({ ...context, stripeConnect: "stripe" }) }));
vi.mock("@lobbystack/domain", () => ({ getPackageBilling: fixture.get, startPackageCheckout: fixture.checkout, openPackagePortal: fixture.portal }));

import { resetFakeOperator } from "@/lib/operator-request.fake";
import { POST as checkout } from "./checkout/route";
import { POST as portal } from "./portal/route";
import { GET } from "./route";

const partnerId = "5b1f6c43-34a5-4a8e-9a43-6c1f8d5f1c11";
const onPartnerHost = { "x-lobbystack-brand": `partner:${partnerId}`, "x-lobbystack-brand-origin": "https://acme.portal.example.test" };
const call = (handler: (request: Request) => Promise<Response>, path: string, method: string, headers: Record<string, string> = onPartnerHost) => handler(new Request(`https://acme.portal.example.test${path}`, { method, headers }));

beforeEach(() => {
  vi.clearAllMocks();
  resetFakeOperator();
  fixture.get.mockResolvedValue({ billing: "outside" });
  fixture.checkout.mockResolvedValue({ url: "https://checkout.stripe.test/c/pay/cs_1" });
  fixture.portal.mockResolvedValue({ url: "https://billing.stripe.test/p/session/cus_1" });
});

it("reads the business's billing page with the deployment's Stripe Connect", async () => {
  const response = await call(GET, "/api/package-billing", "GET");
  expect(await response.json()).toEqual({ billing: "outside" });
  expect(fixture.get).toHaveBeenCalledWith({ db: "app", stripeConnect: "stripe" }, { userId: "user", businessId: "business" });
});

it("opens the package's checkout in the payer's name, with Stripe sending them back to the billing page on the partner's host", async () => {
  const response = await call(checkout, "/api/package-billing/checkout", "POST");
  expect(await response.json()).toEqual({ url: "https://checkout.stripe.test/c/pay/cs_1" });
  expect(fixture.checkout).toHaveBeenCalledWith({ db: "app", stripeConnect: "stripe" }, {
    userId: "user",
    businessId: "business",
    email: "user@example.com",
    successUrl: "https://acme.portal.example.test/settings/subscription?checkout=complete",
    cancelUrl: "https://acme.portal.example.test/settings/subscription",
  });
});

it("opens the partner's customer portal, which returns to the billing page", async () => {
  const response = await call(portal, "/api/package-billing/portal", "POST");
  expect(await response.json()).toEqual({ url: "https://billing.stripe.test/p/session/cus_1" });
  expect(fixture.portal).toHaveBeenCalledWith(expect.objectContaining({ stripeConnect: "stripe" }), { userId: "user", businessId: "business", returnUrl: "https://acme.portal.example.test/settings/subscription" });
});

it("opens neither on the host's own domain, where no partner's business shows", async () => {
  expect((await call(checkout, "/api/package-billing/checkout", "POST", { "x-lobbystack-brand": "host" })).status).toBe(404);
  expect((await call(portal, "/api/package-billing/portal", "POST", { "x-lobbystack-brand": "host" })).status).toBe(404);
  expect(fixture.checkout).not.toHaveBeenCalled();
  expect(fixture.portal).not.toHaveBeenCalled();
});
