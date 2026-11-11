"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AppointmentChangePolicy, BookingMode, ReceptionistVoice, RuntimeLocale } from "@lobbystack/shared";

import type { StaffFirstPatch, StaffFirstProfile } from "@/components/staff-first-section";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { requestJson } from "@/lib/request-json";

/** `GET /api/agent`: the workspace's details and one agent's settings. */
export type AgentSettings = {
  business: { defaultLocale: RuntimeLocale; teamLocale?: RuntimeLocale | null; timezone: string; currency?: string } | null;
  profile: ({
    id?: string;
    name?: string;
    greeting: string;
    summary: string;
    summarySource: "placeholder" | "generated" | "operator";
    summaryRegenerateStatus?: "pending" | "completed" | "empty" | "failed" | null;
    transferNumber: string | null;
    transferMode: string;
    appointmentChangePolicy: AppointmentChangePolicy | null;
    bookingMode: BookingMode;
    voice?: string;
  } & StaffFirstProfile) | null;
  hasKnowledgeSources?: boolean;
  staffFirstBlock?: "plan" | "carrier" | "setup" | null;
};

/** What an agent's own pages save through `PATCH /api/agents/[agentId]`. */
export type AgentPatch = {
  name?: string;
  greeting?: string;
  voice?: ReceptionistVoice;
  transferNumber?: string | null;
  transferMode?: string;
  appointmentChangePolicy?: AppointmentChangePolicy;
  bookingMode?: BookingMode;
} & Partial<StaffFirstPatch>;

/** What the workspace's business details save through `PATCH /api/agent`. */
export type WorkspacePatch = {
  defaultLocale?: RuntimeLocale;
  teamLocale?: RuntimeLocale | null;
  timezone?: string;
  currency?: string;
  summary?: string;
  regenerateSummary?: true;
};

export function agentSettingsQueryKey(businessId: string, agentId?: string) {
  return agentId ? ["agent-settings", businessId, agentId] : ["agent-settings", businessId];
}

function settingsUrl(businessId: string, agentId?: string) {
  return `/api/agent?businessId=${encodeURIComponent(businessId)}${agentId ? `&agentId=${encodeURIComponent(agentId)}` : ""}`;
}

/**
 * One agent's settings, or without `agentId` the workspace's details with the
 * default agent's. An empty `agentId` waits until the agent is known.
 */
export function useAgentSettingsQuery(businessId: string, agentId?: string) {
  return useQuery({
    queryKey: agentSettingsQueryKey(businessId, agentId),
    queryFn: () => requestJson<AgentSettings>(settingsUrl(businessId, agentId)),
    enabled: Boolean(businessId) && agentId !== "",
  });
}

/** A second read of the same settings, polled while the summary rewrite runs, so the page's drafts aren't reset meanwhile. */
export function fetchAgentSettings(businessId: string, agentId?: string) {
  return requestJson<AgentSettings>(settingsUrl(businessId, agentId));
}

/** Saves one agent's own settings. Every agent query of the business refreshes, since a workspace read shows the default agent too. */
export function useSaveAgent(businessId: string, agentId: string) {
  const queryClient = useQueryClient();
  return async (patch: AgentPatch, refetchType: "active" | "none" = "active") => {
    await requestJson(`/api/agents/${encodeURIComponent(agentId)}?businessId=${encodeURIComponent(businessId)}`, { method: "PATCH", body: JSON.stringify({ businessId, ...patch }) });
    // A new name shows in the menus, which read the agents list.
    if ("name" in patch) void queryClient.invalidateQueries({ queryKey: ["agents", businessId] });
    await queryClient.invalidateQueries({ queryKey: ["agent-settings", businessId], refetchType });
  };
}

/** Saves the workspace's business details. */
export function useSaveWorkspace(businessId: string) {
  const queryClient = useQueryClient();
  return async ({ defaultLocale: locale, ...patch }: WorkspacePatch, refetchType: "active" | "none" = "active") => {
    await requestJson(`/api/agent?businessId=${encodeURIComponent(businessId)}`, { method: "PATCH", body: JSON.stringify({ businessId, ...patch, ...(locale ? { locale } : {}) }) });
    await queryClient.invalidateQueries({ queryKey: ["agent-settings", businessId], refetchType });
  };
}

/** The active business, and whether the person may change its settings. */
export function useManagedBusiness() {
  const { businesses, business } = useActiveBusiness();
  return { businesses, businessId: business?.businessId ?? "", canManage: Boolean(business && ["business_owner", "business_admin"].includes(business.role)) };
}
