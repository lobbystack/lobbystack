import { NavLink, useLocation } from "react-router-dom";
import {
  IconBook2,
  IconHome2,
  IconInbox,
  IconLogout2,
  IconSettings,
  IconSparkles,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

type AppSidebarProps = {
  businessName: string;
  businessSlug?: string;
  onSignOut: () => void;
};

export function AppSidebar({ businessName, businessSlug, onSignOut, ...props }: AppSidebarProps & React.ComponentProps<typeof Sidebar>) {
  const location = useLocation();
  const { t } = useTranslation(["common", "nav"]);
  const navigationItems = [
    { title: t("nav:items.dashboard"), url: "/", icon: IconHome2 },
    { title: t("nav:items.inbox"), url: "/inbox", icon: IconInbox },
    { title: t("nav:items.knowledge"), url: "/knowledge", icon: IconBook2 },
    { title: t("nav:items.settings"), url: "/settings", icon: IconSettings },
  ];

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="h-auto items-start gap-3 rounded-2xl border border-sidebar-border/70 bg-sidebar-accent/40 p-4 hover:bg-sidebar-accent"
              size="lg"
            >
              <div className="flex size-10 items-center justify-center rounded-2xl bg-sidebar-primary/10 text-sidebar-primary">
                <IconSparkles className="size-5" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{businessName}</span>
                <span className="truncate text-xs text-sidebar-foreground/70">
                  {businessSlug ? businessSlug : t("nav:sidebar.businessSlugFallback")}
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu>
          {navigationItems.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton
                className={cn(
                  "rounded-2xl",
                  (item.url === "/" ? location.pathname === item.url : location.pathname.startsWith(item.url)) &&
                    "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90 hover:text-sidebar-primary-foreground",
                )}
                isActive={item.url === "/" ? location.pathname === item.url : location.pathname.startsWith(item.url)}
                render={<NavLink to={item.url} />}
                tooltip={item.title}
              >
                <item.icon className="size-4" />
                <span>{item.title}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter>
        <div className="rounded-2xl border border-sidebar-border/70 bg-sidebar-accent/30 p-3">
          <p className="text-xs font-medium tracking-[0.24em] text-sidebar-foreground/70 uppercase">
            {t("nav:sidebar.signedIn")}
          </p>
          <p className="mt-1 text-sm font-medium text-sidebar-foreground">
            {t("nav:sidebar.workspaceReady")}
          </p>
          <Button className="mt-3 w-full justify-start" onClick={onSignOut} size="sm" variant="ghost">
            <IconLogout2 className="size-4" />
            {t("nav:sidebar.signOut")}
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
