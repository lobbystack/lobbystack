import { describe, expect, it } from "vitest";
import { billingAccess, hasBillingCustomerPortal } from "./billingAccess";

const paidAccount = { customerId: "customer", subscriptionId: "subscription", plan: "pro", subscriptionState: "past_due" };

describe("billing permissions", () => {
  it.each(["active", "trialing", "past_due", "canceled", "unpaid"])("keeps the portal available for an existing customer's %s subscription", (subscriptionState) => {
    expect(hasBillingCustomerPortal({ ...paidAccount, subscriptionState })).toBe(true);
  });
  it("does not offer a portal before a billing customer exists", () => {
    expect(hasBillingCustomerPortal(null)).toBe(false);
    expect(hasBillingCustomerPortal({ ...paidAccount, customerId: null })).toBe(false);
    expect(hasBillingCustomerPortal({ ...paidAccount, plan: "free_cloud", subscriptionId: null, subscriptionState: null })).toBe(false);
  });
  it.each(["viewer", "scheduler", "unknown"])("does not expose billing mutations to %s", (role) => {
    expect(billingAccess(role, paidAccount, true)).toEqual({ hasBillingManagementAccess: false, hasCustomerPortalAccess: false, hasCheckoutAccess: false });
  });
  it.each(["business_admin", "business_owner"])("allows %s to recover a past-due payment", (role) => {
    expect(billingAccess(role, paidAccount, true)).toEqual({ hasBillingManagementAccess: true, hasCustomerPortalAccess: true, hasCheckoutAccess: true });
  });
  it("does not offer unconfigured provider actions", () => {
    expect(billingAccess("business_owner", paidAccount, false)).toEqual({ hasBillingManagementAccess: true, hasCustomerPortalAccess: false, hasCheckoutAccess: false });
  });
  it("sells and manages nothing through Polar for a managed plan, which LobbyStack bills directly", () => {
    const managed = { customerId: "customer", subscriptionId: null, plan: "enterprise", subscriptionState: "active", source: "managed" };
    expect(billingAccess("business_owner", managed, true)).toEqual({ hasBillingManagementAccess: true, hasCustomerPortalAccess: false, hasCheckoutAccess: false });
    // Once the managed plan ends, the business can buy a plan again.
    expect(billingAccess("business_owner", { ...managed, subscriptionState: "canceled" }, true)).toMatchObject({ hasCheckoutAccess: true });
  });
});
