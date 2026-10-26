"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Building2, Check, ChevronsUpDown, Contrast, CreditCard, KeyRound, LogOut, Package, Palette, Plus, Users } from "lucide-react";

import type { PartnerRole } from "@lobbystack/shared";
import { useBranding } from "@/components/branding-provider";
import { Main } from "@/components/layout/main";
import { SiteHeader } from "@/components/site-header";
import { useTheme } from "@/components/theme-provider";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Item, ItemActions, ItemContent, ItemMedia, ItemTitle } from "@/components/ui/item";
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
import { useSignOut } from "@/hooks/use-sign-out";

/** A partner as the console shows it. */
export type ConsolePartner = { partnerId: string; name: string; role: PartnerRole };

const PartnerConsoleContext = createContext<ConsolePartner | null>(null);

/** The partner the console is open on. */
export function useConsolePartner(): ConsolePartner {
  const partner = useContext(PartnerConsoleContext);
  if (!partner) throw new Error("useConsolePartner must be used inside PartnerShell.");
  return partner;
}

type PartnerShellProps = {
  children: React.ReactNode;
  partner: ConsolePartner;
  /** Every partner whose console opens here, for the switcher: on a partner's host, only that partner. */
  partners: ConsolePartner[];
  sidebarOpen: boolean;
  user: { email: string };
};

/** The partner console's frame: the partner switcher, its pages for the person's role, and the account menu. */
export function PartnerShell({ children, partner, partners, sidebarOpen, user }: PartnerShellProps) {
  const { t } = useTranslation(["partner", "common"]);
  const pathname = usePathname();
  const contentScrollRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const contentScroll = contentScrollRef.current;
    if (contentScroll) contentScroll.scrollTop = 0;
  }, [pathname]);

  return (
    <PartnerConsoleContext.Provider value={partner}>
      <div className="flex h-svh w-full flex-col overflow-hidden bg-background">
        <a href="#partner-main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:rounded-xl focus:bg-background focus:p-4">{t("common:accessibility.skipToContent")}</a>
        <SidebarProvider
          className="relative min-h-0 flex-1 overflow-hidden"
          // The server reads the same cookie, so both renders agree on the sidebar state.
          defaultOpen={sidebarOpen}
          style={{ "--sidebar-width": "16rem" } as React.CSSProperties}
        >
          <Sidebar className="absolute inset-y-0 h-full" collapsible="icon" variant="sidebar">
            <SidebarHeader>
              <PartnerSwitcher partner={partner} partners={partners} />
            </SidebarHeader>
            <SidebarContent>
              <PartnerNavigation partnerId={partner.partnerId} role={partner.role} />
            </SidebarContent>
            <SidebarFooter>
              <PartnerUserMenu email={user.email} />
            </SidebarFooter>
            <SidebarRail />
          </Sidebar>
          <SidebarInset
            ref={contentScrollRef}
            className="@container/content min-h-0 overflow-x-hidden overflow-y-auto overscroll-contain"
          >
            <SiteHeader fixed scrollContainerRef={contentScrollRef} />
            <Main id="partner-main-content" tabIndex={-1} className="flex flex-1 flex-col">
              {children}
            </Main>
          </SidebarInset>
        </SidebarProvider>
      </div>
    </PartnerConsoleContext.Provider>
  );
}

