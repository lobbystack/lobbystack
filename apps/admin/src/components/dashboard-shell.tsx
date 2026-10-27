"use client";

import Link from "next/link";
import { requestJson } from "@/lib/request-json";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { AnimatedNavigationIcon } from "@/components/animated-navigation-icon";
import { AppWindowIcon } from "@/components/ui/app-window";
import { BookTextIcon } from "@/components/ui/book-text";
import { BlocksIcon } from "@/components/ui/blocks";
import { CalendarDaysIcon } from "@/components/ui/calendar-days";
import { ChartColumnIncreasingIcon } from "@/components/ui/chart-column-increasing";
import { ClipboardCheckIcon } from "@/components/ui/clipboard-check";
import { HomeIcon } from "@/components/ui/home";
import { HandHelpingIcon } from "@/components/ui/hand-helping";
import { IdCardIcon } from "@/components/ui/id-card";
import { MessageSquareMoreIcon } from "@/components/ui/message-square-more";
import { PhoneAnimatedIcon } from "@/components/ui/phone-animated";
import { SettingsIcon } from "@/components/ui/settings";
import { UsersIcon } from "@/components/ui/users";
import { WorkflowIcon } from "@/components/ui/workflow";
import type { Capability } from "@lobbystack/domain";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { useAppointments } from "@/hooks/use-appointments";
import { firstSettingsPage, pageCapability } from "@/lib/dashboard-pages";
import { useNewAppointmentCount } from "@/lib/appointments-seen";
import { useSignOut } from "@/hooks/use-sign-out";
import { WorkspaceSwitcher } from "@/components/layout/workspace-switcher";
import { Main } from "@/components/layout/main";
import { SiteHeader } from "@/components/site-header";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { ALL_CAPABILITIES, BusinessCapabilitiesProvider, useBusinessCan } from "./business-capabilities-provider";
import { LiveUpgradePlanProvider } from "./live-upgrade-plan-provider";
import { BillingPastDueBanner, type BillingPermissions } from "./billing-past-due-banner";
import { NumberTrialBanner } from "./number-trial-banner";
import { DashboardUtilityBar } from "./dashboard-utility-bar";
import { DashboardSetupGuideCard } from "./dashboard-setup-guide-card";
import { NavUser } from "./nav-user";
import { useOpenUpgradePlanDialog } from "./upgrade-plan-dialog-context";

type DashboardShellProps = {
  children: React.ReactNode;
  /** What the business the server opened lets the person do, until the workspace list loads. A direct business gives everything. */
  capabilities?: readonly Capability[];
  sidebarOpen?: boolean;
  /** Shows Messages and the website widget in the menu on every page (`WIDGET_KEY_ISSUANCE_ENABLED`). */
  widgetsEnabled?: boolean;
  /** The person is on a partner's team, so the account menu links to the partner console. */
  partnerConsole?: boolean;
  user: {
    email: string;
    name: string;
  };
};

type NavigationItem = {
  href: string;
  label: string;
  icon: typeof HomeIcon;
  /** A count of new things behind the link, such as new bookings. */
  badge?: number;
};

function getSidebarDefaultOpen(): boolean {
  if (typeof document === "undefined") return true;
  const value = document.cookie.split("; ").find((entry) => entry.startsWith("sidebar_state="));
  return value?.split("=")[1] !== "false";
}

export function DashboardShell({ capabilities = ALL_CAPABILITIES, children, partnerConsole = false, sidebarOpen, user, widgetsEnabled = false }: DashboardShellProps) {
  const { t } = useTranslation("common");
  const pathname = usePathname();
  const contentScrollRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const contentScroll = contentScrollRef.current;
    if (!contentScroll) return;
    contentScroll.scrollTop = 0;
    contentScroll.scrollLeft = 0;
  }, [pathname]);

  return (
    <BusinessCapabilitiesProvider initial={capabilities}>
    <LiveUpgradePlanProvider>
    <div className="flex h-svh w-full flex-col overflow-hidden bg-background">
      <a href="#dashboard-main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:rounded-xl focus:bg-background focus:p-4">{t("accessibility.skipToContent")}</a>
      <BillingBanner />
      <NumberTrialBanner />
      <SidebarProvider
        className="relative min-h-0 flex-1 overflow-hidden"
        // The server reads the same cookie, so both renders agree on the sidebar state.
        defaultOpen={sidebarOpen ?? getSidebarDefaultOpen()}
        style={{ "--sidebar-width": "16rem" } as React.CSSProperties}
      >
        <ReplacementSidebar partnerConsole={partnerConsole} user={user} widgetsEnabled={widgetsEnabled} />
        <SidebarInset
          ref={contentScrollRef}
          className="@container/content min-h-0 overflow-x-hidden overflow-y-auto overscroll-contain has-data-[layout=fixed]:h-full peer-data-[variant=inset]:has-data-[layout=fixed]:h-[calc(100%-(var(--spacing)*4))]"
        >
          <SiteHeader fixed scrollContainerRef={contentScrollRef} />
          <div className="hidden h-16 shrink-0 border-b md:block" />
          <DashboardUtilityBar />
          <Main id="dashboard-main-content" tabIndex={-1} className="flex flex-1 flex-col" fixed={pathname === "/messages"}>
            <PageAccess>{children}</PageAccess>
          </Main>
        </SidebarInset>
      </SidebarProvider>
    </div>
    </LiveUpgradePlanProvider>
    </BusinessCapabilitiesProvider>
  );
}

