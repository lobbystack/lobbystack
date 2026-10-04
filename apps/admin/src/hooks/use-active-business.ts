"use client";

import { useQuery } from "@tanstack/react-query";
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
};

/** Loads the operator's workspaces and picks the server-selected active one. */
export function useActiveBusiness() {
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => requestJson<{ businesses: Business[] }>("/api/businesses") });
  return { businesses, business: selectActiveBusiness(businesses.data?.businesses) };
}
