import * as React from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";

import { NavGroup } from "@/components/layout/nav-group";
import { NavUser } from "@/components/layout/nav-user";
import type { SidebarData } from "@/components/layout/sidebar-types";
import { TeamSwitcher } from "@/components/layout/team-switcher";
import { WorkspaceSwitcher } from "@/components/layout/workspace-switcher";
import type { Id } from "../../../../convex/_generated/dataModel";
import { BookTextIcon } from "@/components/ui/book-text";
import { BlocksIcon } from "@/components/ui/blocks";
import { ChartColumnIncreasingIcon } from "@/components/ui/chart-column-increasing";
import { ClipboardCheckIcon } from "@/components/ui/clipboard-check";
import { HomeIcon } from "@/components/ui/home";
import { MessageSquareMoreIcon } from "@/components/ui/message-square-more";
import { PhoneAnimatedIcon } from "@/components/ui/phone-animated";
import { SettingsIcon } from "@/components/ui/settings";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { UsersIcon } from "@/components/ui/users";
import { WorkflowIcon } from "@/components/ui/workflow";
import { AI_SMS_DASHBOARD_ENABLED } from "@/lib/release-flags";
import { cn } from "@/lib/utils";
import type { SidebarIconProps } from "@/components/layout/sidebar-types";
import { SetupGuideCard } from "@/components/setup-guide-card";

type AppSidebarProps = {
  businessId?: Id<"businesses">;
  businessName?: string;
  canManageTenant?: boolean;
  onUpgradeToPro?: () => void;
  onSignOut: () => void;
  operatorAvatar?: string;
  operatorEmail?: string;
  operatorName?: string;
  showUpgradeToPro?: boolean;
  showSetupGuide?: boolean;
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
const AnimatedBasicSettingsIcon = createAnimatedSidebarIcon(ClipboardCheckIcon);
const AnimatedIntegrationsIcon = createAnimatedSidebarIcon(BlocksIcon);
const AnimatedKnowledgeIcon = createAnimatedSidebarIcon(BookTextIcon);
const AnimatedServicesIcon = createAnimatedSidebarIcon(BlocksIcon);
const AnimatedRulesIcon = createAnimatedSidebarIcon(WorkflowIcon);
const AnimatedSettingsIcon = createAnimatedSidebarIcon(SettingsIcon);
const AnimatedCallsIcon = createAnimatedSidebarIcon(PhoneAnimatedIcon);

export function AppSidebar({
  businessName,
  businessId,
  canManageTenant = true,
  onUpgradeToPro,
  onSignOut,
  operatorAvatar,
  operatorEmail,
  operatorName,
  showUpgradeToPro = false,
  showSetupGuide = false,
  isLoading = false,
  ...props
}: AppSidebarProps & React.ComponentProps<typeof Sidebar>) {
  const { t } = useTranslation(["common", "nav", "settings", "agent"]);
  const location = useLocation();
  const { isMobile, setOpenMobile } = useSidebar();
  const sidebarData: SidebarData = React.useMemo(
    () => ({
      user: {
        name: operatorName ?? businessName ?? "",
        email: operatorEmail ?? "",
        ...(operatorAvatar ? { avatar: operatorAvatar } : {}),
      },
      teams: [],
      navGroups: [
        {
          title: t("nav:sidebar.general"),
          items: [
            { title: t("nav:items.home"), url: "/", icon: AnimatedHomeIcon },
            { title: t("nav:items.calls"), url: "/calls", icon: AnimatedCallsIcon },
            ...(AI_SMS_DASHBOARD_ENABLED
              ? [{ title: t("nav:items.messages"), url: "/messages", icon: AnimatedMessagesIcon }]
              : []),
            { title: t("nav:items.contacts"), url: "/contacts", icon: AnimatedContactsIcon },
          ],
        },
        {
          title: t("nav:sidebar.agent"),
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
          title: t("nav:sidebar.other"),
          items: [
            { title: t("nav:items.analytics"), url: "/analytics", icon: AnimatedAnalyticsIcon },
            ...(canManageTenant
              ? [
                  {
                    title: t("settings:sections.integrations"),
                    url: "/integrations",
                    icon: AnimatedIntegrationsIcon,
                  },
                ]
              : []),
            {
              title: t("nav:items.settings"),
              activeMatchPrefix: "/settings",
              url: "/settings/usage",
              icon: AnimatedSettingsIcon,
            },
          ],
        },
      ],
    }),
    [businessName, canManageTenant, operatorAvatar, operatorEmail, operatorName, t],
  );

  React.useEffect(() => {
    if (!isMobile) {
      return;
    }

    // Keep the mobile sheet from trapping subsequent sidebar clicks after navigation.
    setOpenMobile(false);
  }, [isMobile, location.pathname, setOpenMobile]);

  return (
    <Sidebar collapsible="icon" variant="sidebar" {...props}>
      <SidebarHeader className="gap-1">
        <TeamSwitcher isLoading={isLoading} />
        <WorkspaceSwitcher
          isLoading={isLoading}
          {...(businessId ? { activeBusinessId: businessId } : {})}
          {...(businessName ? { businessName } : {})}
        />
      </SidebarHeader>
      <SidebarContent>
        {sidebarData.navGroups.map((group) => (
          <NavGroup key={group.title} {...group} />
        ))}
      </SidebarContent>
      <SidebarFooter>
        {businessId && showSetupGuide && !isLoading ? (
          <SetupGuideCard businessId={businessId} />
        ) : null}
        <NavUser
          isLoading={isLoading}
          onSignOut={onSignOut}
          {...(onUpgradeToPro ? { onUpgradeToPro } : {})}
          showUpgradeToPro={showUpgradeToPro}
          user={sidebarData.user}
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
