"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useState, type ComponentType } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  BookOpen,
  CalendarDays,
  ChartColumn,
  ChevronRight,
  ChevronsUpDown,
  ClipboardList,
  Contact,
  Hash,
  House,
  Inbox,
  Library,
  PhoneCall,
  PhoneForwarded,
  Plus,
  Puzzle,
  Search,
  Settings,
  SlidersHorizontal,
  UsersRound,
  CalendarCheck,
} from "lucide-react";

import { WorkspaceSwitcher } from "@/components/layout/workspace-switcher";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import {
  buildSidebarModel,
  isSidebarItemActive,
  parseReceptionistPath,
  receptionistPath,
  RECEPTIONIST_SECTIONS,
  switchReceptionistPath,
  type NavigationReceptionist,
  type NavigationSnapshot,
  type ReceptionistSection,
  type SidebarItemKey,
} from "@/lib/navigation-routes";
import { openCommandSearch } from "./command-search";

type Icon = ComponentType<{ className?: string }>;

const ITEM_ICONS: Record<SidebarItemKey, Icon> = {
  home: House,
  inbox: Inbox,
  calendar: CalendarDays,
  contacts: Contact,
  analytics: ChartColumn,
  services: ClipboardList,
  staff: UsersRound,
  knowledge: Library,
  numbers: Hash,
  integrations: Puzzle,
  settings: Settings,
};

export const SECTION_ICONS: Record<ReceptionistSection, Icon> = {
  overview: PhoneCall,
  behavior: SlidersHorizontal,
  knowledge: BookOpen,
  booking: CalendarCheck,
  transfers: PhoneForwarded,
  numbers: Hash,
};

const LAST_BUSINESS_PAGE_KEY = "lobbystack:last-business-page";

/** Remembers the last business page so the drill-down's back row returns there. */
export function rememberBusinessPage(pathname: string): void {
  if (parseReceptionistPath(pathname) || pathname.startsWith("/receptionists")) return;
  try { window.sessionStorage.setItem(LAST_BUSINESS_PAGE_KEY, pathname); } catch { /* storage can be blocked */ }
}

function lastBusinessPage(): string {
  try { return window.sessionStorage.getItem(LAST_BUSINESS_PAGE_KEY) ?? "/"; } catch { return "/"; }
}

export function ReceptionistInitial({ name, className, size = "sm" }: { name: string; className?: string; size?: "sm" | "default" | "lg" }) {
  return (
    <Avatar aria-hidden="true" className={cn("shadow-xs", className)} size={size}>
      <AvatarFallback>{name.trim().charAt(0).toUpperCase() || "?"}</AvatarFallback>
    </Avatar>
  );
}

