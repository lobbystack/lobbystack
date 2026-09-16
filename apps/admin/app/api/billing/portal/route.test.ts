import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  account: { billingKey: "tenant-billing-key", customerId: "customer", subscriptionId: "subscription", plan: "pro", subscriptionState: "past_due" } as Record<string, string | null> | null,
  denied: false,
  transaction: vi.fn(),
  portal: vi.fn(),
}));
vi.mock("@/lib/api-helpers", () => ({
  businessIdFromRequest: () => "business",
  asApiResponse: (error: { status?: number }) => Response.json({ error: "Request failed" }, { status: error.status ?? 500 }),
  withOperatorTransaction: async (_request: Request, callback: (input: unknown) => unknown, options: unknown) => {
    fixture.transaction(options);
    if (fixture.denied) throw { status: 403 };
    return callback({ tx: { select: () => ({ from: () => ({ where: () => ({ limit: async () => fixture.account ? [fixture.account] : [] }) }) }) } });
  },
}));
vi.mock("@lobbystack/providers", () => ({ PolarBillingProvider: class { createCustomerPortalSession = fixture.portal; } }));

import { POST } from "./route";

beforeEach(() => {
  vi.stubEnv("POLAR_ACCESS_TOKEN", "isolated-unit-test-token");
  vi.stubEnv("POLAR_ORGANIZATION_ID", "isolated-unit-test-org");
  vi.stubEnv("APP_BASE_URL", "http://localhost:3000");
  fixture.account = { billingKey: "tenant-billing-key", customerId: "customer", subscriptionId: "subscription", plan: "pro", subscriptionState: "past_due" };
  fixture.denied = false;
  fixture.portal.mockResolvedValue({ url: "https://billing.example.invalid/session" });
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("billing portal route", () => {
  it.each(["active", "trialing", "past_due", "canceled"])("opens recovery/history access for %s subscriptions", async (subscriptionState) => {
    fixture.account!.subscriptionState = subscriptionState;
    const response = await POST(new Request("http://localhost:3000/api/billing/portal?businessId=business", { method: "POST" }));
    expect(response.status).toBe(200);
    expect(fixture.transaction).toHaveBeenCalledWith({ minimumRole: "business_admin" });
    expect(fixture.portal).toHaveBeenCalledWith({ externalCustomerId: "tenant-billing-key", returnUrl: "http://localhost:3000/settings/plan" });
  });
  it("rejects a customer without billing history before calling the provider", async () => {
    fixture.account = null;
    expect((await POST(new Request("http://localhost:3000/api/billing/portal", { method: "POST" }))).status).toBe(409);
    expect(fixture.portal).not.toHaveBeenCalled();
  });
  it("does not contact the provider after authorization fails", async () => {
    fixture.denied = true;
    expect((await POST(new Request("http://localhost:3000/api/billing/portal", { method: "POST" }))).status).toBe(403);
    expect(fixture.portal).not.toHaveBeenCalled();
  });
});
