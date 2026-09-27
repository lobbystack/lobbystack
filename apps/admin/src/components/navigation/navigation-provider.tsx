"use client";

import { createContext, useContext } from "react";
import { useQuery } from "@tanstack/react-query";

import { requestJson } from "@/lib/request-json";
import type { NavigationSnapshot } from "@/lib/navigation-routes";

export const NAVIGATION_QUERY_KEY = ["navigation"] as const;

const NavigationContext = createContext<NavigationSnapshot | null>(null);

/**
 * Seeds the navigation with what the server rendered, then keeps it current
 * after a receptionist is added, renamed or deleted (invalidate
 * NAVIGATION_QUERY_KEY).
 */
export function NavigationProvider({ initial, children }: { initial: NavigationSnapshot | null; children: React.ReactNode }) {
  const query = useQuery({
    queryKey: [...NAVIGATION_QUERY_KEY, initial?.businessId],
    queryFn: () => requestJson<NavigationSnapshot>(`/api/navigation?businessId=${encodeURIComponent(initial!.businessId)}`),
    enabled: Boolean(initial),
    ...(initial ? { initialData: initial } : {}),
    staleTime: 30_000,
  });
  return <NavigationContext.Provider value={query.data ?? initial}>{children}</NavigationContext.Provider>;
}

export function useNavigationSnapshot(): NavigationSnapshot | null {
  return useContext(NavigationContext);
}
