import {
  Bot,
  Command,
  ContactRound,
  House,
  MessageSquareMore,
  Phone,
  Settings,
  Workflow,
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

type AppSidebarProps = {
  businessName: string;
  businessSlug?: string;
  onSignOut: () => void;
};

export function AppSidebar({
  businessName,
  businessSlug,
  onSignOut,
  ...props
}: AppSidebarProps & React.ComponentProps<typeof Sidebar>) {
  const location = useLocation();
  const { t } = useTranslation(["common", "nav"]);

  const navigationItems = [
    { title: t("nav:items.home"), url: "/", icon: House },
    { title: t("nav:items.calls"), url: "/calls", icon: Phone },
    { title: t("nav:items.messages"), url: "/messages", icon: MessageSquareMore },
    { title: t("nav:items.automations"), url: "/automations", icon: Workflow },
    { title: t("nav:items.agent"), url: "/agent", icon: Bot },
    { title: t("nav:items.contacts"), url: "/contacts", icon: ContactRound },
    { title: t("nav:items.settings"), url: "/settings", icon: Settings },
  ];

  return (
    <Sidebar collapsible="icon" variant="sidebar" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton className="h-14 rounded-lg" size="lg">
              <div className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <Command className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{businessName}</span>
                <span className="truncate text-xs text-sidebar-foreground/70">
                  {businessSlug ?? t("nav:sidebar.businessSlugFallback")}
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarMenu>
          {navigationItems.map((item) => {
            const isActive =
              item.url === "/"
                ? location.pathname === item.url
                : location.pathname === item.url || location.pathname.startsWith(`${item.url}/`);

            return (
              <SidebarMenuItem key={item.url}>
                <SidebarMenuButton
                  className={cn(isActive && "bg-sidebar-accent text-sidebar-accent-foreground")}
                  isActive={isActive}
                  render={<NavLink to={item.url} />}
                  tooltip={item.title}
                >
                  <item.icon />
                  <span>{item.title}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={onSignOut} size="lg">
              <div className="flex size-8 items-center justify-center rounded-lg bg-sidebar-accent text-sidebar-accent-foreground">
                <Command className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{t("nav:sidebar.workspaceReady")}</span>
                <span className="truncate text-xs text-sidebar-foreground/70">
                  {t("nav:sidebar.signOut")}
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
