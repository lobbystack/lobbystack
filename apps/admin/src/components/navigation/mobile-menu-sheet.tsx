"use client";

import { usePathname } from "next/navigation";
import { useState, type ReactNode, type RefObject } from "react";
import { ChevronRight, ExternalLink, LayoutList, SearchIcon, XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { WorkspaceSwitcher } from "@/components/layout/workspace-switcher";
import { accountItemLink, useAccountMenuGroups, type AccountMenuItem } from "@/components/nav-user";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetClose, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { useAgents } from "@/hooks/use-agents";
import { agentIdOf, levelFor, type Direction, type MenuLevel } from "@/lib/navigation-levels";
import { useAccountMenu, type NavigationUser } from "./account-menu";
import { AgentMenu } from "./agent-menu";
import { BackRow, MenuGroup, MenuNavigationContext, MenuRow, useMenuLinkClick } from "./menu-parts";
import { useNavLinks, type NavLink } from "./nav-group";
import { openSearch, useSearchReady } from "./search-button";
import { BusinessMenu, SettingsMenu } from "./settings-menu";

/** The sheet's menus: the sidebar's, plus the list of agents that the sidebar shows under Agents. */
export type SheetLevel = MenuLevel | "agents";

const DEPTH = (level: SheetLevel) => (level === "root" ? 0 : agentIdOf(level as MenuLevel) ? 2 : 1);

const SLIDE: Record<Direction, string> = {
  in: "animate-in fade-in-0 slide-in-from-right-4",
  out: "animate-in fade-in-0 slide-in-from-left-4",
  across: "animate-in fade-in-0",
};

function directionBetween(from: SheetLevel, to: SheetLevel): Direction | null {
  if (from === to) return null;
  const change = DEPTH(to) - DEPTH(from);
  return change > 0 ? "in" : change < 0 ? "out" : "across";
}

/** A row that opens another menu in the sheet, ending in a chevron. */
function DrillRow({ icon: Icon, label, onSelect }: { icon: NavLink["icon"]; label: string; onSelect: () => void }) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton data-drill-row="" onClick={onSelect}>
        <Icon aria-hidden="true" className="size-4 shrink-0 [&_svg]:size-4" size={16} />
        <span className="min-w-0 truncate">{label}</span>
        <ChevronRight className="ms-auto text-muted-foreground/60" />
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/**
 * The sheet's first menu: search and the pages the tab bar leaves out, then
 * Agents, Business and Settings, which open their menus in the sheet.
 */
function RootMenu({ closeThen, onDrill }: { closeThen: (next?: () => void) => void; onDrill: (level: SheetLevel) => void }) {
  const { t } = useTranslation("nav");
  const pathname = usePathname();
  const { allowed, links } = useNavLinks();
  const { hasChoice, primary } = useAgents();
  const searchReady = useSearchReady();
  const analytics = allowed([links.analytics]);
  // With one agent, Agents opens its menu; before the agents load, it opens the default agent's page.
  const agentsTarget: SheetLevel | null = hasChoice ? "agents" : primary ? `agent:${primary.id}` : null;
  const sections = allowed([links.agents, links.business, links.settings]);
  return (
    <>
      <MenuGroup>
        {searchReady ? (
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => closeThen(openSearch)}>
              <SearchIcon />
              <span>{t("search.button")}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ) : null}
        {analytics.map((link) => <MenuRow active={pathname.startsWith(link.href)} href={link.href} key={link.href} label={link.label} leading={<link.icon aria-hidden="true" className="size-4 shrink-0 [&_svg]:size-4" size={16} />} title={link.label} />)}
      </MenuGroup>
      {sections.length ? <MenuGroup>
        {sections.map((link) => {
          if (link === links.agents && !agentsTarget) return <MenuRow href={link.href} key={link.href} label={link.label} leading={<link.icon aria-hidden="true" className="size-4 shrink-0 [&_svg]:size-4" size={16} />} title={link.label} />;
          const level: SheetLevel = link === links.agents ? agentsTarget! : link === links.business ? "business" : "settings";
          return <DrillRow icon={link.icon} key={link.href} label={link.label} onSelect={() => onDrill(level)} />;
        })}
      </MenuGroup> : null}
    </>
  );
}

