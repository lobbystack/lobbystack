import * as React from "react";
import { Plus } from "lucide-react";
import {
  SidebarMenu,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import type { Team } from "@/components/layout/sidebar-types";

type TeamSwitcherProps = {
  teams: Team[];
};

export function TeamSwitcher({ teams }: TeamSwitcherProps) {
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
        <div className="flex items-center gap-3 rounded-xl bg-sidebar-accent/40 px-3 py-3 text-sidebar-foreground">
          <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <activeBusiness.logo className="size-4" />
          </div>
          <div className="grid flex-1 text-start text-sm leading-tight">
            <span className="truncate font-semibold">{activeBusiness.name}</span>
            {activeBusiness.plan ? (
              <span className="truncate text-xs">{activeBusiness.plan}</span>
            ) : null}
          </div>
        </div>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
