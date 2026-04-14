import * as React from "react";
import { useTranslation } from "react-i18next";

import { NavGroup } from "@/components/layout/nav-group";
import { NavUser } from "@/components/layout/nav-user";
import type { SidebarData } from "@/components/layout/sidebar-types";
import { TeamSwitcher } from "@/components/layout/team-switcher";
import { BookTextIcon } from "@/components/ui/book-text";
import { BotIcon } from "@/components/ui/bot";
import { BlocksIcon } from "@/components/ui/blocks";
import { ChartColumnIncreasingIcon } from "@/components/ui/chart-column-increasing";
import { ClipboardCheckIcon } from "@/components/ui/clipboard-check";
import { HomeIcon } from "@/components/ui/home";
import { IdCardIcon } from "@/components/ui/id-card";
import { MessageSquareMoreIcon } from "@/components/ui/message-square-more";
import { PhoneAnimatedIcon } from "@/components/ui/phone-animated";
import { SettingsIcon } from "@/components/ui/settings";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar";
import { UsersIcon } from "@/components/ui/users";
import { WorkflowIcon } from "@/components/ui/workflow";
import { cn } from "@/lib/utils";
import type { SidebarIconProps } from "@/components/layout/sidebar-types";

type AppSidebarProps = {
  businessName?: string;
  onSignOut: () => void;
  operatorAvatar?: string;
  operatorEmail?: string;
  operatorName?: string;
  isLoading?: boolean;
};

function createAnimatedSidebarIcon(
  Icon: React.ComponentType<any>,
) {
  return function SidebarIcon({ hovered, className }: SidebarIconProps) {
    const iconRef = React.useRef<{ startAnimation: () => void; stopAnimation: () => void } | null>(null);

    React.useEffect(() => {
      if (hovered) {
        iconRef.current?.startAnimation();
      } else {
        iconRef.current?.stopAnimation();
      }
    }, [hovered]);

    return (
      <Icon
        ref={iconRef}
        className={cn("size-4 shrink-0 [&_svg]:size-4", className)}
        size={16}
      />
    );
  };
}

const AnimatedHomeIcon = createAnimatedSidebarIcon(HomeIcon);
const AnimatedMessagesIcon = createAnimatedSidebarIcon(MessageSquareMoreIcon);
const AnimatedContactsIcon = createAnimatedSidebarIcon(UsersIcon);
const AnimatedAnalyticsIcon = createAnimatedSidebarIcon(ChartColumnIncreasingIcon);
const AnimatedAgentIcon = createAnimatedSidebarIcon(BotIcon);
const AnimatedBasicSettingsIcon = createAnimatedSidebarIcon(ClipboardCheckIcon);
const AnimatedKnowledgeIcon = createAnimatedSidebarIcon(BookTextIcon);
const AnimatedServicesIcon = createAnimatedSidebarIcon(BlocksIcon);
const AnimatedRulesIcon = createAnimatedSidebarIcon(WorkflowIcon);
const AnimatedSettingsIcon = createAnimatedSidebarIcon(SettingsIcon);
const AnimatedTeamLogo = createAnimatedSidebarIcon(IdCardIcon);
const AnimatedCallsIcon = createAnimatedSidebarIcon(PhoneAnimatedIcon);

export function AppSidebar({
  businessName,
  onSignOut,
  operatorAvatar,
  operatorEmail,
  operatorName,
  isLoading = false,
  ...props
}: AppSidebarProps & React.ComponentProps<typeof Sidebar>) {
  const { t } = useTranslation(["common", "nav", "settings", "agent"]);
  const sidebarData: SidebarData = React.useMemo(
    () => ({
      user: {
        name: operatorName ?? businessName ?? "",
        email: operatorEmail ?? "",
        ...(operatorAvatar ? { avatar: operatorAvatar } : {}),
      },
      teams: [
        {
          name: businessName ?? "",
          logo: AnimatedTeamLogo,
        },
      ],
      navGroups: [
        {
          title: t("nav:sidebar.general"),
          items: [
            { title: t("nav:items.home"), url: "/", icon: AnimatedHomeIcon },
            { title: t("nav:items.calls"), url: "/calls", icon: AnimatedCallsIcon },
            { title: t("nav:items.messages"), url: "/messages", icon: AnimatedMessagesIcon },
            { title: t("nav:items.contacts"), url: "/contacts", icon: AnimatedContactsIcon },
          ],
        },
        {
          title: t("nav:sidebar.other"),
          items: [
            { title: t("nav:items.analytics"), url: "/analytics", icon: AnimatedAnalyticsIcon },
            {
              title: t("nav:items.agent"),
              icon: AnimatedAgentIcon,
              items: [
                {
                  title: t("agent:sections.basicSettings.title"),
                  url: "/agent",
                  icon: AnimatedBasicSettingsIcon,
                },
                {
                  title: t("agent:sections.knowledge.title"),
                  url: "/agent/knowledge",
                  icon: AnimatedKnowledgeIcon,
                },
                {
                  title: t("agent:sections.services.title"),
                  url: "/agent/services",
                  icon: AnimatedServicesIcon,
                },
                {
                  title: t("agent:sections.rules.title"),
                  url: "/agent/rules",
                  icon: AnimatedRulesIcon,
                },
              ],
            },
            {
              title: t("nav:items.settings"),
              url: "/settings/usage",
              icon: AnimatedSettingsIcon,
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
        <TeamSwitcher isLoading={isLoading} teams={sidebarData.teams} />
      </SidebarHeader>
      <SidebarContent>
        {sidebarData.navGroups.map((group) => (
          <NavGroup key={group.title} {...group} />
        ))}
      </SidebarContent>
      <SidebarFooter>
        <NavUser isLoading={isLoading} onSignOut={onSignOut} user={sidebarData.user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
