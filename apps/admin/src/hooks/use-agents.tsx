"use client";

import { createContext, useContext } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useBusinessCan } from "@/components/business-capabilities-provider";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { requestJson } from "@/lib/request-json";

/** One agent from `GET /api/agents`: its name, whether it's the default or paused, and how many channels it answers on. */
export type AgentListItem = {
  id: string;
  name: string;
  isDefault: boolean;
  paused: boolean;
  phoneNumbers: number;
  widgetKeys: number;
  instagramAccounts: number;
  createdAt: string;
  updatedAt: string;
};

/** The agents the server loaded with the page, so the menu shows them on the first render. */
export type AgentsSeed = { businessId: string; agents: AgentListItem[] };

const AgentsSeedContext = createContext<AgentsSeed | null>(null);

export function AgentsSeedProvider({ children, seed }: { children: React.ReactNode; seed: AgentsSeed | null }) {
  return <AgentsSeedContext.Provider value={seed}>{children}</AgentsSeedContext.Provider>;
}

export function agentsQueryKey(businessId: string | undefined) {
  return ["agents", businessId] as const;
}

/**
 * The active business's agents, the default first. Listing them needs setup,
 * so someone with activity alone gets none and the menus leave agents out.
 */
export function useAgents() {
  const { business } = useActiveBusiness();
  const can = useBusinessCan();
  const seed = useContext(AgentsSeedContext);
  const businessId = business?.businessId ?? seed?.businessId;
  const enabled = Boolean(businessId) && can("setup");
  const query = useQuery({
    queryKey: agentsQueryKey(businessId),
    queryFn: () => requestJson<AgentListItem[]>(`/api/agents?businessId=${encodeURIComponent(businessId!)}`),
    enabled,
    // The server's list is fresh as the page loads.
    staleTime: 30_000,
    ...(seed && seed.businessId === businessId ? { initialData: seed.agents } : {}),
  });
  const agents = enabled ? query.data ?? [] : [];
  const primary = agents.find((agent) => agent.isDefault) ?? agents[0];
  return {
    agents,
    primary,
    /** Whether there is more than one agent to pick from. */
    hasChoice: agents.length > 1,
    find: (agentId: string) => agents.find((agent) => agent.id === agentId),
    loading: enabled && query.isPending,
  };
}

/** A kind of channel, as `PUT /api/agents/channels` names it. */
export type AgentChannelKind = "phone_number" | "widget_key" | "instagram_account";

/** The agent `POST /api/agents` returns. */
export type CreatedAgent = { id: string; name: string };

/**
 * Changes to the active business's agents. Each one refreshes the agents list,
 * and the channel lists and settings a change can move.
 */
export function useAgentActions() {
  const { business } = useActiveBusiness();
  const seed = useContext(AgentsSeedContext);
  const businessId = business?.businessId ?? seed?.businessId ?? "";
  const queryClient = useQueryClient();
  const url = (path: string) => `${path}?businessId=${encodeURIComponent(businessId)}`;
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: agentsQueryKey(businessId) }),
      queryClient.invalidateQueries({ queryKey: ["agent-settings", businessId] }),
      queryClient.invalidateQueries({ queryKey: ["phone-numbers", businessId] }),
      queryClient.invalidateQueries({ queryKey: ["widget-keys", businessId] }),
      queryClient.invalidateQueries({ queryKey: ["integrations", "instagram", businessId] }),
    ]);
  };
  const create = useMutation({
    mutationFn: (input: { name: string; copyFromAgentId?: string | undefined }) => requestJson<CreatedAgent>(url("/api/agents"), { method: "POST", body: JSON.stringify({ name: input.name, ...(input.copyFromAgentId ? { copyFromAgentId: input.copyFromAgentId } : {}) }) }),
    onSuccess: refresh,
  });
  const archive = useMutation({
    mutationFn: (input: { agentId: string; reassignToAgentId?: string | undefined }) => requestJson<{ moved: number }>(url(`/api/agents/${encodeURIComponent(input.agentId)}`), { method: "DELETE", body: JSON.stringify(input.reassignToAgentId ? { reassignToAgentId: input.reassignToAgentId } : {}) }),
    // Not awaited: the refreshed list no longer has the removed agent, which
    // unmounts the dialog on its page before it can leave for /agents.
    onSuccess: () => { void refresh(); },
  });
  const setDefault = useMutation({
    mutationFn: (agentId: string) => requestJson<{ ok: true }>(url(`/api/agents/${encodeURIComponent(agentId)}/default`), { method: "POST" }),
    onSuccess: refresh,
  });
  const move = useMutation({
    mutationFn: (input: { kind: AgentChannelKind; id: string; agentId: string }) => requestJson<{ ok: true }>(url("/api/agents/channels"), { method: "PUT", body: JSON.stringify(input) }),
    onSuccess: refresh,
  });
  return { businessId, create, archive, setDefault, move };
}
