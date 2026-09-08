import { hasMinimumRole } from "../authz";

export type BillingAccessAccount = {
  customerId: string | null;
  subscriptionId: string | null;
  plan: string | null;
  subscriptionState: string | null;
};

export function hasBillingCustomerPortal(account: BillingAccessAccount | null): boolean {
  if (!account?.customerId) return false;
  return Boolean(account.subscriptionId || account.plan === "starter" || account.plan === "pro" || ["active", "trialing"].includes(account.subscriptionState ?? ""));
}

export function billingAccess(role: string, account: BillingAccessAccount | null, providerConfigured: boolean) {
  const hasBillingManagementAccess = hasMinimumRole(role, "business_admin");
  return {
    hasBillingManagementAccess,
    hasCustomerPortalAccess: hasBillingManagementAccess && providerConfigured && hasBillingCustomerPortal(account),
    hasCheckoutAccess: hasBillingManagementAccess && providerConfigured,
  };
}
