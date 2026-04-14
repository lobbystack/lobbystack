import * as React from "react";
import { Plus } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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

export function TeamSwitcher({ teams, isLoading = false }: TeamSwitcherProps) {
  const activeBusiness = React.useMemo<Team>(
    () =>
      teams[0] ?? {
        name: "Workspace",
        logo: Plus,
      },
    [teams],
  );

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        {isLoading ? (
          <SidebarTeamSkeleton />
        ) : (
        <SidebarMenuButton
          size="lg"
          className="text-sidebar-foreground hover:bg-transparent hover:text-sidebar-foreground"
        >
          <Avatar>
            <AvatarFallback>
              {activeBusiness.name
                .split(/\s+/)
                .map((part) => part[0]?.toUpperCase() ?? "")
                .join("")
                .slice(0, 2)}
            </AvatarFallback>
          </Avatar>
          <div className="grid flex-1 text-start leading-tight">
            <span className="truncate text-base font-semibold">{activeBusiness.name}</span>
            {activeBusiness.plan ? (
              <span className="truncate text-xs">{activeBusiness.plan}</span>
            ) : null}
          </div>
        </SidebarMenuButton>
        )}
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
