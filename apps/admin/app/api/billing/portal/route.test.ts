import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  account: { billingKey: "tenant-billing-key", customerId: "customer", subscriptionId: "subscription", plan: "pro", subscriptionState: "past_due" } as Record<string, string | null> | null,
  portal: vi.fn(),
}));
vi.mock("@/lib/operator-request", () => import("@/lib/operator-request.fake"));
vi.mock("@lobbystack/providers", () => ({ PolarBillingProvider: class { createCustomerPortalSession = fixture.portal; } }));

import { fakeOperator, resetFakeOperator } from "@/lib/operator-request.fake";
import { POST } from "./route";

beforeEach(() => {
  vi.stubEnv("POLAR_ACCESS_TOKEN", "isolated-unit-test-token");
  vi.stubEnv("POLAR_ORGANIZATION_ID", "isolated-unit-test-org");
  vi.stubEnv("APP_BASE_URL", "http://localhost:3000");
  fixture.account = { billingKey: "tenant-billing-key", customerId: "customer", subscriptionId: "subscription", plan: "pro", subscriptionState: "past_due" };
  resetFakeOperator();
  fakeOperator.tx = { select: () => ({ from: () => ({ where: () => ({ limit: async () => fixture.account ? [fixture.account] : [] }) }) }) };
  fixture.portal.mockResolvedValue({ url: "https://billing.example.invalid/session" });
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("billing portal route", () => {
  it.each(["active", "trialing", "past_due", "canceled"])("opens recovery/history access for %s subscriptions", async (subscriptionState) => {
    fixture.account!.subscriptionState = subscriptionState;
    const response = await POST(new Request("http://localhost:3000/api/billing/portal?businessId=business", { method: "POST" }));
    expect(response.status).toBe(200);
    expect(fakeOperator.transactions).toEqual([{ minimumRole: "business_admin" }]);
    expect(fixture.portal).toHaveBeenCalledWith({ customerId: "customer", returnUrl: "http://localhost:3000/settings/plan" });
  });
  it("opens no Polar portal for a managed plan, which LobbyStack bills directly", async () => {
    fixture.account = { source: "managed", billingKey: "tenant-billing-key", customerId: "customer", subscriptionId: null, plan: "enterprise", subscriptionState: "active" };
    const response = await POST(new Request("http://localhost:3000/api/billing/portal?businessId=business", { method: "POST" }));
    expect(response.status).toBe(409);
    expect(fixture.portal).not.toHaveBeenCalled();
  });
  it("rejects a customer without billing history before calling the provider", async () => {
    fixture.account = null;
    expect((await POST(new Request("http://localhost:3000/api/billing/portal", { method: "POST" }))).status).toBe(409);
    expect(fixture.portal).not.toHaveBeenCalled();
  });
  it("does not contact the provider after authorization fails", async () => {
    fakeOperator.denied = { status: 403 };
    expect((await POST(new Request("http://localhost:3000/api/billing/portal", { method: "POST" }))).status).toBe(403);
    expect(fixture.portal).not.toHaveBeenCalled();
  });
});
