import { describe, expect, it } from "vitest";
import { normalizePolarEvent } from "./polar-event";

const businessId = "11111111-1111-4111-8111-111111111111";
describe("Polar payload normalization", () => {
  it("maps real subscription payloads to local billing fields", () => {
    const result = normalizePolarEvent("subscription.active", { id: "sub_1", status: "active", product_id: "pro_month", customer: { id: "cust_1", external_id: `business:${businessId}` } }, { POLAR_PRO_MONTHLY_PRODUCT_ID: "pro_month" });
    expect(result.businessId).toBe(businessId);
    expect(result.businessReference).toBe(businessId);
    expect(result.payload).toMatchObject({ billingKey: `business:${businessId}`, customerId: "cust_1", subscriptionId: "sub_1", subscriptionState: "active", plan: "pro", billingInterval: "monthly" });
  });
  it("preserves prefixed legacy references without treating them as UUIDs", () => {
    const result = normalizePolarEvent("subscription.active", { customer: { external_id: "business:legacy-customer" } });
    expect(result.businessId).toBeUndefined();
    expect(result.businessReference).toBe("legacy-customer");
  });
  it("uses subscription status rather than a paid order's status", () => {
    const result = normalizePolarEvent("order.paid", { id: "order_1", status: "paid", customer: { external_id: `business:${businessId}` }, subscription: { id: "sub_1", status: "active", product_id: "starter_year" } }, { POLAR_STARTER_ANNUAL_PRODUCT_ID: "starter_year" });
    expect(result.payload).toMatchObject({ subscriptionId: "sub_1", subscriptionState: "active", plan: "starter", billingInterval: "annual" });
  });
});
