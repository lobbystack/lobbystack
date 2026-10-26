"use client";

import { createContext, useCallback, useContext } from "react";

import type { Capability } from "@lobbystack/domain";
import { useActiveBusiness } from "@/hooks/use-active-business";

/** Everything a direct business gives its operators, before their role's rules. */
export const ALL_CAPABILITIES: readonly Capability[] = ["activity", "setup", "team", "billing", "api_keys", "mcp"];

const BusinessCapabilitiesContext = createContext<readonly Capability[]>(ALL_CAPABILITIES);

/**
 * What the active business lets the person do, for the dashboard to hide the
 * rest. The server renders with the business it opened; the workspace list
 * takes over once it loads, so switching business updates it.
 */
export function BusinessCapabilitiesProvider({ initial, children }: { initial: readonly Capability[]; children: React.ReactNode }) {
  const { business } = useActiveBusiness();
  return <BusinessCapabilitiesContext.Provider value={business?.capabilities ?? initial}>{children}</BusinessCapabilitiesContext.Provider>;
}

/** Whether the active business gives the person a capability. Outside the dashboard, every one. */
export function useBusinessCan(): (capability: Capability) => boolean {
  const capabilities = useContext(BusinessCapabilitiesContext);
  return useCallback((capability: Capability) => capabilities.includes(capability), [capabilities]);
}