/** Every agent, each opening its menu, and the page that lists them. */
function AgentsList({ onDrill }: { onDrill: (level: SheetLevel) => void }) {
  const { t } = useTranslation("nav");
  const pathname = usePathname();
  const { agents } = useAgents();
  return (
    <MenuGroup>
      <MenuRow active={pathname === "/agents"} href="/agents" label={t("mobileNav.allAgents")} leading={<LayoutList />} title={t("mobileNav.allAgents")} />
      {agents.map((agent) => (
        <SidebarMenuItem key={agent.id}>
          <SidebarMenuButton data-drill-row="" isActive={levelFor(pathname) === `agent:${agent.id}`} onClick={() => onDrill(`agent:${agent.id}`)}>
            <span className="min-w-0 truncate">{agent.name}</span>
            <ChevronRight className="ms-auto text-muted-foreground/60" />
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </MenuGroup>
  );
}

/** One account menu item as a sheet row. Pages close the sheet as they open, and actions run once it has closed. */
function AccountRow({ closeThen, item }: { closeThen: (next?: () => void) => void; item: AccountMenuItem }) {
  const onLinkClick = useMenuLinkClick();
  const link = accountItemLink(item);
  const inApp = Boolean(item.href) && !item.external && !item.href!.startsWith("mailto:");
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        onClick={(event: React.MouseEvent) => {
          if (item.keepOpen) { item.onSelect?.(); return; }
          if (inApp) { item.onSelect?.(); onLinkClick(event, item.href!); return; }
          if (item.onSelect) closeThen(item.onSelect);
        }}
        {...(link ? { render: link } : {})}
      >
        <item.icon />
        <span className="min-w-0 truncate">{item.label}</span>
        {item.key === "help" ? <ExternalLink className="ms-auto text-muted-foreground" /> : null}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/** The account menu's items, under the person's email. */
function AccountSection({ closeThen, onFeedback, partnerConsole, user }: { closeThen: (next?: () => void) => void; onFeedback: () => void; partnerConsole: boolean; user: NavigationUser }) {
  const { t } = useTranslation("nav");
  const actions = useAccountMenu({ partnerConsole });
  const groups = useAccountMenuGroups({ ...actions, onFeedback });
  return (
    <SidebarGroup aria-label={t("accountMenu")} className="mt-auto" data-account-section="" role="group">
      <SidebarGroupLabel className="h-auto gap-2 py-2 text-sm text-muted-foreground">
        <Avatar size="sm"><AvatarFallback>{user.email.trim().charAt(0).toUpperCase() || "?"}</AvatarFallback></Avatar>
        <span className="min-w-0 truncate" title={user.email}>{user.email}</span>
      </SidebarGroupLabel>
      {groups.map((group, index) => (
        <SidebarMenu className={index > 0 ? "mt-2 border-t border-sidebar-border pt-2" : undefined} key={group[0]!.key}>
          {group.map((item) => <AccountRow closeThen={closeThen} item={item} key={item.key} />)}
        </SidebarMenu>
      ))}
    </SidebarGroup>
  );
}

/** What the back row names, and the menu it goes back to. */
function useBack() {
  const { t } = useTranslation("nav");
  const { hasChoice } = useAgents();
  return (level: SheetLevel): { label: string; to: SheetLevel } => {
    if (agentIdOf(level as MenuLevel)) return { label: t("items.agents"), to: hasChoice ? "agents" : "root" };
    if (level === "agents") return { label: t("items.agents"), to: "root" };
    return { label: t(level === "business" ? "items.business" : "items.settings"), to: "root" };
  };
}

/** The menu the sheet shows, which opens on the current page's section, as the sidebar does. */
function SheetMenus({ closeThen, onFeedback, partnerConsole, user }: { closeThen: (next?: () => void) => void; onFeedback: () => void; partnerConsole: boolean; user: NavigationUser }) {
  const pathname = usePathname();
  const back = useBack();
  const [state, setState] = useState<{ shown: SheetLevel; direction: Direction | null }>(() => ({ shown: levelFor(pathname), direction: null }));
  const show = (level: SheetLevel) => setState((current) => ({ shown: level, direction: directionBetween(current.shown, level) }));
  const { shown } = state;
  const agentId = agentIdOf(shown as MenuLevel);
  let menu: ReactNode;
  if (shown === "root") menu = <RootMenu closeThen={closeThen} onDrill={show} />;
  else {
    const { label, to } = back(shown);
    menu = <>
      <BackRow label={label} onBack={() => show(to)} />
      {shown === "agents" ? <AgentsList onDrill={show} /> : shown === "settings" ? <SettingsMenu /> : shown === "business" ? <BusinessMenu /> : agentId ? <AgentMenu agentId={agentId} /> : null}
    </>;
  }
  return (
    <div className="flex min-h-full flex-col pb-[env(safe-area-inset-bottom)]">
      {/* Keyed by level, so each swap replays the slide. Reduced motion drops it. */}
      <div className={`flex flex-col duration-200 ease-out motion-reduce:animate-none ${state.direction ? SLIDE[state.direction] : ""}`} data-menu-level={shown} key={shown}>
        {menu}
      </div>
      {shown === "root" ? <>
        <Separator className="mx-5 w-auto! bg-sidebar-border" />
        <AccountSection closeThen={closeThen} onFeedback={onFeedback} partnerConsole={partnerConsole} user={user} />
      </> : null}
    </div>
  );
}

type MobileMenuSheetProps = {
  open: boolean;
  /** Closes the sheet, then runs what follows, such as opening search. */
  closeThen: (next?: () => void) => void;
  /** Closes the sheet and opens a page. */
  navigate: (href: string) => void;
  /** Where focus goes once the sheet closes: the Menu tab. */
  finalFocus: RefObject<HTMLElement | null>;
  onFeedback: () => void;
  partnerConsole: boolean;
  user: NavigationUser;
};

/**
 * The phone's menu: a full-screen sheet that slides up, with the business
 * switcher and a close button on top. It holds what the sidebar does beyond
 * the tab bar, with the same menus, and the account menu at the bottom.
 */
export function MobileMenuSheet({ closeThen, finalFocus, navigate, onFeedback, open, partnerConsole, user }: MobileMenuSheetProps) {
  const { t } = useTranslation(["nav", "common"]);
  return (
    <Sheet onOpenChange={(next) => { if (!next) closeThen(); }} open={open}>
      <SheetContent
        className="inset-0 h-dvh max-h-dvh gap-0 border-t-0 bg-sidebar p-0 text-sidebar-foreground duration-300 ease-out motion-reduce:transition-none data-[side=bottom]:data-ending-style:translate-y-full data-[side=bottom]:data-starting-style:translate-y-full"
        data-mobile-menu=""
        finalFocus={finalFocus}
        showCloseButton={false}
        side="bottom"
      >
        <SheetTitle className="sr-only">{t("nav:mobileNav.menu")}</SheetTitle>
        <div className="flex shrink-0 items-center gap-2 border-b border-sidebar-border px-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-2">
          <div className="min-w-0 flex-1"><WorkspaceSwitcher /></div>
          <SheetClose render={<Button className="shrink-0" size="icon" variant="ghost" />}>
            <XIcon />
            <span className="sr-only">{t("common:accessibility.close")}</span>
          </SheetClose>
        </div>
        {/* Rows are a phone's tap height, and their links close the sheet as the page opens. */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [&_[data-sidebar=menu-button]]:h-11">
          <MenuNavigationContext.Provider value={navigate}>
            <SheetMenus closeThen={closeThen} onFeedback={onFeedback} partnerConsole={partnerConsole} user={user} />
          </MenuNavigationContext.Provider>
        </div>
      </SheetContent>
    </Sheet>
  );
}
