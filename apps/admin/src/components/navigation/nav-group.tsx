"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { AnimatedNavigationIcon } from "@/components/animated-navigation-icon";
import { useBusinessCan, useOpensPartnerBilling } from "@/components/business-capabilities-provider";
import { CalendarDaysIcon } from "@/components/ui/calendar-days";
import { ChartColumnIncreasingIcon } from "@/components/ui/chart-column-increasing";
import { BriefcaseBusinessIcon } from "@/components/ui/briefcase-business";
import { ClipboardCheckIcon } from "@/components/ui/clipboard-check";
import { HomeIcon } from "@/components/ui/home";
import { MessageSquareMoreIcon } from "@/components/ui/message-square-more";
import { SettingsIcon } from "@/components/ui/settings";
import { SidebarGroup, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { UsersIcon } from "@/components/ui/users";
import { useAgents } from "@/hooks/use-agents";
import { useAppointments } from "@/hooks/use-appointments";
import { agentHref } from "@/lib/agent-pages";
import { useNewAppointmentCount } from "@/lib/appointments-seen";
import { pageCapability } from "@/lib/dashboard-pages";
import { businessLandingPage, settingsLandingPage } from "@/lib/settings-pages";

export type NavLink = {
  href: string;
  label: string;
  icon: typeof HomeIcon;
  /** A count of new things behind the link. */
  badge?: number;
  /** Whether this link is the current page. Defaults to its path or anything under it. */
  isActive?: (pathname: string) => boolean;
  /** Sits at the end of the row, such as a chevron on a row that swaps the menu. */
  trailing?: ReactNode;
  /** Rows listed under this one, in the same menu. */
  children?: ReactNode;
  /** Takes the click in place of opening `href`, as the row of the section the person is in does to drill back in. */
  onSelect?: () => void;
};

export type NavLinkId = "home" | "inbox" | "appointments" | "contacts" | "analytics" | "agents" | "business" | "settings";

/**
 * The workspace menu's pages, and a filter that keeps the ones the business
 * lets the person open. With one agent, Agents opens it; with several, it lists them.
 */
export function useNavLinks() {
  const { t } = useTranslation("nav");
  const can = useBusinessCan();
  const opensPartnerBilling = useOpensPartnerBilling();
  const { hasChoice, primary } = useAgents();
  const { business, appointments } = useAppointments();
  const newAppointments = useNewAppointmentCount(business?.businessId, appointments.data?.appointments ?? []);
  const links: Record<NavLinkId, NavLink> = {
    home: { label: t("items.home"), href: "/", icon: HomeIcon, isActive: (pathname) => pathname === "/" },
    inbox: { label: t("items.inbox"), href: "/inbox", icon: MessageSquareMoreIcon },
    appointments: { label: t("items.appointments"), href: "/appointments", icon: CalendarDaysIcon as typeof HomeIcon, badge: newAppointments },
    contacts: { label: t("items.contacts"), href: "/contacts", icon: UsersIcon },
    analytics: { label: t("items.analytics"), href: "/analytics", icon: ChartColumnIncreasingIcon },
    // With several agents, Agents lists them. With one it opens that agent:
    // /agents/primary opens the default agent on the server, before the list loads.
    agents: { label: t("items.agents"), href: hasChoice ? "/agents" : primary ? agentHref(primary.id) : "/agents/primary", icon: ClipboardCheckIcon, isActive: (pathname) => pathname === "/agents" || pathname.startsWith("/agents/") },
    // No business page the person may open means no href, and allowed() leaves the row out.
    business: { label: t("items.business"), href: businessLandingPage(can) ?? "", icon: BriefcaseBusinessIcon, isActive: (pathname) => pathname === "/business" || pathname.startsWith("/business/") },
    settings: { label: t("items.settings"), href: settingsLandingPage(can, opensPartnerBilling), icon: SettingsIcon, isActive: () => false },
  };
  return {
    links,
    allowed: (items: NavLink[]) => items.filter((item) => item.href && can(pageCapability(item.href))),
  };
}

/** A sidebar group of links, with the icon animation, the collapsed rail's tooltips and the new-bookings badge. */
export function NavGroup({ items }: { items: NavLink[] }) {
  const pathname = usePathname();
  const { t } = useTranslation("nav");
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  return (
    <SidebarGroup>
      <SidebarMenu>
        {items.map((item) => (
          <Fragment key={item.href}>
            <SidebarMenuItem>
              <SidebarMenuButton
                className="relative"
                isActive={item.isActive ? item.isActive(pathname) : pathname === item.href || pathname.startsWith(`${item.href}/`)}
                onBlur={() => setHoveredItem(null)}
                onClick={(event: React.MouseEvent) => {
                  if (item.onSelect) { event.preventDefault(); item.onSelect(); }
                }}
                onFocus={() => setHoveredItem(item.href)}
                onMouseEnter={() => setHoveredItem(item.href)}
                onMouseLeave={() => setHoveredItem(null)}
                render={<Link href={item.href} />}
                tooltip={item.label}
              >
                <AnimatedNavigationIcon hovered={hoveredItem === item.href} icon={item.icon} />
                <span>{item.label}</span>
                {item.badge ? <>
                  <span aria-hidden="true" className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 type-label text-primary-foreground tabular-nums group-data-[collapsible=icon]:hidden">{item.badge > 99 ? "99+" : item.badge}</span>
                  {/* With the sidebar collapsed to icons, a dot stands in for the number. */}
                  <span aria-hidden="true" className="absolute top-1 right-1 hidden size-2 rounded-full bg-primary group-data-[collapsible=icon]:block" />
                  <span className="sr-only">{t("items.newCount", { count: item.badge })}</span>
                </> : null}
                {item.trailing ? <span className="ml-auto flex shrink-0 items-center group-data-[collapsible=icon]:hidden">{item.trailing}</span> : null}
              </SidebarMenuButton>
            </SidebarMenuItem>
            {item.children}
          </Fragment>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}
