import { describe, expect, it } from "vitest";
import { normalizePolarEvent } from "./polar-event";

const businessId = "11111111-1111-4111-8111-111111111111";
describe("Polar payload normalization", () => {
  it("maps real subscription payloads to local billing fields", () => {
    const result = normalizePolarEvent("subscription.active", { id: "sub_1", status: "active", product_id: "pro_month", modified_at: "2026-09-01T12:00:00+00:00", customer: { id: "cust_1", external_id: `business:${businessId}` } }, { POLAR_PRO_MONTHLY_PRODUCT_ID: "pro_month" });
    expect(result.businessId).toBe(businessId);
    expect(result.businessReference).toBe(businessId);
    expect(result.payload).toMatchObject({ billingKey: `business:${businessId}`, customerId: "cust_1", subscriptionId: "sub_1", subscriptionState: "active", plan: "pro", billingInterval: "monthly", subscriptionModifiedAt: "2026-09-01T12:00:00.000Z" });
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

  it("names the partner and the tier its subscription sells for a partner's customer, never a business or a plan", () => {
    const partnerId = "22222222-2222-4222-8222-222222222222";
    const env = { POLAR_PARTNER_GROWTH_ANNUAL_PRODUCT_ID: "growth_year", POLAR_PRO_ANNUAL_PRODUCT_ID: "growth_year" };
    const result = normalizePolarEvent("subscription.active", { id: "sub_1", status: "active", product_id: "growth_year", modified_at: "2026-10-01T00:00:00Z", customer: { id: "cust_1", external_id: `partner:${partnerId}`, metadata: { externalCustomerId: `partner:${partnerId}` } } }, env);
    expect(result).toMatchObject({ partnerId, businessId: undefined, businessReference: undefined });
    expect(result.payload).toMatchObject({ billingKey: `partner:${partnerId}`, customerId: "cust_1", subscriptionId: "sub_1", subscriptionState: "active", partnerTier: "growth", billingInterval: "annual", subscriptionModifiedAt: "2026-10-01T00:00:00.000Z" });
    expect(result.payload).not.toHaveProperty("plan");
    // An order names its subscription's tier the same way; a product that sells no tier names none.
    expect(normalizePolarEvent("order.paid", { id: "order_1", status: "paid", customer: { external_id: `partner:${partnerId}` }, subscription: { id: "sub_1", status: "active", product_id: "growth_year" } }, env).payload).toMatchObject({ partnerTier: "growth", subscriptionState: "active" });
    expect(normalizePolarEvent("subscription.active", { product_id: "other", customer: { external_id: `partner:${partnerId}` } }, env).payload).not.toHaveProperty("partnerTier");
  });

  it("keeps a business's events with the business, and ignores a partner reference that isn't an id", () => {
    const partnerId = "22222222-2222-4222-8222-222222222222";
    expect(normalizePolarEvent("subscription.active", { customer: { external_id: `business:${businessId}`, metadata: { externalCustomerId: `partner:${partnerId}` } } })).toMatchObject({ businessId, partnerId: undefined });
    expect(normalizePolarEvent("subscription.active", { customer: { external_id: "partner:acme" } })).toMatchObject({ businessId: undefined, partnerId: undefined, businessReference: "partner:acme" });
  });

  it("does not take a plan from a checkout's product", () => {
    const result = normalizePolarEvent("checkout.updated", { id: "checkout_1", status: "open", product_id: "pro_month", customer: { external_id: `business:${businessId}` } }, { POLAR_PRO_MONTHLY_PRODUCT_ID: "pro_month" });
    expect(result.payload).not.toHaveProperty("plan");
    expect(result.payload).not.toHaveProperty("billingInterval");
  });

  it("flags the other catalog's product, which sells the customer nothing, and leaves an unknown one alone", () => {
    const env = { POLAR_STARTER_MONTHLY_PRODUCT_ID: "starter_month", POLAR_PARTNER_GROWTH_MONTHLY_PRODUCT_ID: "growth_month" };
    const partnerId = "3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a";
    const businessId = "0b7c1d2e-3f40-4a51-8b62-7c83d94ea5b6";
    const event = (productId: string, externalId: string) => normalizePolarEvent("subscription.updated", { id: "sub_1", status: "active", product_id: productId, customer: { id: "cust_1", external_id: externalId } }, env);
    // A partner whose tier's subscription moves to a business's plan.
    const partnerOnPlan = event("starter_month", `partner:${partnerId}`);
    expect(partnerOnPlan.payload).toMatchObject({ foreignProduct: true });
    expect(partnerOnPlan.payload).not.toHaveProperty("plan");
    expect(partnerOnPlan.payload).not.toHaveProperty("partnerTier");
    // A business whose plan's subscription moves to a partner's tier.
    const businessOnTier = event("growth_month", `business:${businessId}`);
    expect(businessOnTier.payload).toMatchObject({ foreignProduct: true });
    expect(businessOnTier.payload).not.toHaveProperty("partnerTier");
    // Each customer's own catalog, and a product no catalog names, aren't foreign.
    expect(event("growth_month", `partner:${partnerId}`).payload).not.toHaveProperty("foreignProduct");
    expect(event("starter_month", `business:${businessId}`).payload).not.toHaveProperty("foreignProduct");
    expect(event("retired_product", `business:${businessId}`).payload).not.toHaveProperty("foreignProduct");
  });
});
