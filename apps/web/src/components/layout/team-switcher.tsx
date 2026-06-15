import { SidebarTeamSkeleton } from "@/components/loading-skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import {
  SidebarMenu,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

type TeamSwitcherProps = {
  isLoading?: boolean;
};

const BRAND_NAME = "LobbyStack";

export function TeamSwitcher({ isLoading = false }: TeamSwitcherProps) {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        {isLoading ? (
          <div className="flex h-12 items-center gap-2 px-2">
            <Skeleton className="size-8 rounded-xl" />
            <Skeleton className="h-6 w-32 max-w-full" />
          </div>
        ) : (
          <div
            aria-label={BRAND_NAME}
            className="flex h-14 w-full items-center gap-1.5 overflow-hidden rounded-lg px-3"
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
          </div>
        )}
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
