"use client";

import { createContext, useCallback, useContext } from "react";

import type { Capability } from "@lobbystack/domain";
import { useActiveBusiness } from "@/hooks/use-active-business";

/** Everything a direct business gives its operators, before their role's rules. */
export const ALL_CAPABILITIES: readonly Capability[] = ["activity", "setup", "team", "billing", "api_keys", "mcp"];

const BusinessCapabilitiesContext = createContext<readonly Capability[]>(ALL_CAPABILITIES);
const PartnerBillingContext = createContext(false);

/**
 * What the active business lets the person do, for the dashboard to hide the
 * rest. The server renders with the business it opened; the workspace list
 * takes over once it loads, so switching business updates it.
 */
export function BusinessCapabilitiesProvider({ initial, children }: { initial: readonly Capability[]; children: React.ReactNode }) {
  const { business } = useActiveBusiness();
  // A partner's business pays its partner, and its owners and admins open that billing page. Someone from the partner who opened the business isn't on its team, so the page isn't theirs.
  const opensPartnerBilling = Boolean(business?.partnerAccessLevel) && business?.via !== "partner" && (business?.role === "business_owner" || business?.role === "business_admin");
  return <BusinessCapabilitiesContext.Provider value={business?.capabilities ?? initial}><PartnerBillingContext.Provider value={opensPartnerBilling}>{children}</PartnerBillingContext.Provider></BusinessCapabilitiesContext.Provider>;
}

/** Whether the person may open the billing page where the active business pays its partner. Outside the dashboard, never. */
export function useOpensPartnerBilling(): boolean {
  return useContext(PartnerBillingContext);
}

/** Whether the active business gives the person a capability. Outside the dashboard, every one. */
export function useBusinessCan(): (capability: Capability) => boolean {
  const capabilities = useContext(BusinessCapabilitiesContext);
  return useCallback((capability: Capability) => capabilities.includes(capability), [capabilities]);
}
