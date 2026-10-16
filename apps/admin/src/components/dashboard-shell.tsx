"use client";

import Link from "next/link";
import { requestJson } from "@/lib/request-json";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
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
import { useActiveBusiness } from "@/hooks/use-active-business";
import { useAppointments } from "@/hooks/use-appointments";
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
import { LiveUpgradePlanProvider } from "./live-upgrade-plan-provider";
import { BillingPastDueBanner, type BillingPermissions } from "./billing-past-due-banner";
import { NumberTrialBanner } from "./number-trial-banner";
import { DashboardUtilityBar } from "./dashboard-utility-bar";
import { DashboardSetupGuideCard } from "./dashboard-setup-guide-card";
import { NavUser } from "./nav-user";
import { useOpenUpgradePlanDialog } from "./upgrade-plan-dialog-context";

type DashboardShellProps = {
  children: React.ReactNode;
  sidebarOpen?: boolean;
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

export function DashboardShell({ children, sidebarOpen, user }: DashboardShellProps) {
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
        <ReplacementSidebar user={user} />
        <SidebarInset
          ref={contentScrollRef}
          className="@container/content min-h-0 overflow-x-hidden overflow-y-auto overscroll-contain has-data-[layout=fixed]:h-full peer-data-[variant=inset]:has-data-[layout=fixed]:h-[calc(100%-(var(--spacing)*4))]"
        >
          <SiteHeader fixed scrollContainerRef={contentScrollRef} />
          <div className="hidden h-16 shrink-0 border-b md:block" />
          <DashboardUtilityBar />
          <Main id="dashboard-main-content" tabIndex={-1} className="flex flex-1 flex-col" fixed={pathname === "/messages"}>
            {children}
          </Main>
        </SidebarInset>
      </SidebarProvider>
    </div>
    </LiveUpgradePlanProvider>
  );
}

function BillingBanner() {
  const { business } = useActiveBusiness();
  const billing = useQuery({ queryKey: ["billing", business?.businessId], queryFn: async () => {
    const response = await fetch(`/api/billing?businessId=${encodeURIComponent(business!.businessId)}`, { credentials: "include" });
    if (!response.ok) throw new Error("Billing unavailable");
    return await response.json() as { account: { plan: string | null; subscriptionState: string | null } | null; permissions: BillingPermissions };
  }, enabled: Boolean(business?.businessId) });
  if (!business || !billing.data?.account || !billing.data.permissions) return null;
  return <BillingPastDueBanner businessId={business.businessId} plan={billing.data.account.plan} subscriptionState={billing.data.account.subscriptionState} permissions={billing.data.permissions} />;
}

function ReplacementSidebar({ user }: Pick<DashboardShellProps, "user">) {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();
  const { t } = useTranslation(["nav", "settings", "agent"]);
  const { business, appointments } = useAppointments();
  const newAppointments = useNewAppointmentCount(business?.businessId, appointments.data?.appointments ?? []);
  const general: NavigationItem[] = [
    { label: t("nav:items.home"), href: "/", icon: HomeIcon },
    { label: t("nav:items.appointments"), href: "/appointments", icon: CalendarDaysIcon as typeof HomeIcon, badge: newAppointments },
    { label: t("nav:items.calls"), href: "/calls", icon: PhoneAnimatedIcon },
    ...(["/messages", "/settings/widget"].some(route => pathname === route || pathname.startsWith(`${route}/`)) ? [{ label: t("nav:items.messages"), href: "/messages", icon: MessageSquareMoreIcon }] : []),
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
    { label: t("nav:items.settings"), href: "/settings/usage", icon: SettingsIcon },
    ...(["/messages", "/settings/widget"].some(route => pathname === route || pathname.startsWith(`${route}/`)) ? [{ label: t("settings:sections.widget"), href: "/settings/widget", icon: SettingsIcon }] : []),
  ];

  return (
    <Sidebar className="absolute inset-y-0 h-full" collapsible="icon" variant="sidebar">
      <SidebarHeader>
        <WorkspaceSwitcher />
      </SidebarHeader>
      <SidebarContent>
        <NavigationGroup items={general} pathname={pathname} title={t("nav:sidebar.general")} />
        <NavigationGroup items={receptionist} pathname={pathname} title={t("nav:sidebar.agent")} />
        <NavigationGroup items={other} pathname={pathname} title={t("nav:sidebar.other")} />
      </SidebarContent>
      <SidebarFooter>
        <DashboardSetupGuideCard onNavigate={() => { if (isMobile) setOpenMobile(false); }} />
        <UserMenu user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function AnimatedNavigationIcon({ icon: Icon, hovered }: { icon: typeof HomeIcon; hovered: boolean }) {
  const iconRef = useRef<{ startAnimation: () => void; stopAnimation: () => void } | null>(null);
  useEffect(() => {
    if (hovered) iconRef.current?.startAnimation();
    else iconRef.current?.stopAnimation();
  }, [hovered]);
  return <Icon ref={iconRef} className="size-4 shrink-0 [&_svg]:size-4" size={16} />;
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
            : item.href === "/settings/usage"
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


function UserMenu({ user }: Pick<DashboardShellProps, "user">) {
  const openUpgradePlanDialog = useOpenUpgradePlanDialog();
  const signOut = useSignOut();
  const { business } = useActiveBusiness();
  const billing = useQuery({ queryKey: ["billing", business?.businessId], enabled: Boolean(business?.businessId), queryFn: () => requestJson<{ account: { plan: string | null } | null; permissions: BillingPermissions; availableCheckoutPlans: Array<"starter" | "pro">; availableCheckoutIntervals: Record<"starter" | "pro", string[]> }>(`/api/billing?businessId=${encodeURIComponent(business!.businessId)}`) });
  const showUpgradeToPro = billing.data?.permissions.hasCheckoutAccess === true && (billing.data.account?.plan ?? "free_cloud") === "free_cloud" && (billing.data.availableCheckoutPlans ?? []).some(plan => billing.data?.availableCheckoutIntervals[plan].length);
  return <NavUser user={user} onSignOut={() => void signOut()} onUpgradeToPro={openUpgradePlanDialog} showUpgradeToPro={showUpgradeToPro} />;
}
