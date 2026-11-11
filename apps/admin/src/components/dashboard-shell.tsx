"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import type { Capability } from "@lobbystack/domain";
import type { PageIntroKey } from "@lobbystack/shared";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { useIsMobile } from "@/hooks/use-mobile";
import { AgentsSeedProvider, type AgentsSeed } from "@/hooks/use-agents";
import { pageCapability } from "@/lib/dashboard-pages";
import { Main } from "@/components/layout/main";
import { MobileNavigation } from "@/components/navigation/mobile-navigation";
import { NavigationSidebar } from "@/components/navigation/navigation-sidebar";
import { ShellRuntime } from "@/components/navigation/shell-runtime";
import { PageTitleTargetContext } from "@/components/page-header";
import { PageIntrosProvider } from "@/components/page-intros/page-intros-provider";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { ALL_CAPABILITIES, BusinessCapabilitiesProvider, useBusinessCan } from "./business-capabilities-provider";
import { LiveUpgradePlanProvider } from "./live-upgrade-plan-provider";
import { BillingPastDueBanner, type BillingPermissions } from "./billing-past-due-banner";
import { NumberTrialBanner } from "./number-trial-banner";

type DashboardShellProps = {
  children: React.ReactNode;
  /** What the business the server opened lets the person do, until the workspace list loads. A direct business gives everything. */
  capabilities?: readonly Capability[];
  /** The business's agents, which the server loads for people who can set them up. */
  agents?: AgentsSeed | null;
  sidebarOpen?: boolean;
  /** The intro cards the person has closed, from the layout, or null when no card may show. */
  pageIntros?: { seen: readonly PageIntroKey[] | null; businessId: string | null };
  /** The person is on a partner's team, so the account menu links to the partner console. */
  partnerConsole?: boolean;
  user: {
    email: string;
    name: string;
  };
};

function getSidebarDefaultOpen(): boolean {
  if (typeof document === "undefined") return true;
  const value = document.cookie.split("; ").find((entry) => entry.startsWith("sidebar_state="));
  return value?.split("=")[1] !== "false";
}

export function DashboardShell({ agents = null, capabilities = ALL_CAPABILITIES, children, pageIntros, partnerConsole = false, sidebarOpen, user }: DashboardShellProps) {
  const { t } = useTranslation("common");
  const pathname = usePathname();
  const contentScrollRef = useRef<HTMLElement>(null);
  const isMobile = useIsMobile();
  // The page's title heading, which the phone top bar names once it scrolls away.
  const [titleHeading, setTitleHeading] = useState<HTMLHeadingElement | null>(null);
  const registerTitle = useCallback((heading: HTMLHeadingElement | null) => {
    if (!heading) return;
    setTitleHeading(heading);
    return () => setTitleHeading((current) => (current === heading ? null : current));
  }, []);

  useLayoutEffect(() => {
    const contentScroll = contentScrollRef.current;
    if (!contentScroll) return;
    contentScroll.scrollTop = 0;
    contentScroll.scrollLeft = 0;
  }, [pathname]);

  return (
    <BusinessCapabilitiesProvider initial={capabilities}>
    <AgentsSeedProvider seed={agents}>
    <LiveUpgradePlanProvider>
    <PageIntrosProvider businessId={pageIntros?.businessId ?? null} seen={pageIntros?.seen ?? null}>
    {/* On phones the bottom padding keeps the content above the tab bar. */}
    <div className="flex h-svh w-full flex-col overflow-hidden bg-background max-md:pb-[calc(3.5rem+env(safe-area-inset-bottom))]">
      <a href="#dashboard-main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:rounded-xl focus:bg-background focus:p-4">{t("accessibility.skipToContent")}</a>
      <BillingBanner />
      <NumberTrialBanner />
      <SidebarProvider
        className="relative min-h-0 flex-1 overflow-hidden"
        // The server reads the same cookie, so both renders agree on the sidebar state.
        defaultOpen={sidebarOpen ?? getSidebarDefaultOpen()}
        style={{ "--sidebar-width": "16rem" } as React.CSSProperties}
      >
        {/* Phones get the tab bar and its menu sheet in place of the sidebar. */}
        {isMobile ? null : <NavigationSidebar partnerConsole={partnerConsole} user={user} />}
        <SidebarInset
          ref={contentScrollRef}
          className="@container/content min-h-0 overflow-x-hidden overflow-y-auto overscroll-contain has-data-[layout=fixed]:h-full peer-data-[variant=inset]:has-data-[layout=fixed]:h-[calc(100%-(var(--spacing)*4))]"
        >
          <SiteHeader fixed scrollContainerRef={contentScrollRef} titleHeading={titleHeading} />
          <Main id="dashboard-main-content" tabIndex={-1} className="flex flex-1 flex-col" fixed={pathname === "/inbox"}>
            <PageTitleTargetContext.Provider value={registerTitle}>
              <PageAccess>{children}</PageAccess>
            </PageTitleTargetContext.Provider>
          </Main>
        </SidebarInset>
        <ShellRuntime />
        <MobileNavigation partnerConsole={partnerConsole} user={user} />
      </SidebarProvider>
    </div>
    </PageIntrosProvider>
    </LiveUpgradePlanProvider>
    </AgentsSeedProvider>
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
