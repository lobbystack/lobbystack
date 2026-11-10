"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";

import { AgentHandlingSection } from "@/components/agent-handling-section";
import { AgentIdentitySection } from "@/components/agent-identity-section";
import { AgentInstructionsSection } from "@/components/agent-instructions-section";
import { useBusinessCan } from "@/components/business-capabilities-provider";
import { ChannelsSection } from "@/components/agents/channels-section";
import { settingRowClassName } from "@/components/text-setting-row";
import { Item, ItemActions, ItemContent, ItemTitle } from "@/components/ui/item";
import { Surface } from "@/components/ui/surface";
import { useManagedBusiness } from "@/hooks/use-agent-settings";
import { pageCapability } from "@/lib/dashboard-pages";
import { BUSINESS_PAGES } from "@/lib/settings-pages";

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

function LinkRow({ href, title }: { href: string; title: string }) {
  return (
    <Item className={settingRowClassName} render={<Link href={href} />} variant="default">
      <ItemContent><ItemTitle>{title}</ItemTitle></ItemContent>
      <ItemActions><ChevronRight aria-hidden="true" className="size-4 text-muted-foreground" /></ItemActions>
    </Item>
  );
}

/** Where customers reach the agent: its numbers, widgets and Instagram account. */
export function AgentChannelsPage({ agentId, widgetsEnabled }: { agentId: string; widgetsEnabled: boolean }) {
  return <ChannelsSection agentId={agentId} widgetsEnabled={widgetsEnabled} />;
}


/** The Business pages every agent uses, as far as the business lets the person open them. */
export function AgentSharedPage() {
  const { t } = useTranslation("nav");
  const can = useBusinessCan();
  return (
    <Surface className="flex flex-col">
      {BUSINESS_PAGES.filter((page) => can(pageCapability(page.href))).map((page) => <LinkRow href={page.href} key={page.href} title={t(page.titleKey)} />)}
    </Surface>
  );
}
