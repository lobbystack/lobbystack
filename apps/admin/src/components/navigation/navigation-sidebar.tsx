"use client";

import { usePathname } from "next/navigation";
import { Fragment, useState } from "react";
import { useTranslation } from "react-i18next";

import { WorkspaceSwitcher } from "@/components/layout/workspace-switcher";
import { Separator } from "@/components/ui/separator";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarRail } from "@/components/ui/sidebar";
import { useAgents } from "@/hooks/use-agents";
import { agentHref, agentPageOf } from "@/lib/agent-pages";
import { agentIdOf, directionBetween, levelFor, type Direction, type MenuLevel } from "@/lib/navigation-levels";
import { ACCOUNT_PAGES, BUSINESS_PAGES, currentSettingsPage, WORKSPACE_PAGES } from "@/lib/settings-pages";
import { AccountMenu, type NavigationUser } from "./account-menu";
import { AgentMenu } from "./agent-menu";
import { BackRow, MenuRow, SectionTrailing } from "./menu-parts";
import { NavGroup, useNavLinks, type NavLink } from "./nav-group";
import { SearchButton } from "./search-button";
import { BusinessMenu, SettingsMenu } from "./settings-menu";

/** Past this many the menu stops listing agents under Agents. */
const LISTED_AGENTS = 6;

const SLIDE: Record<Direction, string> = {
  in: "animate-in fade-in-0 slide-in-from-right-4",
  out: "animate-in fade-in-0 slide-in-from-left-4",
  across: "animate-in fade-in-0",
};

/** The name of the page the person is on inside a section, for that section's row in the workspace menu. */
function useSectionPage(): string | null {
  const pathname = usePathname();
  const { t } = useTranslation("nav");
  const section = levelFor(pathname);
  if (agentIdOf(section)) {
    const page = agentPageOf(pathname);
    return page ? t(page.titleKey) : null;
  }
  const pages = section === "business" ? BUSINESS_PAGES : section === "settings" ? [...WORKSPACE_PAGES, ...ACCOUNT_PAGES] : [];
  const page = currentSettingsPage(pages, pathname);
  return page ? t(page.menuKey ?? page.titleKey) : null;
}

/**
 * The workspace menu. A row that opens a section ends in a chevron. The row
 * of the section the person is in stays lit, names the page they're on, and
 * opens that section's menu again without leaving the page.
 */
function WorkspaceMenu({ onDrillIn, section }: { onDrillIn: () => void; section: MenuLevel }) {
  const { allowed, links } = useNavLinks();
  const { agents, hasChoice } = useAgents();
  const sectionPage = useSectionPage();
  const trailing = (level: MenuLevel) => <SectionTrailing page={level === section ? sectionPage : null} />;
  const drill = (level: MenuLevel) => (level === section ? { onSelect: onDrillIn } : {});
  const sectionAgent = agentIdOf(section);
  const listed = agents.slice(0, LISTED_AGENTS);
  // An agent the list leaves out lights Agents instead.
  const agentListed = Boolean(sectionAgent && listed.some((agent) => agent.id === sectionAgent));
  const agentsLevel: MenuLevel = sectionAgent && !agentListed ? section : "root";
  // With one agent the row opens it and swaps the menu. With several it opens the list, and each name under it swaps the menu.
  const agentsLink: NavLink = hasChoice
    ? { ...links.agents, isActive: (pathname) => pathname === "/agents" || agentsLevel !== "root", ...(agentsLevel !== "root" ? { trailing: trailing(agentsLevel), ...drill(agentsLevel) } : {}), children: listed.map((agent) => {
      const level: MenuLevel = `agent:${agent.id}`;
      return <MenuRow active={level === section} href={agentHref(agent.id)} indented keepOpen key={agent.id} label={agent.name} title={agent.name} trailing={trailing(level)} {...drill(level)} />;
    }) }
    : { ...links.agents, keepOpen: true, trailing: trailing(sectionAgent ? section : "root"), ...(sectionAgent ? drill(section) : {}) };
  const sectionLink = (link: NavLink, level: MenuLevel): NavLink => ({ ...link, keepOpen: true, isActive: () => section === level, trailing: trailing(level), ...drill(level) });
  // Three groups with a line between them: the conversations, the records, then the sections that open their own menus.
  const groups = [
    allowed([links.home, links.inbox]),
    allowed([links.appointments, links.contacts, links.analytics]),
    allowed([agentsLink, sectionLink(links.business, "business"), sectionLink(links.settings, "settings")]),
  ].filter((items) => items.length > 0);
  return groups.map((items, index) => <Fragment key={items[0]!.href}>
    {index > 0 ? <Separator className="mx-5 w-auto! bg-sidebar-border group-data-[collapsible=icon]:mx-3" data-sidebar="separator" /> : null}
    <NavGroup items={items} />
  </Fragment>);
}

/**
 * Which menu the sidebar shows. Opening a page shows its section's menu, from
 * a link, search or the address bar alike. The back row and the section's
 * row in the workspace menu only switch menus; the page stays.
 */
function useMenuLevel() {
  const pathname = usePathname();
  const section = levelFor(pathname);
  const [state, setState] = useState<{ pathname: string; shown: MenuLevel; direction: Direction | null }>({ pathname, shown: section, direction: null });
  let current = state;
  if (state.pathname !== pathname) {
    current = { pathname, shown: section, direction: directionBetween(state.shown, section) ?? state.direction };
    setState(current);
  }
  const show = (level: MenuLevel) => setState({ ...current, shown: level, direction: directionBetween(current.shown, level) });
  return { section, shown: current.shown, direction: current.direction, show };
}

/** What the back row names: the agent, Business or Settings. */
function useSectionTitle() {
  const { t } = useTranslation("nav");
  // An agent's menu is under Agents; the switcher below the row names the agent.
  return (level: MenuLevel) => {
    if (agentIdOf(level)) return t("items.agents");
    return t(level === "business" ? "items.business" : "items.settings");
  };
}

/**
 * The dashboard's sidebar. One workspace menu; opening an agent, Business or
 * Settings swaps the middle for that one's menu, with a row back. The switcher, search
 * and the account menu never move.
 */
export function NavigationSidebar({ partnerConsole = false, user }: { partnerConsole?: boolean; user: NavigationUser }) {
  const menu = useMenuLevel();
  const sectionTitle = useSectionTitle();
  const agentId = agentIdOf(menu.shown);
  return (
    <Sidebar className="absolute inset-y-0 h-full" collapsible="icon" variant="sidebar">
      <SidebarHeader>
        <WorkspaceSwitcher />
        <SearchButton />
      </SidebarHeader>
      <SidebarContent className="overflow-x-hidden">
        {/* Keyed by level, so each swap replays the slide. Reduced motion drops it. */}
        <div className={`flex flex-1 flex-col duration-200 ease-out motion-reduce:animate-none ${menu.direction ? SLIDE[menu.direction] : ""}`} data-menu-level={menu.shown} key={menu.shown}>
          {menu.shown === "root" ? <WorkspaceMenu onDrillIn={() => menu.show(menu.section)} section={menu.section} /> : <>
            <BackRow label={sectionTitle(menu.shown)} onBack={() => menu.show("root")} />
            {menu.shown === "settings" ? <SettingsMenu /> : menu.shown === "business" ? <BusinessMenu /> : agentId ? <AgentMenu agentId={agentId} /> : null}
          </>}
        </div>
      </SidebarContent>
      <SidebarFooter>
        <AccountMenu partnerConsole={partnerConsole} user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
