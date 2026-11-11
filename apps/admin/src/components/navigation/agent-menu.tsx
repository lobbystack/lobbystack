"use client";

import { usePathname, useRouter } from "next/navigation";
import { AudioLines, BookOpen, Check, ChevronsUpDown, ListChecks, Plus, Radio, type LucideIcon } from "lucide-react";
import { useContext } from "react";
import { useTranslation } from "react-i18next";

import { AddAgentDialog } from "@/components/agents/add-agent-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { useManagedBusiness } from "@/hooks/use-agent-settings";
import type { AgentListItem } from "@/hooks/use-agents";
import { useAgents } from "@/hooks/use-agents";
import { agentHref, agentPageOf, AGENT_PAGES, type AgentPage } from "@/lib/agent-pages";
import { levelFor } from "@/lib/navigation-levels";
import { MenuGroup, MenuNavigationContext, MenuRow } from "./menu-parts";

const ICONS: Partial<Record<AgentPage["section"], LucideIcon>> = { "": AudioLines, rules: ListChecks, knowledge: BookOpen, channels: Radio };

/** The rows of the agent's menu: its own pages, without the pages Channels opens. */
const MENU_PAGES = AGENT_PAGES.filter((page) => page.section in ICONS);

function AgentIdentity({ agent }: { agent: AgentListItem }) {
  return <span className="min-w-0 flex-1 truncate text-start type-title">{agent.name}</span>;
}

/**
 * Names the agent this menu belongs to and switches to another on the same
 * page, so comparing two agents stays one click away. It also adds one.
 */
function AgentHeading({ agent }: { agent: AgentListItem | undefined }) {
  const { t } = useTranslation("nav");
  const router = useRouter();
  // In the phone menu, switching agents closes the sheet as the page opens.
  const navigate = useContext(MenuNavigationContext) ?? router.push;
  const pathname = usePathname();
  const { agents, hasChoice } = useAgents();
  const { canManage } = useManagedBusiness();
  if (!agent) return (
    <div className="flex items-center gap-2 px-4 pt-3 pb-1 group-data-[collapsible=icon]:hidden">
      <Skeleton className="h-4 w-24" />
    </div>
  );
  // With one agent and nothing to add, there is nothing to pick.
  if (!hasChoice && !canManage) return <div className="flex items-center gap-2 px-4 pt-3 pb-1 group-data-[collapsible=icon]:hidden"><AgentIdentity agent={agent} /></div>;
  const section = agentPageOf(pathname)?.section ?? "";
  const menu = (openAdd?: () => void) => (
    <SidebarMenu className="px-2 pt-2 group-data-[collapsible=icon]:hidden">
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger render={<SidebarMenuButton className="border border-input bg-input/30" />}>
            <AgentIdentity agent={agent} />
            <ChevronsUpDown className="ms-auto size-4 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-56">
            <DropdownMenuGroup>
              {agents.map((item) => (
                <DropdownMenuItem key={item.id} onClick={() => navigate(agentHref(item.id, section))}>
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

/** One agent's pages, one row each. */
export function AgentMenu({ agentId }: { agentId: string }) {
  const { t } = useTranslation("nav");
  const pathname = usePathname();
  const { find } = useAgents();
  const agent = find(agentId);
  // The phone menu can show an agent's menu from any page; only that agent's own pages light a row.
  const onAgent = levelFor(pathname) === `agent:${agentId}`;
  const open = onAgent ? agentPageOf(pathname)?.section ?? "" : null;
  const channels = agent ? agent.phoneNumbers + agent.widgetKeys + agent.instagramAccounts : null;
  const trailing = (section: AgentPage["section"]) => {
    if (section !== "channels" || channels === null) return undefined;
    if (channels) return <span className="type-caption text-muted-foreground tabular-nums">{channels}</span>;
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
          const active = open !== null && (page.section === "channels" ? open.startsWith("channels") : open === page.section);
          return <MenuRow active={active} href={agentHref(agentId, page.section)} key={page.section} label={label} leading={<Icon />} title={label} trailing={trailing(page.section)} />;
        })}
      </MenuGroup>
    </>
  );
}
