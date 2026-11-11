"use client";

import { useQuery } from "@tanstack/react-query";
import type { Capability } from "@lobbystack/domain";
import type { PartnerAccessLevel } from "@lobbystack/shared";
import { selectActiveBusiness } from "@/lib/active-business";
import { requestJson } from "@/lib/request-json";

/** One workspace row from `GET /api/businesses`. */
export type Business = {
  businessId: string;
  name: string;
  slug: string;
  role: string;
  active: boolean;
  timezone?: string;
  businessType?: string;
  defaultLocale?: string;
  websiteUrl?: string | null;
  onboardingStage?: string;
  createdAt?: string;
  /** The access level a partner's business gives its operators, or null for a direct business. */
  partnerAccessLevel?: PartnerAccessLevel | null;
  /** How the person reaches the business: on its team, or through an open as a member of its partner. */
  via?: "membership" | "partner";
  /** What the business lets the person do, before their role's rules. */
  capabilities?: Capability[];
};

/** Loads the operator's workspaces and picks the server-selected active one. */
export function useActiveBusiness() {
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => requestJson<{ businesses: Business[] }>("/api/businesses") });
  return { businesses, business: selectActiveBusiness(businesses.data?.businesses) };
}
