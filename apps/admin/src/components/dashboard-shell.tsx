"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLayoutEffect, useRef, useState, type ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpenIcon,
  BlocksIcon,
  ChartColumnIncreasingIcon,
  ClipboardCheckIcon,
  Building2Icon,
  HomeIcon,
  MessageSquareMoreIcon,
  PhoneIcon,
  SettingsIcon,
  UsersIcon,
  WorkflowIcon,
} from "lucide-react";
import { Check, ChevronsUpDown, Contrast, LogOut, Plus, UserRound } from "lucide-react";
import { TeamSwitcher } from "@/components/layout/team-switcher";
import { Main } from "@/components/layout/main";
import { SiteHeader } from "@/components/site-header";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
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
import { cn } from "@/lib/utils";
import { formatPhoneNumberDisplay } from "@/lib/phone";
import { DashboardUtilityBar } from "./dashboard-utility-bar";
import { DashboardSetupGuideCard } from "./dashboard-setup-guide-card";
import { useTheme } from "./theme-provider";

type Business = {
  businessId: string;
  name: string;
  active: boolean;
};

type DashboardShellProps = {
  children: React.ReactNode;
  user: {
    email: string;
    name: string;
  };
};

type NavigationItem = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

async function getBusinesses(): Promise<{ businesses: Business[] }> {
  const response = await fetch("/api/businesses", { credentials: "include" });
  if (!response.ok) throw new Error("Unable to load workspaces.");
  return await response.json() as { businesses: Business[] };
}

function getSidebarDefaultOpen(): boolean {
  if (typeof document === "undefined") return true;
  const value = document.cookie.split("; ").find((entry) => entry.startsWith("sidebar_state="));
  return value?.split("=")[1] !== "false";
}

export function DashboardShell({ children, user }: DashboardShellProps) {
  const pathname = usePathname();
  const contentScrollRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const contentScroll = contentScrollRef.current;
    if (!contentScroll) return;
    contentScroll.scrollTop = 0;
    contentScroll.scrollLeft = 0;
  }, [pathname]);

  return (
    <div className="flex h-svh w-full flex-col overflow-hidden bg-background">
      <SidebarProvider
        className="relative min-h-0 flex-1 overflow-hidden"
        defaultOpen={getSidebarDefaultOpen()}
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
          <Main className="flex flex-1 flex-col" fixed={pathname === "/messages"}>
            {children}
          </Main>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}

