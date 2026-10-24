"use client";

import { useQuery } from "@tanstack/react-query";

import { requestJson } from "@/lib/request-json";

export type InstagramStatus = { configured: boolean; account: { username: string | null; status: string; connectedAt: string } | null };

export const instagramStatusQueryKey = (businessId: string | undefined) => ["integrations", "instagram", businessId];

/** Whether this server has a Meta app for Instagram, and the business's connected account. */
export function useInstagramStatus(businessId: string | undefined) {
  return useQuery({ queryKey: instagramStatusQueryKey(businessId), queryFn: () => requestJson<InstagramStatus>(`/api/integrations/instagram?businessId=${encodeURIComponent(businessId!)}`), enabled: Boolean(businessId) });
}
