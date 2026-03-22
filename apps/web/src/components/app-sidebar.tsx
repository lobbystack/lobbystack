import * as React from "react";
import {
  Bot,
  ChartColumnIncreasing,
  ContactRound,
  House,
  Link2,
  MessageSquareMore,
  Phone,
  Settings,
  SlidersHorizontal,
  ListChecks,
  UserRound,
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
  operatorAvatar?: string;
  operatorEmail?: string;
  operatorName?: string;
};

export function AppSidebar({
  businessName,
  onSignOut,
  operatorAvatar,
  operatorEmail,
  operatorName,
  ...props
}: AppSidebarProps & React.ComponentProps<typeof Sidebar>) {
  const { t } = useTranslation(["common", "nav", "settings", "agent"]);
  const sidebarData: SidebarData = React.useMemo(
    () => ({
      user: {
        name: operatorName ?? businessName,
        email: operatorEmail ?? "",
        ...(operatorAvatar ? { avatar: operatorAvatar } : {}),
      },
      teams: [
        {
          name: t("common:appName"),
          logo: Bot,
        },
      ],
      navGroups: [
        {
          title: t("nav:sidebar.general"),
          items: [
            { title: t("nav:items.home"), url: "/", icon: House },
            { title: t("nav:items.calls"), url: "/calls", icon: Phone },
            { title: t("nav:items.messages"), url: "/messages", icon: MessageSquareMore },
            { title: t("nav:items.contacts"), url: "/contacts", icon: ContactRound },
          ],
        },
        {
          title: t("nav:sidebar.other"),
          items: [
            { title: t("nav:items.analytics"), url: "/analytics", icon: ChartColumnIncreasing },
            { title: t("nav:items.automations"), url: "/automations", icon: Workflow },
            {
              title: t("nav:items.agent"),
              icon: Bot,
              items: [
                {
                  title: t("agent:sections.basicSettings.title"),
                  url: "/agent",
                  icon: ListChecks,
                },
              ],
            },
            {
              title: t("nav:items.settings"),
              icon: Settings,
              items: [
                {
                  title: t("settings:sections.business"),
                  url: "/settings",
                  icon: UserRound,
                },
                {
                  title: t("settings:sections.appearance"),
                  url: "/settings/appearance",
                  icon: SlidersHorizontal,
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
    [businessName, operatorAvatar, operatorEmail, operatorName, t],
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