function ReplacementSidebar({ user }: Pick<DashboardShellProps, "user">) {
  const pathname = usePathname();
  const { t } = useTranslation(["nav", "settings", "agent"]);
  const general: NavigationItem[] = [
    { label: t("nav:items.home"), href: "/", icon: HomeIcon },
    { label: t("nav:items.calls"), href: "/calls", icon: PhoneIcon },
    { label: t("nav:items.messages"), href: "/messages", icon: MessageSquareMoreIcon },
    { label: t("nav:items.contacts"), href: "/contacts", icon: UsersIcon },
  ];
  const receptionist: NavigationItem[] = [
    { label: t("agent:sections.basicSettings.title"), href: "/agent/basic-settings", icon: ClipboardCheckIcon },
    { label: t("agent:sections.knowledge.title"), href: "/agent/knowledge", icon: BookOpenIcon },
    { label: t("agent:sections.services.title"), href: "/agent/services", icon: BlocksIcon },
    { label: t("agent:sections.rules.title"), href: "/agent/rules", icon: WorkflowIcon },
  ];
  const other: NavigationItem[] = [
    { label: t("nav:items.analytics"), href: "/analytics", icon: ChartColumnIncreasingIcon },
    { label: t("settings:sections.integrations"), href: "/integrations", icon: BlocksIcon },
    { label: t("nav:items.settings"), href: "/settings/usage", icon: SettingsIcon },
  ];

  return (
    <Sidebar className="absolute inset-y-0 h-full" collapsible="icon" variant="sidebar">
      <SidebarHeader className="gap-1">
        <TeamSwitcher />
        <WorkspaceSwitcher />
      </SidebarHeader>
      <SidebarContent>
        <NavigationGroup items={general} pathname={pathname} title={t("nav:sidebar.general")} />
        <NavigationGroup items={receptionist} pathname={pathname} title={t("nav:sidebar.agent")} />
        <NavigationGroup items={other} pathname={pathname} title={t("nav:sidebar.other")} />
      </SidebarContent>
      <SidebarFooter>
        <DashboardSetupGuideCard />
        <UserMenu user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function NavigationGroup({ items, pathname, title }: { items: NavigationItem[]; pathname: string; title: string }) {
  const { isMobile, setOpenMobile } = useSidebar();
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{title}</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => {
          const active = item.href === "/"
            ? pathname === "/"
            : item.href === "/settings/usage"
              ? pathname.startsWith("/settings")
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                isActive={active}
                render={<Link href={item.href} />}
                tooltip={item.label}
                onClick={() => isMobile && setOpenMobile(false)}
              >
                <item.icon className="size-4 shrink-0" />
                <span>{item.label}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}

function WorkspaceSwitcher() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { i18n, t } = useTranslation("nav");
  const { isMobile } = useSidebar();
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: getBusinesses });
  const [switching, setSwitching] = useState(false);
  const active = businesses.data?.businesses.find((business) => business.active) ?? businesses.data?.businesses[0];
  const phoneNumbers = useQuery({
    queryKey: ["phone-numbers", active?.businessId],
    queryFn: async () => {
      const response = await fetch("/api/phone-numbers", { credentials: "include" });
      if (!response.ok) throw new Error("Unable to load workspace phone number.");
      return await response.json() as { phoneNumbers: Array<{ e164: string; status: string }> };
    },
    enabled: Boolean(active),
  });
  const primaryPhone = phoneNumbers.data?.phoneNumbers.find((number) => number.status === "active") ?? phoneNumbers.data?.phoneNumbers[0];

  async function selectBusiness(businessId: string) {
    if (businessId === active?.businessId) return;
    setSwitching(true);
    try {
      const response = await fetch("/api/businesses/switch", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ businessId }),
      });
      if (!response.ok) throw new Error("Workspace switch failed.");
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== "businesses" });
      await queryClient.invalidateQueries({ queryKey: ["businesses"] });
      router.refresh();
    } finally {
      setSwitching(false);
    }
  }

  return (
    <SidebarMenu className="group-data-[collapsible=icon]:hidden">
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Item
                className="w-full gap-2 px-3 py-2 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[popup-open=true]:bg-sidebar-accent data-[popup-open=true]:text-sidebar-accent-foreground"
                render={<button disabled={switching} type="button" />}
                size="xs"
                variant="outline"
              />
            }
          >
            <ItemMedia variant="icon"><Building2Icon /></ItemMedia>
            <ItemContent className="min-w-0 gap-0.5">
              <ItemTitle className="line-clamp-2 w-full text-left font-medium leading-tight">
                {active?.name ?? t("sidebar.businessSlugFallback")}
              </ItemTitle>
              <ItemDescription className="text-xs">{phoneNumbers.isLoading ? t("sidebar.loadingPhone") : primaryPhone ? formatPhoneNumberDisplay(primaryPhone.e164, i18n.language) : t("sidebar.noBusinessPhone")}</ItemDescription>
            </ItemContent>
            <ItemActions><ChevronsUpDown className="size-4 text-muted-foreground" /></ItemActions>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-56 rounded-xl" side={isMobile ? "bottom" : "right"} sideOffset={4}>
            <DropdownMenuGroup>
              {(businesses.data?.businesses ?? []).map((business) => (
                <DropdownMenuItem className="gap-2.5 px-3 py-2" key={business.businessId} onClick={() => void selectBusiness(business.businessId)}>
                  {business.businessId === active?.businessId ? <Check className="size-4" /> : <span className="size-4" />}
                  <span className="truncate">{business.name}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2.5 px-3 py-2" render={<Link href="/onboarding/business?create=true" />}>
              <Plus className="size-4" />
              {t("sidebar.createBusiness")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function UserMenu({ user }: Pick<DashboardShellProps, "user">) {
  const router = useRouter();
  const { t } = useTranslation("nav");
  const { isMobile } = useSidebar();
  const { resolvedTheme, setTheme } = useTheme();
  const [signingOut, setSigningOut] = useState(false);
  const initial = user.email.trim().charAt(0).toUpperCase() || "?";

  async function signOut() {
    setSigningOut(true);
    try {
      await fetch("/api/auth/sign-out", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      router.replace("/login");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger render={<SidebarMenuButton className="data-[popup-open=true]:bg-sidebar-accent" size="lg" />}>
            <Avatar className="shadow-xs" size="sm"><AvatarFallback>{initial}</AvatarFallback></Avatar>
            <div className="grid flex-1 text-start text-sm leading-tight"><span className="truncate text-sm">{user.email}</span></div>
            <ChevronsUpDown className="ms-auto size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-56 rounded-xl" side={isMobile ? "bottom" : "right"} sideOffset={4}>
            <DropdownMenuGroup>
              <DropdownMenuItem render={<Link href="/settings/account" />}><UserRound />{t("sidebar.account")}</DropdownMenuItem>
              <DropdownMenuItem closeOnClick={false} onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}><Contrast />{t("sidebar.toggleTheme")}</DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={signingOut} onClick={() => void signOut()} variant="destructive"><LogOut />{t("sidebar.signOut")}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
