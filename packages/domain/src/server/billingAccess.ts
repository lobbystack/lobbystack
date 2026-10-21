import { hasMinimumRole } from "../authz";
import { isManagedBillingAccount } from "./billing";

export type BillingAccessAccount = {
  customerId: string | null;
  subscriptionId: string | null;
  plan: string | null;
  subscriptionState: string | null;
  source?: string | null;
};

export function hasBillingCustomerPortal(account: BillingAccessAccount | null): boolean {
  if (!account?.customerId) return false;
  return Boolean(account.subscriptionId || account.plan === "starter" || account.plan === "pro" || ["active", "trialing"].includes(account.subscriptionState ?? ""));
}

export function billingAccess(role: string, account: BillingAccessAccount | null, providerConfigured: boolean) {
  const hasBillingManagementAccess = hasMinimumRole(role, "business_admin");
  // LobbyStack bills a managed plan directly, so Polar has nothing to sell or manage for it.
  const managed = isManagedBillingAccount(account);
  return {
    hasBillingManagementAccess,
    hasCustomerPortalAccess: hasBillingManagementAccess && providerConfigured && !managed && hasBillingCustomerPortal(account),
    hasCheckoutAccess: hasBillingManagementAccess && providerConfigured && !managed,
  };
}
