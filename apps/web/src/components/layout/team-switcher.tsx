import { SidebarTeamSkeleton } from "@/components/loading-skeletons";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import type { Team } from "@/components/layout/sidebar-types";

type TeamSwitcherProps = {
  teams: Team[];
  isLoading?: boolean;
};

const BRAND_NAME = "LobbyStack";

export function TeamSwitcher({ isLoading = false }: TeamSwitcherProps) {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        {isLoading ? (
          <SidebarTeamSkeleton />
        ) : (
          <SidebarMenuButton
            aria-label={BRAND_NAME}
            size="lg"
            className="gap-1.5 data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
          >
            <div className="flex aspect-square size-8 items-center justify-center text-sidebar-foreground">
              <img
                alt=""
                className="size-[30px] shrink-0 object-contain dark:invert"
                src="/brand/logo-icon.svg"
              />
            </div>
            <div className="flex min-w-0 flex-1 items-center overflow-hidden">
              <img
                alt=""
                className="h-[26px] w-auto max-w-44 object-contain dark:invert"
                src="/brand/logo-wordmark.svg"
              />
            </div>
          </SidebarMenuButton>
        )}
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
