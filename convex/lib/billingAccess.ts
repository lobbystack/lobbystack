const BILLING_ADMIN_ROLES = new Set([
  "business_owner",
  "business_admin",
  "owner",
]);

export function hasBillingManagementAccess(role: string): boolean {
  return BILLING_ADMIN_ROLES.has(role);
}

export function requireBillingManagementAccess(role: string): void {
  if (!hasBillingManagementAccess(role)) {
    throw new Error("Billing management requires admin access.");
  }
}
