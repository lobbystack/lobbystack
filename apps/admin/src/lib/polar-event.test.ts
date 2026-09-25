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
  it("resolves a migrated customer from its metadata rather than its stale external id", () => {
    // Polar reuses a customer by email, so a subscription bought after the
    // Postgres migration still arrives under the Convex id the customer was
    // created with. The current id is in the customer's metadata.
    const result = normalizePolarEvent("subscription.active", {
      id: "sub_1",
      status: "active",
      product_id: "starter_month",
      customer: {
        id: "cust_1",
        external_id: "business:kh797h57jgpq83314s4fj8ptmn866hbk",
        metadata: {
          businessId: "kh797h57jgpq83314s4fj8ptmn866hbk",
          externalCustomerId: `business:${businessId}`,
        },
      },
    }, { POLAR_STARTER_MONTHLY_PRODUCT_ID: "starter_month" });

    expect(result.businessId).toBe(businessId);
    expect(result.payload).toMatchObject({ plan: "starter", billingInterval: "monthly" });
  });

  it("still reports a legacy reference when no field carries a usable id", () => {
    const result = normalizePolarEvent("subscription.active", {
      customer: {
        external_id: "business:kh797h57jgpq83314s4fj8ptmn866hbk",
        metadata: { businessId: "kh797h57jgpq83314s4fj8ptmn866hbk" },
      },
    });

    expect(result.businessId).toBeUndefined();
    expect(result.businessReference).toBe("kh797h57jgpq83314s4fj8ptmn866hbk");
  });

  it("uses subscription status rather than a paid order's status", () => {
    const result = normalizePolarEvent("order.paid", { id: "order_1", status: "paid", customer: { external_id: `business:${businessId}` }, subscription: { id: "sub_1", status: "active", product_id: "starter_year" } }, { POLAR_STARTER_ANNUAL_PRODUCT_ID: "starter_year" });
    expect(result.payload).toMatchObject({ subscriptionId: "sub_1", subscriptionState: "active", plan: "starter", billingInterval: "annual" });
  });
});
