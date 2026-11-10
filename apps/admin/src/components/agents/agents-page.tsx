"use client";

import Link from "next/link";
import { ChevronRight, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";

import { HeaderButtonSkeleton, HiddenTextSkeleton } from "@/components/loading-skeletons";
import { PageHeader } from "@/components/page-header";
import { useUpgradePlanDialogOpener } from "@/components/upgrade-plan-dialog-context";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { useManagedBusiness } from "@/hooks/use-agent-settings";
import { useAgents } from "@/hooks/use-agents";
import { agentHref } from "@/lib/agent-pages";
import { AddAgentDialog } from "./add-agent-dialog";
import { AgentAvatar, AgentStatusBadges, useChannelCounts } from "./agent-badges";

/** The list before the agents load: one row, with the default agent's badge. */
export function AgentsListSkeleton({ defaultLabel }: { defaultLabel: string }) {
  return (
    <ItemGroup aria-busy="true" className="gap-3" data-testid="agents-loading">
      <Item variant="outline">
        <ItemMedia><Skeleton className="size-8 rounded-full" /></ItemMedia>
        <ItemContent>
          <ItemTitle><Skeleton className="h-5 w-32" /><HiddenTextSkeleton className="rounded-full">{defaultLabel}</HiddenTextSkeleton></ItemTitle>
          <Skeleton className="h-4 w-40" />
        </ItemContent>
        <ItemActions><ChevronRight aria-hidden="true" className="size-4 text-muted-foreground/40" /></ItemActions>
      </Item>
    </ItemGroup>
  );
}

/** Every agent in the workspace, with its channels and whether it's the default or paused. */
export function AgentsPage() {
  const { t } = useTranslation("nav");
  const { agents, loading, primary } = useAgents();
  const { canManage } = useManagedBusiness();
  const openUpgrade = useUpgradePlanDialogOpener();
  const channelCounts = useChannelCounts();
  const addButton = canManage ? (loading ? <HeaderButtonSkeleton label={t("agents.add")} /> : <AddAgentDialog copyFromAgentId={primary?.id} trigger={(open) => <Button onClick={open} size="sm" type="button"><Plus data-icon="inline-start" />{t("agents.add")}</Button>} />) : null;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader actions={addButton} title={t("agents.title")} />
      {loading ? <AgentsListSkeleton defaultLabel={t("agents.default")} /> : (
        <ItemGroup className="gap-3">
          {agents.map((agent) => (
            // The name's link covers the row, so the row opens the agent and Upgrade stays its own button.
            <Item className="relative hover:bg-muted/50" key={agent.id} variant="outline">
              <ItemMedia><AgentAvatar name={agent.name} size="default" /></ItemMedia>
              <ItemContent>
                <ItemTitle><Link className="truncate after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-[3px] focus-visible:after:ring-ring/50" href={agentHref(agent.id)}>{agent.name}</Link><AgentStatusBadges agent={agent} /></ItemTitle>
                <ItemDescription>{channelCounts(agent)}</ItemDescription>
              </ItemContent>
              <ItemActions>
                {agent.paused && openUpgrade ? <Button className="relative z-10" onClick={openUpgrade} size="sm" type="button" variant="outline">{t("agents.upgrade")}</Button> : null}
                <ChevronRight aria-hidden="true" className="size-4 text-muted-foreground" />
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      )}
    </div>
  );
}
