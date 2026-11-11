"use client";

import { useTranslation } from "react-i18next";

import { useUpgradePlanDialogOpener } from "@/components/upgrade-plan-dialog-context";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { useAgents, type AgentListItem } from "@/hooks/use-agents";
import { intlLocale } from "@/lib/locale";
import { Status } from "@/components/ui/status";
import { AGENT_STATUS_VARIANTS } from "@/lib/status-variants";

export function AgentAvatar({ name, size = "sm" }: { name: string; size?: "sm" | "default" }) {
  return <Avatar size={size}><AvatarFallback>{name.trim().charAt(0).toUpperCase() || "A"}</AvatarFallback></Avatar>;
}

/** Default and Paused, the two states an agent's name carries. */
export function AgentStatusBadges({ agent }: { agent: Pick<AgentListItem, "isDefault" | "paused"> }) {
  const { t } = useTranslation("nav");
  return <>
    {agent.isDefault ? <Badge variant="secondary">{t("agents.default")}</Badge> : null}
    {agent.paused ? <Status variant={AGENT_STATUS_VARIANTS.paused}>{t("agents.paused")}</Status> : null}
  </>;
}

/** How many of each channel an agent answers on, as a list in the person's language. */
export function useChannelCounts(): (agent: AgentListItem) => string {
  const { i18n, t } = useTranslation("nav");
  return (agent) => {
    const parts = [
      agent.phoneNumbers ? t("agents.channelCounts.phone", { count: agent.phoneNumbers }) : null,
      agent.widgetKeys ? t("agents.channelCounts.widget", { count: agent.widgetKeys }) : null,
      agent.instagramAccounts ? t("agents.channelCounts.instagram") : null,
    ].filter((part): part is string => Boolean(part));
    return parts.length ? new Intl.ListFormat(intlLocale(i18n.language), { style: "narrow", type: "unit" }).format(parts) : t("agentMenu.noChannels");
  };
}

/** Above a paused agent's pages: the default agent answers for it until the plan includes it again. */
export function PausedAgentNotice({ agentId }: { agentId: string }) {
  const { t } = useTranslation("nav");
  const { find, primary } = useAgents();
  const openUpgrade = useUpgradePlanDialogOpener();
  const agent = find(agentId);
  if (!agent?.paused) return null;
  return (
    <Item className="border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10" variant="outline">
      <ItemContent>
        <ItemTitle>{t("agents.pausedTitle")}</ItemTitle>
        <ItemDescription>{t("agents.pausedDescription", { name: primary?.name ?? "" })}</ItemDescription>
      </ItemContent>
      {openUpgrade ? <ItemActions><Button onClick={openUpgrade} size="sm" type="button">{t("agents.upgrade")}</Button></ItemActions> : null}
    </Item>
  );
}