/**
 * Sends someone who opens a page the business doesn't let them use, such as
 * billing at a partner's business, back Home. The menu never links there, and
 * the server refuses the page's requests anyway.
 */
function PageAccess({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const can = useBusinessCan();
  const allowed = can(pageCapability(pathname));
  useEffect(() => { if (!allowed) router.replace("/"); }, [allowed, router]);
  return allowed ? children : null;
}

function BillingBanner() {
  const { business } = useActiveBusiness();
  const can = useBusinessCan();
  const billing = useQuery({ queryKey: ["billing", business?.businessId], queryFn: async () => {
    const response = await fetch(`/api/billing?businessId=${encodeURIComponent(business!.businessId)}`, { credentials: "include" });
    if (!response.ok) throw new Error("Billing unavailable");
    return await response.json() as { account: { plan: string | null; subscriptionState: string | null } | null; permissions: BillingPermissions };
  }, enabled: Boolean(business?.businessId) && can("billing") });
  if (!business || !can("billing") || !billing.data?.account || !billing.data.permissions) return null;
  return <BillingPastDueBanner businessId={business.businessId} plan={billing.data.account.plan} subscriptionState={billing.data.account.subscriptionState} permissions={billing.data.permissions} />;
}

function ReplacementSidebar({ partnerConsole = false, user, widgetsEnabled }: Pick<DashboardShellProps, "partnerConsole" | "user" | "widgetsEnabled">) {
  const pathname = usePathname();
  const showWidgets = widgetsEnabled || ["/messages", "/widget"].some(route => pathname === route || pathname.startsWith(`${route}/`));
  const { isMobile, setOpenMobile } = useSidebar();
  const { t } = useTranslation(["nav", "settings", "agent"]);
  const can = useBusinessCan();
  const { business, appointments } = useAppointments();
  const newAppointments = useNewAppointmentCount(business?.businessId, appointments.data?.appointments ?? []);
  // Only what the business lets the person use: a partner's business may leave out its setup, billing, API keys and MCP.
  const allowed = (items: NavigationItem[]) => items.filter((item) => can(pageCapability(item.href)));
  const general: NavigationItem[] = [
    { label: t("nav:items.home"), href: "/", icon: HomeIcon },
    { label: t("nav:items.appointments"), href: "/appointments", icon: CalendarDaysIcon as typeof HomeIcon, badge: newAppointments },
    { label: t("nav:items.calls"), href: "/calls", icon: PhoneAnimatedIcon },
    ...(showWidgets ? [{ label: t("nav:items.messages"), href: "/messages", icon: MessageSquareMoreIcon }] : []),
    { label: t("nav:items.contacts"), href: "/contacts", icon: UsersIcon },
  ];
  const receptionist: NavigationItem[] = [
    { label: t("agent:sections.basicSettings.title"), href: "/agent", icon: ClipboardCheckIcon },
    { label: t("agent:sections.knowledge.title"), href: "/agent/knowledge", icon: BookTextIcon },
    { label: t("agent:sections.services.title"), href: "/agent/services", icon: HandHelpingIcon },
    { label: t("agent:sections.employees.title"), href: "/agent/employees", icon: IdCardIcon },
    { label: t("agent:sections.rules.title"), href: "/agent/rules", icon: WorkflowIcon },
  ];
  const other: NavigationItem[] = [
    { label: t("nav:items.analytics"), href: "/analytics", icon: ChartColumnIncreasingIcon },
    { label: t("settings:sections.integrations"), href: "/integrations", icon: BlocksIcon },
    ...(showWidgets ? [{ label: t("settings:sections.widget"), href: "/widget", icon: AppWindowIcon }] : []),
    { label: t("nav:items.settings"), href: firstSettingsPage(can), icon: SettingsIcon },
  ];
  const groups = [
    { title: t("nav:sidebar.general"), items: allowed(general) },
    { title: t("nav:sidebar.agent"), items: allowed(receptionist) },
    { title: t("nav:sidebar.other"), items: allowed(other) },
  ].filter((group) => group.items.length > 0);

  return (
    <Sidebar className="absolute inset-y-0 h-full" collapsible="icon" variant="sidebar">
      <SidebarHeader>
        <WorkspaceSwitcher />
      </SidebarHeader>
      <SidebarContent>
        {groups.map((group) => <NavigationGroup items={group.items} key={group.title} pathname={pathname} title={group.title} />)}
      </SidebarContent>
      <SidebarFooter>
        <DashboardSetupGuideCard onNavigate={() => { if (isMobile) setOpenMobile(false); }} />
        <UserMenu partnerConsole={partnerConsole} user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function NavigationGroup({ items, pathname, title }: { items: NavigationItem[]; pathname: string; title: string }) {
  const router = useRouter();
  const { t } = useTranslation("nav");
  const { isMobile, setOpenMobile } = useSidebar();
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{title}</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => {
          const active = item.href === "/"
            ? pathname === "/"
            : item.href.startsWith("/settings/")
              ? pathname.startsWith("/settings")
              : pathname === item.href;
          return (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                className="relative"
                onMouseEnter={() => setHoveredItem(item.href)}
                onMouseLeave={() => setHoveredItem(null)}
                onFocus={() => setHoveredItem(item.href)}
                onBlur={() => setHoveredItem(null)}
                isActive={active}
                {...(!isMobile ? { render: <Link href={item.href} /> } : {})}
                tooltip={item.label}
                onClick={() => { if (isMobile) { router.push(item.href); setOpenMobile(false); } }}
              >
                <AnimatedNavigationIcon icon={item.icon} hovered={hoveredItem === item.href} />
                <span>{item.label}</span>
                {item.badge ? <>
                  <span aria-hidden="true" className="ml-auto min-w-5 rounded-full bg-primary px-1.5 py-0.5 text-center text-[11px] leading-none font-medium text-primary-foreground tabular-nums group-data-[collapsible=icon]:hidden">{item.badge > 99 ? "99+" : item.badge}</span>
                  {/* With the sidebar collapsed to icons, a dot stands in for the number. */}
                  <span aria-hidden="true" className="absolute top-1 right-1 hidden size-2 rounded-full bg-primary group-data-[collapsible=icon]:block" />
                  <span className="sr-only">{t("items.newCount", { count: item.badge })}</span>
                </> : null}
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}


function UserMenu({ partnerConsole = false, user }: Pick<DashboardShellProps, "partnerConsole" | "user">) {
  const openUpgradePlanDialog = useOpenUpgradePlanDialog();
  const signOut = useSignOut();
  const { business } = useActiveBusiness();
  const can = useBusinessCan();
  const billing = useQuery({ queryKey: ["billing", business?.businessId], enabled: Boolean(business?.businessId) && can("billing"), queryFn: () => requestJson<{ account: { plan: string | null } | null; permissions: BillingPermissions; availableCheckoutPlans: Array<"starter" | "pro">; availableCheckoutIntervals: Record<"starter" | "pro", string[]> }>(`/api/billing?businessId=${encodeURIComponent(business!.businessId)}`) });
  const showUpgradeToPro = can("billing") && billing.data?.permissions.hasCheckoutAccess === true && (billing.data.account?.plan ?? "free_cloud") === "free_cloud" && (billing.data.availableCheckoutPlans ?? []).some(plan => billing.data?.availableCheckoutIntervals[plan].length);
  // Someone working in a partner's business through an open ends it as they go back to the console or sign out,
  // and the business's audit log records it. The tab reads when its open began once, as it loads, so leaving here
  // doesn't end a newer open another tab started. A tab closed without either leaves the open to expire.
  const visiting = business?.via === "partner" ? business.businessId : null;
  const visit = useQuery({ queryKey: ["partner-visit", visiting], enabled: Boolean(visiting), staleTime: Infinity, gcTime: Infinity, refetchOnWindowFocus: false, refetchOnReconnect: false, queryFn: () => requestJson<{ openedAt: string | null }>(`/api/partner/businesses/leave?businessId=${encodeURIComponent(visiting!)}`) });
  const leave = async () => {
    if (!visiting || !visit.data?.openedAt) return;
    await fetch("/api/partner/businesses/leave", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ businessId: visiting, openedAt: visit.data.openedAt }), keepalive: true }).catch(() => undefined);
  };
  return <NavUser user={user} onLeaveBusiness={visiting ? () => void leave() : undefined} onSignOut={() => void leave().then(() => signOut())} onUpgradeToPro={openUpgradePlanDialog} showPartnerConsole={partnerConsole} showUpgradeToPro={showUpgradeToPro} />;
}
