import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  account: null as Record<string, unknown> | null,
  cancel: vi.fn(),
  record: vi.fn(),
}));
vi.mock("@/lib/operator-request", () => import("@/lib/operator-request.fake"));
vi.mock("@lobbystack/providers", () => ({ PolarBillingProvider: class { cancelSubscriptionAtPeriodEnd = fixture.cancel; } }));
vi.mock("@lobbystack/domain", () => ({ recordProductEventBestEffort: fixture.record }));

import { validateTelemetryEvent, type TelemetryEventName } from "@lobbystack/telemetry";
import { fakeOperator, resetFakeOperator } from "@/lib/operator-request.fake";
import { POST } from "./route";

const periodEnd = new Date("2026-11-12T00:00:00.000Z");

function cancel(body: Record<string, unknown> = {}) {
  return POST(new Request("http://localhost:3000/api/billing/cancel?businessId=business", { method: "POST", body: JSON.stringify(body) }));
}

beforeEach(() => {
  vi.stubEnv("POLAR_ACCESS_TOKEN", "isolated-unit-test-token");
  vi.stubEnv("POLAR_ORGANIZATION_ID", "isolated-unit-test-org");
  fixture.account = { subscriptionId: "subscription", plan: "starter", subscriptionState: "active", currentPeriodEnd: periodEnd };
  resetFakeOperator();
  fakeOperator.tx = { select: () => ({ from: () => ({ where: () => ({ limit: async () => fixture.account ? [fixture.account] : [] }) }) }) };
  fixture.cancel.mockResolvedValue({ endsAt: "2026-11-12T00:00:00Z" });
  fixture.record.mockResolvedValue(undefined);
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("billing cancel route", () => {
  it("cancels at the end of the period and records the reason as billing.subscription_canceled", async () => {
    const response = await cancel({ reason: "price", comment: "  Too much for one clinic  " });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ endsAt: "2026-11-12T00:00:00Z" });
    expect(fakeOperator.transactions).toEqual([{ minimumRole: "business_admin" }]);
    expect(fixture.cancel).toHaveBeenCalledWith({ subscriptionId: "subscription", reason: "too_expensive", comment: "Too much for one clinic" });
    expect(fixture.record).toHaveBeenCalledOnce();
    const [, event] = fixture.record.mock.calls[0] as [unknown, { name: TelemetryEventName; businessId: string; distinctId: string; properties: Record<string, string | boolean> }];
    expect(event).toEqual({ name: "billing.subscription_canceled", businessId: "business", distinctId: "system:business:business", properties: { plan: "starter", reason: "price", hasComment: true } });
    // The free text never reaches analytics.
    expect(JSON.stringify(event)).not.toContain("clinic");
    expect(validateTelemetryEvent({ name: event.name, deploymentMode: "development", businessId: event.businessId, properties: event.properties }).ok).toBe(true);
  });

  it("records a skipped question as none and sends Polar no reason", async () => {
    const response = await cancel();

    expect(response.status).toBe(200);
    expect(fixture.cancel).toHaveBeenCalledWith({ subscriptionId: "subscription" });
    expect(fixture.record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ properties: { plan: "starter", reason: "none", hasComment: false } }));
  });

  it("falls back to the stored period end when Polar names no end date", async () => {
    fixture.cancel.mockResolvedValue({ endsAt: null });
    expect(await (await cancel({ reason: "setup" })).json()).toEqual({ endsAt: periodEnd.toISOString() });
  });

  it("records nothing when Polar refuses the cancellation", async () => {
    fixture.cancel.mockRejectedValue(new Error("Polar request failed with status 403."));
    expect((await cancel({ reason: "quality" })).status).toBe(500);
    expect(fixture.record).not.toHaveBeenCalled();
  });

  it.each([
    ["no subscription", { subscriptionId: null, plan: "free_cloud", subscriptionState: null, currentPeriodEnd: null }],
    ["a lapsed plan", { subscriptionId: "subscription", plan: "pro", subscriptionState: "canceled", currentPeriodEnd: periodEnd }],
  ])("refuses a workspace with %s before calling Polar", async (_label, account) => {
    fixture.account = account;
    const response = await cancel();
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("no_active_subscription");
    expect(fixture.cancel).not.toHaveBeenCalled();
    expect(fixture.record).not.toHaveBeenCalled();
  });

  it("rejects an unknown reason and a comment that isn't text", async () => {
    expect((await cancel({ reason: "bored" })).status).toBe(400);
    expect((await cancel({ comment: 42 })).status).toBe(400);
    expect(fixture.cancel).not.toHaveBeenCalled();
  });

  it("does not contact Polar after authorization fails", async () => {
    fakeOperator.denied = { status: 403 };
    expect((await cancel({ reason: "price" })).status).toBe(403);
    expect(fixture.cancel).not.toHaveBeenCalled();
    expect(fixture.record).not.toHaveBeenCalled();
  });
});
