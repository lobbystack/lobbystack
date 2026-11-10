"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";

import { WorkspaceSwitcher } from "@/components/layout/workspace-switcher";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarRail } from "@/components/ui/sidebar";
import { useAgents } from "@/hooks/use-agents";
import { agentHref } from "@/lib/agent-pages";
import { agentIdOf, backTarget, follow, levelFor, startTrail, type Direction, type Frame, type Trail } from "@/lib/navigation-levels";
import { AccountMenu, type NavigationUser } from "./account-menu";
import { AgentMenu } from "./agent-menu";
import { HelpMenu } from "./help-menu";
import { BackRow, MenuRow } from "./menu-parts";
import { NavGroup, useNavLinks, type NavLink } from "./nav-group";
import { SearchButton } from "./search-button";
import { SettingsMenu } from "./settings-menu";

/** Past this many the menu stops listing agents under Agents. */
const LISTED_AGENTS = 6;

const CHEVRON = <ChevronRight className="size-4 text-muted-foreground/60" />;
const SLIDE: Record<Direction, string> = {
  in: "animate-in fade-in-0 slide-in-from-right-4",
  out: "animate-in fade-in-0 slide-in-from-left-4",
  across: "animate-in fade-in-0",
};

function WorkspaceMenu() {
  const { allowed, links } = useNavLinks();
  const { agents, hasChoice } = useAgents();
  // With one agent the row opens it and swaps the menu. With several it opens the list, and each name under it swaps the menu.
  const agentsLink: NavLink = hasChoice
    ? { ...links.agents, isActive: (pathname) => pathname === "/agents", children: agents.slice(0, LISTED_AGENTS).map((agent) => <MenuRow href={agentHref(agent.id)} indented keepOpen key={agent.id} label={agent.name} title={agent.name} trailing={CHEVRON} />) }
    : { ...links.agents, keepOpen: true, trailing: CHEVRON };
  return <NavGroup items={allowed([links.home, links.inbox, links.appointments, links.contacts, links.analytics, agentsLink, { ...links.settings, keepOpen: true, trailing: CHEVRON }])} />;
}

/** Follows the route into a trail, so the back row knows where the person came from. */
function useTrail(): Trail {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const href = search ? `${pathname}?${search}` : pathname;
  const level = levelFor(pathname);
  const [trail, setTrail] = useState(() => startTrail(level, href));
  if (trail.level === level && trail.href === href) return trail;
  const next = follow(trail, level, href);
  setTrail(next);
  return next;
}

/** What the back row names: the agent, Settings, or the workspace page it returns to. */
function useBackLabel() {
  const { t } = useTranslation("nav");
  const { links } = useNavLinks();
  const { find } = useAgents();
  const roots: NavLink[] = [links.inbox, links.appointments, links.contacts, links.analytics, links.agents];
  return (frame: Frame) => {
    const agentId = agentIdOf(frame.level);
    if (agentId) return find(agentId)?.name ?? t("items.agents");
    if (frame.level === "settings") return t("items.settings");
    const path = frame.href.split("?")[0]!;
    return roots.find((link) => path === link.href || path.startsWith(`${link.href}/`))?.label ?? links.home.label;
  };
}

/**
 * The dashboard's sidebar. One workspace menu; opening an agent or Settings
 * swaps the middle for that one's menu, with a row back. The switcher, search,
 * help and the account menu never move.
 */
export function NavigationSidebar({ partnerConsole = false, user }: { partnerConsole?: boolean; user: NavigationUser }) {
  const trail = useTrail();
  const backLabel = useBackLabel();
  const agentId = agentIdOf(trail.level);
  const back = backTarget(trail);
  return (
    <Sidebar className="absolute inset-y-0 h-full" collapsible="icon" variant="sidebar">
      <SidebarHeader>
        <WorkspaceSwitcher />
        <SearchButton />
      </SidebarHeader>
      <SidebarContent className="overflow-x-hidden">
        {/* Keyed by level, so each swap replays the slide. Reduced motion drops it. */}
        <div className={`flex flex-1 flex-col duration-200 ease-out motion-reduce:animate-none ${trail.direction ? SLIDE[trail.direction] : ""}`} data-menu-level={trail.level} key={trail.level}>
          {trail.level === "root" ? <WorkspaceMenu /> : <>
            <BackRow href={back.href} label={backLabel(back)} />
            {trail.level === "settings" ? <SettingsMenu /> : agentId ? <AgentMenu agentId={agentId} /> : null}
          </>}
        </div>
      </SidebarContent>
      <SidebarFooter>
        {/* Help sits beside the account menu, so it's on every menu and costs no row. */}
        <div className="flex items-center gap-1 group-data-[collapsible=icon]:flex-col-reverse">
          <div className="min-w-0 flex-1 group-data-[collapsible=icon]:flex-none"><AccountMenu partnerConsole={partnerConsole} user={user} /></div>
          <span className="hidden md:contents"><HelpMenu side="top" /></span>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
