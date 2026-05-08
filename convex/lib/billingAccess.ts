import { hasTenantAdminAccess } from "./auth";

export function hasBillingManagementAccess(role: string): boolean {
  return hasTenantAdminAccess(role);
}

export function requireBillingManagementAccess(role: string): void {
  if (!hasBillingManagementAccess(role)) {
    throw new Error("Billing management requires admin access.");
  }
}