function PartnerNavigation({ partnerId, role }: { partnerId: string; role: PartnerRole }) {
  const { t } = useTranslation("partner");
  const pathname = usePathname();
  const router = useRouter();
  const { isMobile, setOpenMobile } = useSidebar();
  // Members don't see prices or the Stripe connection, and only owners manage Stripe. The server refuses the same.
  const items = [
    { href: `/partner/${partnerId}/businesses`, label: t("nav.businesses"), icon: Building2 },
    ...(role === "member" ? [] : [{ href: `/partner/${partnerId}/packages`, label: t("nav.packages"), icon: Package }]),
    { href: `/partner/${partnerId}/branding`, label: t("nav.branding"), icon: Palette },
    { href: `/partner/${partnerId}/team`, label: t("nav.team"), icon: Users },
    { href: `/partner/${partnerId}/api-keys`, label: t("nav.apiKeys"), icon: KeyRound },
    ...(role === "owner" ? [{ href: `/partner/${partnerId}/stripe`, label: t("nav.stripe"), icon: CreditCard }] : []),
  ];
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{t("shell.navigation")}</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => (
          <SidebarMenuItem key={item.href}>
            <SidebarMenuButton
              isActive={pathname === item.href}
              {...(!isMobile ? { render: <Link href={item.href} /> } : {})}
              tooltip={item.label}
              onClick={() => { if (isMobile) { router.push(item.href); setOpenMobile(false); } }}
            >
              <item.icon />
              <span>{item.label}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}

function Initial({ value }: { value: string }) {
  return (
    <Avatar aria-hidden="true" className="shadow-xs" size="sm">
      <AvatarFallback>{value.trim().charAt(0).toUpperCase() || "?"}</AvatarFallback>
    </Avatar>
  );
}

function PartnerSwitcher({ partner, partners }: { partner: ConsolePartner; partners: ConsolePartner[] }) {
  const { t } = useTranslation("partner");
  const { isMobile } = useSidebar();
  // Partner signup stays on the host's domain, so a partner's host doesn't offer it.
  const onPartnerHost = useBranding().partner !== null;
  return (
    <SidebarMenu className="group-data-[collapsible=icon]:hidden">
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={t("shell.switchPartner")}
            render={
              <Item
                className="w-full gap-2 rounded-lg px-2 py-2 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[popup-open=true]:bg-sidebar-accent data-[popup-open=true]:text-sidebar-accent-foreground"
                render={<button type="button" />}
                size="xs"
              />
            }
          >
            <ItemMedia><Initial value={partner.name} /></ItemMedia>
            <ItemContent className="min-w-0">
              <ItemTitle className="w-full truncate text-left font-medium">{partner.name}</ItemTitle>
            </ItemContent>
            <ItemActions><ChevronsUpDown className="size-4 text-muted-foreground" /></ItemActions>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-56 rounded-xl" side={isMobile ? "bottom" : "right"} sideOffset={4}>
            <DropdownMenuGroup>
              {partners.map((option) => (
                <DropdownMenuItem className="gap-2.5 px-3 py-2" key={option.partnerId} render={<Link href={`/partner/${option.partnerId}/businesses`} />}>
                  {option.partnerId === partner.partnerId ? <Check className="size-4" /> : <span className="size-4" />}
                  <span className="truncate">{option.name}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            {onPartnerHost ? null : <>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="gap-2.5 px-3 py-2" render={<Link href="/partner/signup" />}>
                <Plus className="size-4" />
                {t("shell.signUpAnother")}
              </DropdownMenuItem>
            </>}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function PartnerUserMenu({ email }: { email: string }) {
  const { t } = useTranslation(["partner", "nav"]);
  const [open, setOpen] = useState(false);
  const { isMobile } = useSidebar();
  const { resolvedTheme, setTheme } = useTheme();
  const signOut = useSignOut();
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu open={open} onOpenChange={setOpen}>
          <DropdownMenuTrigger
            aria-expanded={open}
            aria-label={t("partner:shell.userMenu", { email })}
            render={<SidebarMenuButton className="data-[popup-open=true]:bg-sidebar-accent data-[popup-open=true]:text-sidebar-accent-foreground" size="lg" />}
          >
            <Initial value={email} />
            <div className="grid flex-1 text-start text-sm leading-tight">
              <span className="truncate text-sm">{email}</span>
            </div>
            <ChevronsUpDown className="ms-auto size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-56 rounded-xl" side={isMobile ? "bottom" : "right"} sideOffset={4}>
            <DropdownMenuItem closeOnClick={false} onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
              <Contrast />
              {t("nav:sidebar.toggleTheme")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void signOut()} variant="destructive">
              <LogOut />
              {t("nav:sidebar.signOut")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
