"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { AgentActionsMenu } from "@/components/agents/agent-actions";
import { PausedAgentNotice } from "@/components/agents/agent-badges";
import { NestedPageSurfaceProvider } from "@/components/page-surface";
import { HeaderActionsSlotContext } from "@/components/header-actions";
import { HeaderButtonSkeleton } from "@/components/loading-skeletons";
import { TestCallButton } from "@/components/navigation/test-call-button";
import { PageHeader } from "@/components/page-header";
import { useAgentSettingsQuery, useManagedBusiness } from "@/hooks/use-agent-settings";
import { agentPageOf } from "@/lib/agent-pages";

/**
 * The header of an agent's pages: the agent's name on its own page, else the
 * section's title, with a Test call button for this agent and, for people
 * who manage the business, the agent's actions. A paused agent says so above
 * every page. Rules puts an add button in the header once the slot below
 * exists; until then, which includes the server render, the header shows its
 * placeholder.
 */
export function AgentShell({ agent, children }: { agent: { id: string; name: string }; children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useTranslation(["nav", "agent"]);
  const { businessId, canManage } = useManagedBusiness();
  // A rename shows here once it's saved.
  const name = useAgentSettingsQuery(businessId, businessId ? agent.id : "").data?.profile?.name ?? agent.name;
  const page = agentPageOf(pathname);
  const hasActions = page?.section === "rules";
  const [actionsSlot, setActionsSlot] = useState<HTMLElement | null>(null);
  return (
    <section className="flex flex-1 flex-col gap-6">
      <PageHeader actions={<>{/* Adding, removing and the default belong to the agent's own page, not each section. */}{canManage && !page?.section ? <AgentActionsMenu agentId={agent.id} /> : null}<TestCallButton agentId={agent.id} /><div className="contents" ref={setActionsSlot} />{hasActions && !actionsSlot ? <HeaderButtonSkeleton label={t("agent:sections.rules.addKnowledge")} /> : null}</>} title={page && page.section ? t(`nav:${page.titleKey}`) : name} />
      <PausedAgentNotice agentId={agent.id} />
      <div className="w-full"><HeaderActionsSlotContext.Provider value={actionsSlot}><NestedPageSurfaceProvider>{children}</NestedPageSurfaceProvider></HeaderActionsSlotContext.Provider></div>
    </section>
  );
}
