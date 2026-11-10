"use client";

import { usePathname, useRouter } from "next/navigation";
import { ArrowUpRight, AudioLines, Check, ChevronsUpDown, Layers, ListChecks, MessagesSquare, PhoneForwarded, Plus, Radio, ScrollText, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { AddAgentDialog } from "@/components/agents/add-agent-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { useManagedBusiness } from "@/hooks/use-agent-settings";
import type { AgentListItem } from "@/hooks/use-agents";
import { useAgents } from "@/hooks/use-agents";
import { agentHref, agentPageOf, AGENT_PAGES, type AgentPage } from "@/lib/agent-pages";
import { intlLocale } from "@/lib/locale";
import { MenuGroup, MenuRow } from "./menu-parts";

const ICONS: Partial<Record<AgentPage["section"], LucideIcon>> = { "": AudioLines, instructions: ScrollText, rules: ListChecks, handling: PhoneForwarded, channels: Radio, shared: Layers };

/** The rows of the agent's menu: its own pages, without the pages Channels opens. */
const MENU_PAGES = AGENT_PAGES.filter((page) => page.section in ICONS);

/** The kinds of channel an agent answers on, as a list in the person's language. */
function useChannelSummary(): (agent: AgentListItem) => string {
  const { i18n, t } = useTranslation(["nav", "common"]);
  return (agent) => {
    const kinds = [
      agent.phoneNumbers ? t("nav:agentPages.phone") : null,
      agent.widgetKeys ? t("nav:agentPages.widget") : null,
      agent.instagramAccounts ? t("common:channels.instagram") : null,
    ].filter((kind): kind is string => Boolean(kind));
    return kinds.length ? new Intl.ListFormat(intlLocale(i18n.language), { style: "narrow", type: "unit" }).format(kinds) : t("nav:agentMenu.noChannels");
  };
}

function AgentIdentity({ agent }: { agent: AgentListItem }) {
  const summary = useChannelSummary();
  return <>
    <Avatar size="sm"><AvatarFallback>{agent.name.trim().charAt(0).toUpperCase() || "A"}</AvatarFallback></Avatar>
    <span className="grid min-w-0 flex-1 text-start leading-tight">
      <span className="truncate text-sm font-medium">{agent.name}</span>
      <span className="truncate text-xs text-muted-foreground">{summary(agent)}</span>
    </span>
  </>;
}

/**
 * Names the agent this menu belongs to. With several it also switches
 * between them on the same page, so comparing two agents stays one click away.
 */
function AgentHeading({ agent }: { agent: AgentListItem | undefined }) {
  const { t } = useTranslation("nav");
  const router = useRouter();
  const pathname = usePathname();
  const { agents, hasChoice } = useAgents();
  const { canManage } = useManagedBusiness();
  if (!agent) return (
    <div className="flex items-center gap-2 px-4 pt-3 pb-1 group-data-[collapsible=icon]:hidden">
      <Skeleton className="size-6 rounded-full" />
      <span className="grid flex-1 gap-1"><Skeleton className="h-4 w-24" /><Skeleton className="h-3 w-32" /></span>
    </div>
  );
  if (!hasChoice) return <div className="flex items-center gap-2 px-4 pt-3 pb-1 group-data-[collapsible=icon]:hidden"><AgentIdentity agent={agent} /></div>;
  const section = agentPageOf(pathname)?.section ?? "";
  const menu = (openAdd?: () => void) => (
    <SidebarMenu className="px-2 pt-2 group-data-[collapsible=icon]:hidden">
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger render={<SidebarMenuButton className="data-[popup-open=true]:bg-sidebar-accent" size="lg" />}>
            <AgentIdentity agent={agent} />
            <ChevronsUpDown className="ms-auto size-4 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-56">
            <DropdownMenuGroup>
              {agents.map((item) => (
                <DropdownMenuItem key={item.id} onClick={() => router.push(agentHref(item.id, section))}>
                  {item.id === agent.id ? <Check /> : <span aria-hidden="true" className="size-4" />}
                  <span className="truncate">{item.name}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            {openAdd ? <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={openAdd}><Plus />{t("agents.add")}</DropdownMenuItem>
            </> : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
  return canManage ? <AddAgentDialog copyFromAgentId={agent.id} trigger={(openAdd) => menu(openAdd)} /> : menu();
}

/** One agent's pages, one row each. Its label says Shared belongs to every agent, so it needs no badge, which would cut it short. */
export function AgentMenu({ agentId }: { agentId: string }) {
  const { t } = useTranslation("nav");
  const pathname = usePathname();
  const { find, hasChoice } = useAgents();
  const agent = find(agentId);
  const open = agentPageOf(pathname)?.section ?? "";
  const channels = agent ? agent.phoneNumbers + agent.widgetKeys + agent.instagramAccounts : null;
  const trailing = (section: AgentPage["section"]) => {
    if (section !== "channels" || channels === null) return undefined;
    if (channels) return <span className="text-xs text-muted-foreground tabular-nums">{channels}</span>;
    return <><span aria-hidden="true" className="size-2 rounded-full bg-primary" /><span className="sr-only">{t("agentMenu.noChannels")}</span></>;
  };
  return (
    <>
      <AgentHeading agent={agent} />
      <MenuGroup>
        {MENU_PAGES.map((page) => {
          const Icon = ICONS[page.section]!;
          const label = t(page.titleKey);
          // Channels stays lit on the phone number and widget pages it opens.
          const active = page.section === "channels" ? open.startsWith("channels") : open === page.section;
          return <MenuRow active={active} href={agentHref(agentId, page.section)} key={page.section} label={label} leading={<Icon />} title={label} trailing={trailing(page.section)} />;
        })}
      </MenuGroup>
      {hasChoice ? <MenuGroup><MenuRow href={`/inbox?agent=${encodeURIComponent(agentId)}`} label={t("agentMenu.conversations")} leading={<MessagesSquare />} title={t("agentMenu.conversations")} trailing={<ArrowUpRight className="size-4 text-muted-foreground/60" />} /></MenuGroup> : null}
    </>
  );
}
