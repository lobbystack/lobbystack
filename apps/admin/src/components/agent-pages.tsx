"use client";

import { AgentHandlingSection } from "@/components/agent-handling-section";
import { AgentIdentitySection } from "@/components/agent-identity-section";
import { AgentInstructionsSection } from "@/components/agent-instructions-section";
import { ChannelsSection } from "@/components/agents/channels-section";
import { useManagedBusiness } from "@/hooks/use-agent-settings";

// The pages under /agents/[agentId]. Each takes the agent's ID from its route.

/** The agent's own page: its name, greeting and voice, then transfers, staff answers first, booking and appointment changes. */
export function AgentSettingsPage({ agentId }: { agentId: string }) {
  const { businessId, canManage } = useManagedBusiness();
  return (
    <div className="flex w-full flex-col gap-8">
      <AgentIdentitySection agentId={agentId} businessId={businessId} canManage={canManage} />
      <AgentHandlingSection agentId={agentId} businessId={businessId} canManage={canManage} />
    </div>
  );
}

export function AgentInstructionsPage({ agentId }: { agentId: string }) {
  const { businessId, canManage } = useManagedBusiness();
  return <AgentInstructionsSection agentId={agentId} businessId={businessId} canManage={canManage} />;
}

/** Where customers reach the agent: its numbers, widgets and Instagram account. */
export function AgentChannelsPage({ agentId, widgetsEnabled }: { agentId: string; widgetsEnabled: boolean }) {
  return <ChannelsSection agentId={agentId} widgetsEnabled={widgetsEnabled} />;
}
