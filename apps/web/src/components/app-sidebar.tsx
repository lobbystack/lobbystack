import * as React from "react";
import {
  Bot,
  Building2,
  Command,
  ContactRound,
  House,
  Link2,
  MessageSquareMore,
  Phone,
  Settings,
  Workflow,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { NavGroup } from "@/components/layout/nav-group";
import { NavUser } from "@/components/layout/nav-user";
import type { SidebarData } from "@/components/layout/sidebar-types";
import { TeamSwitcher } from "@/components/layout/team-switcher";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar";

type AppSidebarProps = {
  businessName: string;
  businessSlug?: string | undefined;
  onSignOut: () => void;
};

export function AppSidebar({
  businessName,
  businessSlug,
  onSignOut,
  ...props
}: AppSidebarProps & React.ComponentProps<typeof Sidebar>) {
  const { t } = useTranslation(["common", "nav", "settings"]);
  const sidebarData: SidebarData = React.useMemo(
    () => ({
      user: {
        name: "AI Receptionist",
        email: "operator@local",
      },
      teams: [
        {
          name: businessName,
          logo: Command,
          plan: businessSlug ?? t("nav:sidebar.businessSlugFallback"),
        },
      ],
      navGroups: [
        {
          title: t("nav:sidebar.general"),
          items: [
            { title: t("nav:items.home"), url: "/", icon: House },
            { title: t("nav:items.calls"), url: "/calls", icon: Phone },
            { title: t("nav:items.messages"), url: "/messages", icon: MessageSquareMore },
            { title: t("nav:items.automations"), url: "/automations", icon: Workflow },
            { title: t("nav:items.agent"), url: "/agent", icon: Bot },
            { title: t("nav:items.contacts"), url: "/contacts", icon: ContactRound },
          ],
        },
        {
          title: t("nav:sidebar.other"),
          items: [
            {
              title: t("nav:items.settings"),
              icon: Settings,
              items: [
                {
                  title: t("settings:sections.business"),
                  url: "/settings",
                  icon: Building2,
                },
                {
                  title: t("settings:sections.integrations"),
                  url: "/settings/integrations",
                  icon: Link2,
                },
              ],
            },
          ],
        },
      ],
    }),
    [businessName, businessSlug, t],
  );

  return (
    <Sidebar collapsible="icon" variant="sidebar" {...props}>
      <SidebarHeader>
        <TeamSwitcher teams={sidebarData.teams} />
      </SidebarHeader>
      <SidebarContent>
        {sidebarData.navGroups.map((group) => (
          <NavGroup key={group.title} {...group} />
        ))}
      </SidebarContent>
      <SidebarFooter>
        <NavUser onSignOut={onSignOut} user={sidebarData.user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
