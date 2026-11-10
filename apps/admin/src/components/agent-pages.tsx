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

// The pages under /agents/[agentId]. Each takes the agent's ID from its route.

export function AgentIdentityPage({ agentId }: { agentId: string }) {
  const { businessId, canManage } = useManagedBusiness();
  return <AgentIdentitySection agentId={agentId} businessId={businessId} canManage={canManage} />;
}

export function AgentInstructionsPage({ agentId }: { agentId: string }) {
  const { businessId, canManage } = useManagedBusiness();
  return <AgentInstructionsSection agentId={agentId} businessId={businessId} canManage={canManage} />;
}

export function AgentHandlingPage({ agentId }: { agentId: string }) {
  const { businessId, canManage } = useManagedBusiness();
  return <AgentHandlingSection agentId={agentId} businessId={businessId} canManage={canManage} />;
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

const SHARED_PAGES = ["/workspace/business", "/workspace/knowledge", "/workspace/services", "/workspace/employees", "/workspace/connections"] as const;
const SHARED_TITLES: Record<(typeof SHARED_PAGES)[number], string> = {
  "/workspace/business": "settingsPages.business",
  "/workspace/knowledge": "settingsPages.knowledge",
  "/workspace/services": "settingsPages.services",
  "/workspace/employees": "settingsPages.employees",
  "/workspace/connections": "settingsPages.connections",
};

/** The workspace pages every agent uses, as far as the business lets the person open them. */
export function AgentSharedPage() {
  const { t } = useTranslation("nav");
  const can = useBusinessCan();
  return (
    <Surface className="flex flex-col">
      {SHARED_PAGES.filter((href) => can(pageCapability(href))).map((href) => <LinkRow href={href} key={href} title={t(SHARED_TITLES[href])} />)}
    </Surface>
  );
}