function NavLink({ href, label, icon: IconComponent, active, trailing }: { href: string; label: string; icon: Icon; active: boolean; trailing?: React.ReactNode }) {
  const router = useRouter();
  const { isMobile, setOpenMobile } = useSidebar();
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={active}
        tooltip={label}
        {...(!isMobile ? { render: <Link href={href} /> } : {})}
        onClick={() => { if (isMobile) { router.push(href); setOpenMobile(false); } }}
      >
        <IconComponent className="size-4 shrink-0" />
        <span className="truncate">{label}</span>
        {trailing}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/**
 * One sidebar for every business page. Opening a receptionist swaps its
 * content for that receptionist's pages; the width and component stay the same.
 */
export function BusinessSidebar({ navigation, footer }: { navigation: NavigationSnapshot; footer: React.ReactNode }) {
  const pathname = usePathname();
  const drillDown = parseReceptionistPath(pathname);
  const receptionist = drillDown ? navigation.receptionists.find((item) => item.id === drillDown.agentId) : undefined;

  useEffect(() => { rememberBusinessPage(pathname); }, [pathname]);

  return (
    <Sidebar className="absolute inset-y-0 h-full" collapsible="icon" variant="sidebar" data-navigation={drillDown && receptionist ? "receptionist" : "business"}>
      <SidebarHeader>
        {drillDown && receptionist
          ? <ReceptionistScope navigation={navigation} receptionist={receptionist} />
          : <><WorkspaceSwitcher /><SearchButton /></>}
      </SidebarHeader>
      <SidebarContent>
        {drillDown && receptionist
          ? <ReceptionistItems agentId={receptionist.id} section={drillDown.section} />
          : <BusinessItems navigation={navigation} pathname={pathname} />}
      </SidebarContent>
      <SidebarFooter>{footer}</SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function SearchButton() {
  const { t } = useTranslation("receptionists");
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton className="text-muted-foreground" onClick={() => openCommandSearch()} tooltip={t("nav.search")}>
          <Search className="size-4 shrink-0" />
          <span className="flex-1 truncate">{t("nav.search")}</span>
          <kbd className="pointer-events-none ml-auto rounded-full border px-2 font-sans text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">⌘K</kbd>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function BusinessItems({ navigation, pathname }: { navigation: NavigationSnapshot; pathname: string }) {
  const { t } = useTranslation("receptionists");
  const model = buildSidebarModel({ receptionists: navigation.receptionists, staffEnabled: navigation.staffEnabled, canCreateReceptionists: navigation.canManage });
  const chevron = <ChevronRight className="ml-auto size-4 text-muted-foreground" />;
  return (
    <>
      <SidebarGroup>
        <SidebarMenu>
          {model.daily.map((item) => <NavLink active={isSidebarItemActive(item.href, pathname)} href={item.href} icon={ITEM_ICONS[item.key]} key={item.key} label={t(`nav.${item.key}`)} />)}
        </SidebarMenu>
      </SidebarGroup>
      <SidebarSeparator />
      <SidebarGroup data-testid="sidebar-receptionists">
        {model.receptionists.single ? null : <SidebarGroupLabel>{t("nav.receptionists")}</SidebarGroupLabel>}
        <SidebarMenu>
          {model.receptionists.single
            ? <NavLink active={false} href={model.receptionists.single.href} icon={PhoneCall} label={t("nav.receptionist")} trailing={chevron} />
            : model.receptionists.list.map((item) => (
              <SidebarMenuItem key={item.id}>
                <ReceptionistLink href={item.href} name={item.name} />
              </SidebarMenuItem>
            ))}
          {model.receptionists.showNew ? <NavLink active={pathname === "/receptionists/new"} href="/receptionists/new" icon={Plus} label={t("nav.newReceptionist")} /> : null}
        </SidebarMenu>
      </SidebarGroup>
      <SidebarSeparator />
      <SidebarGroup>
        <SidebarGroupLabel>{t("nav.business")}</SidebarGroupLabel>
        <SidebarMenu>
          {model.business.map((item) => <NavLink active={isSidebarItemActive(item.href, pathname)} href={item.href} icon={ITEM_ICONS[item.key]} key={item.key} label={t(`nav.${item.key}`)} />)}
        </SidebarMenu>
      </SidebarGroup>
      <SidebarSeparator />
      <SidebarGroup>
        <SidebarMenu>
          {model.setup.map((item) => <NavLink active={isSidebarItemActive(item.href, pathname)} href={item.href} icon={ITEM_ICONS[item.key]} key={item.key} label={t(`nav.${item.key}`)} />)}
        </SidebarMenu>
      </SidebarGroup>
    </>
  );
}

function ReceptionistLink({ href, name }: { href: string; name: string }) {
  const router = useRouter();
  const { isMobile, setOpenMobile } = useSidebar();
  return (
    <SidebarMenuButton
      tooltip={name}
      {...(!isMobile ? { render: <Link href={href} /> } : {})}
      onClick={() => { if (isMobile) { router.push(href); setOpenMobile(false); } }}
    >
      <ReceptionistInitial className="size-4 text-[0.625rem]" name={name} />
      <span className="ph-mask truncate">{name}</span>
      <ChevronRight className="ml-auto size-4 text-muted-foreground" />
    </SidebarMenuButton>
  );
}

function ReceptionistScope({ navigation, receptionist }: { navigation: NavigationSnapshot; receptionist: NavigationReceptionist }) {
  const { t } = useTranslation("receptionists");
  const [backHref, setBackHref] = useState("/");
  useEffect(() => { setBackHref(lastBusinessPage()); }, []);
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton aria-label={t("nav.backTo", { name: navigation.businessName })} className="text-muted-foreground" render={<Link href={backHref} />} tooltip={t("nav.backTo", { name: navigation.businessName })}>
          <ArrowLeft className="size-4 shrink-0" />
          <span className="ph-mask truncate" data-testid="drill-down-back">{navigation.businessName}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
      <SidebarMenuItem>
        {navigation.receptionists.length > 1
          ? <ReceptionistSwitcher current={receptionist} receptionists={navigation.receptionists} />
          : (
            <div className="flex items-center gap-2 rounded-lg px-2 py-2 group-data-[collapsible=icon]:hidden" data-testid="receptionist-scope">
              <ReceptionistInitial name={receptionist.name} />
              <span className="ph-mask truncate text-sm font-medium">{receptionist.name}</span>
            </div>
          )}
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function ReceptionistSwitcher({ current, receptionists }: { current: NavigationReceptionist; receptionists: NavigationReceptionist[] }) {
  const { t } = useTranslation("receptionists");
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const listId = useId();
  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        render={
          <button
            aria-label={t("nav.switchReceptionist")}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[popup-open]:bg-sidebar-accent group-data-[collapsible=icon]:hidden"
            data-testid="receptionist-scope"
            role="combobox"
            aria-controls={listId}
            aria-expanded={open}
            type="button"
          />
        }
      >
        <ReceptionistInitial name={current.name} />
        <span className="ph-mask flex-1 truncate text-sm font-medium">{current.name}</span>
        <ChevronsUpDown className="size-4 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 rounded-xl p-0" id={listId}>
        <Command>
          <CommandInput placeholder={t("nav.findReceptionist")} />
          <CommandList>
            <CommandEmpty>{t("command.empty")}</CommandEmpty>
            <CommandGroup>
              {receptionists.map((item) => (
                <CommandItem
                  data-checked={item.id === current.id}
                  key={item.id}
                  onSelect={() => { setOpen(false); if (item.id !== current.id) router.push(switchReceptionistPath(pathname, item.id)); }}
                  value={`${item.name} ${item.id}`}
                >
                  <ReceptionistInitial name={item.name} />
                  <span className="ph-mask truncate">{item.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function ReceptionistItems({ agentId, section }: { agentId: string; section: ReceptionistSection }) {
  const { t } = useTranslation("receptionists");
  return (
    <SidebarGroup>
      <SidebarMenu>
        {RECEPTIONIST_SECTIONS.map((item) => <NavLink active={item === section} href={receptionistPath(agentId, item)} icon={SECTION_ICONS[item]} key={item} label={t(`sections.${item}`)} />)}
      </SidebarMenu>
    </SidebarGroup>
  );
}
